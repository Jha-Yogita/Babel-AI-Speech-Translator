from flask import Flask, request, jsonify, render_template, send_file
from flask_socketio import SocketIO, emit
from translator import (
    speech_to_text_with_language,
    translate_text_with_context,
    text_to_speech,
    extract_vocabulary,
    get_translation_explanation,
    calculate_confidence
)
from conversation import ConversationManager
from export import export_transcript
import os
import base64
import tempfile

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "babel-secret-key")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

conversation_manager = ConversationManager()

# ─────────────────────────────────────────────
# HTTP Routes
# ─────────────────────────────────────────────

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/translate", methods=["POST"])
def translate():
    """Full-featured translation endpoint."""
    audio = request.files.get("audio")
    target_lang = request.form.get("target", "English")
    source_lang = request.form.get("source", "auto")
    session_id = request.form.get("session_id", "default")
    voice_style = request.form.get("voice", "female")
    explain_mode = request.form.get("explain", "false").lower() == "true"
    vocab_mode = request.form.get("vocab", "false").lower() == "true"

    if not audio:
        return jsonify({"error": "No audio provided"}), 400

    os.makedirs("audio", exist_ok=True)

    orig_filename = audio.filename or "recording.webm"
    ext = os.path.splitext(orig_filename)[-1].lower() or ".webm"
    raw_path = f"audio/input_raw{ext}"
    wav_path = "audio/input.wav"

    audio.save(raw_path)

    if ext != ".wav":
        ret = os.system(f'ffmpeg -y -i "{raw_path}" -ar 16000 -ac 1 -f wav "{wav_path}" -loglevel error')
        if ret != 0:
            wav_path = raw_path
    else:
        wav_path = raw_path

    text, detected_lang, raw_segments = speech_to_text_with_language(wav_path, language_hint=source_lang)

    if not text.strip():
        return jsonify({"error": "Could not transcribe audio"}), 400

    context = conversation_manager.get_context(session_id)
    translated, confidence = translate_text_with_context(
        text, target_lang, source_lang if source_lang != "auto" else detected_lang, context
    )

    conversation_manager.add_turn(session_id, text, translated, detected_lang, target_lang)

    
    audio_file = text_to_speech(translated, voice_style, lang=target_lang)

    with open(audio_file, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    response = {
        "original": text,
        "translated": translated,
        "detected_language": detected_lang,
        "target_language": target_lang,
        "confidence": confidence,
        "audio_b64": audio_b64,
        "audio_format": "mp3",
        "turn_id": conversation_manager.get_turn_count(session_id)
    }

    if explain_mode:
        response["explanation"] = get_translation_explanation(text, translated, detected_lang, target_lang)

    if vocab_mode:
        response["vocabulary"] = extract_vocabulary(text, detected_lang)

    return jsonify(response)


@app.route("/export", methods=["POST"])
def export():
    """Export conversation transcript."""
    data = request.get_json()
    session_id = data.get("session_id", "default")
    fmt = data.get("format", "txt")  # txt, pdf, json

    turns = conversation_manager.get_history(session_id)
    if not turns:
        return jsonify({"error": "No conversation to export"}), 400

    file_path = export_transcript(turns, fmt)
    return send_file(file_path, as_attachment=True, download_name=f"transcript.{fmt}")


@app.route("/history", methods=["GET"])
def history():
    session_id = request.args.get("session_id", "default")
    return jsonify(conversation_manager.get_history(session_id))


@app.route("/clear", methods=["POST"])
def clear():
    data = request.get_json()
    session_id = data.get("session_id", "default")
    conversation_manager.clear(session_id)
    return jsonify({"status": "cleared"})




@socketio.on("audio_chunk")
def handle_audio_chunk(data):
    """
    Receive raw audio chunk from browser, transcribe+translate incrementally.
    data = { "chunk_b64": "...", "target": "English", "session_id": "...", "is_final": bool }
    """
    chunk_b64 = data.get("chunk_b64", "")
    target_lang = data.get("target", "English")
    session_id = data.get("session_id", "default")
    is_final = data.get("is_final", False)

    
    audio_bytes = base64.b64decode(chunk_b64)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        text, detected_lang, _ = speech_to_text_with_language(tmp_path)
        if text.strip():
            context = conversation_manager.get_context(session_id)
            translated, confidence = translate_text_with_context(
                text, target_lang, detected_lang, context
            )

            emit("translation_result", {
                "original": text,
                "translated": translated,
                "detected_language": detected_lang,
                "confidence": confidence,
                "is_final": is_final
            })

            if is_final:
                conversation_manager.add_turn(session_id, text, translated, detected_lang, target_lang)
                audio_file = text_to_speech(translated, "female", lang=target_lang)
                with open(audio_file, "rb") as f:
                    audio_b64 = base64.b64encode(f.read()).decode("utf-8")
                emit("audio_ready", {"audio_b64": audio_b64})
    finally:
        os.unlink(tmp_path)


@socketio.on("connect")
def on_connect():
    emit("connected", {"status": "ok"})


if __name__ == "__main__":
    os.makedirs("audio", exist_ok=True)
    socketio.run(app, debug=True, port=8000)