

from faster_whisper import WhisperModel
from groq import Groq
from gtts import gTTS
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()


def get_client():
    return Groq(api_key=os.environ.get("GROQ_API_KEY"))
whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")


LANG_CODES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "hi": "Hindi", "ja": "Japanese",
    "ko": "Korean", "zh": "Chinese", "ar": "Arabic", "ru": "Russian",
    "nl": "Dutch", "pl": "Polish", "tr": "Turkish", "vi": "Vietnamese",
    "th": "Thai", "sv": "Swedish", "da": "Danish", "fi": "Finnish",
    "he": "Hebrew", "id": "Indonesian", "ms": "Malay", "uk": "Ukrainian",
    "cs": "Czech", "ro": "Romanian", "hu": "Hungarian", "bn": "Bengali",
    "ta": "Tamil", "ur": "Urdu"
}

LANG_FLAGS = {
    "English": "🇬🇧", "Spanish": "🇪🇸", "French": "🇫🇷", "German": "🇩🇪",
    "Italian": "🇮🇹", "Portuguese": "🇧🇷", "Hindi": "🇮🇳", "Japanese": "🇯🇵",
    "Korean": "🇰🇷", "Chinese": "🇨🇳", "Arabic": "🇸🇦", "Russian": "🇷🇺",
    "Dutch": "🇳🇱", "Polish": "🇵🇱", "Turkish": "🇹🇷", "Vietnamese": "🇻🇳",
    "Thai": "🇹🇭", "Swedish": "🇸🇪", "Danish": "🇩🇰", "Finnish": "🇫🇮",
    "Hebrew": "🇮🇱", "Indonesian": "🇮🇩", "Malay": "🇲🇾", "Ukrainian": "🇺🇦",
    "Bengali": "🇧🇩", "Tamil": "🇮🇳", "Urdu": "🇵🇰"
}

GTTS_LANG_MAP = {
    "English": "en", "Spanish": "es", "French": "fr", "German": "de",
    "Italian": "it", "Portuguese": "pt", "Hindi": "hi", "Japanese": "ja",
    "Korean": "ko", "Chinese": "zh", "Arabic": "ar", "Russian": "ru",
    "Dutch": "nl", "Polish": "pl", "Turkish": "tr", "Vietnamese": "vi",
    "Thai": "th", "Swedish": "sv", "Danish": "da", "Finnish": "fi",
    "Hebrew": "iw", "Indonesian": "id", "Malay": "ms", "Ukrainian": "uk",
    "Bengali": "bn", "Tamil": "ta", "Urdu": "ur"
}



def speech_to_text_with_language(audio_path: str, language_hint: str = None):
    """
    Transcribe audio and detect language.
    language_hint: pass a lang name like "Hindi" to force Whisper to that language
                   instead of auto-detecting (improves accuracy for short phrases).
    Returns: (text, detected_language_name, segments)
    """
    hint_code = None
    if language_hint and language_hint != "auto":
        hint_code = next(
            (code for code, name in LANG_CODES.items() if name == language_hint),
            None
        )

    transcribe_kwargs = {"beam_size": 5, "vad_filter": True, "vad_parameters": {"min_silence_duration_ms": 500}}
    if hint_code:
        transcribe_kwargs["language"] = hint_code

    segments_gen, info = whisper_model.transcribe(audio_path, **transcribe_kwargs)
    segments = list(segments_gen)

    text = " ".join(seg.text.strip() for seg in segments)
    lang_code = info.language  
    lang_name = LANG_CODES.get(lang_code, lang_code.upper())

    return text.strip(), lang_name, segments



def translate_text_with_context(
    text: str,
    target_lang: str,
    source_lang: str,
    context: list = None
) -> tuple[str, float]:
    """
    Translate with conversation context for ambiguity resolution.
    Returns: (translated_text, confidence_score)
    """
    context_block = ""
    if context:
        recent = context[-4:]  
        context_block = "\n".join(
            f"[Turn {i+1}] {t['original']} → {t['translated']}"
            for i, t in enumerate(recent)
        )
        context_block = f"\nConversation context (for resolving ambiguities like 'bank', 'right', etc.):\n{context_block}\n"

    system_prompt = (
        "You are an expert translator. Provide ONLY the translation — no explanations, "
        "no preamble, no quotes. Preserve tone, formality, and meaning precisely. "
        "Use conversation context to resolve ambiguous words."
    )

    user_prompt = (
        f"{context_block}"
        f"Translate from {source_lang} to {target_lang}:\n{text}"
    )
    client = get_client()
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=500,
        temperature=0.1
    )

    translated = response.choices[0].message.content.strip()
    confidence = calculate_confidence(text, translated, response)
    return translated, confidence


def calculate_confidence(original: str, translated: str, response) -> float:
    """
    Heuristic confidence score based on:
    - Token logprobs if available
    - Length ratio sanity check
    - Presence of untranslated tokens
    """
    orig_len = len(original.split())
    trans_len = len(translated.split())

    if orig_len == 0:
        return 0.0

    ratio = trans_len / orig_len
    if 0.5 <= ratio <= 3.0:
        length_score = 1.0
    elif 0.3 <= ratio <= 4.0:
        length_score = 0.75
    else:
        length_score = 0.5

    original_words = set(original.lower().split())
    translated_words = set(translated.lower().split())
    overlap = original_words & translated_words

    overlap_penalty = max(0, (len(overlap) / max(orig_len, 1)) - 0.3) * 0.5

    base_confidence = 0.85 
    confidence = base_confidence * length_score - overlap_penalty
    confidence = max(0.1, min(1.0, confidence))

    return round(confidence * 100, 1)



def get_translation_explanation(
    original: str,
    translated: str,
    source_lang: str,
    target_lang: str
) -> list:
    """
    Word-by-word or phrase-by-phrase breakdown.
    Returns list of {"original": ..., "translation": ..., "notes": ...}
    """
    prompt = (
        f"Break down this translation from {source_lang} to {target_lang} word by word or phrase by phrase.\n\n"
        f"Original: {original}\n"
        f"Translation: {translated}\n\n"
        "Return a JSON array only (no markdown) like:\n"
        '[{"original": "word", "translation": "word", "notes": "grammar note or empty string"}]\n'
        "Keep it concise. Return ONLY the JSON array."
    )
    client = get_client()
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
        temperature=0.1
    )

    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"```json|```", "", raw).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return [{"original": original, "translation": translated, "notes": ""}]



def extract_vocabulary(text: str, source_lang: str) -> list:
    """
    Extract interesting/key vocabulary from the spoken text.
    Returns list of {"word": ..., "meaning": ..., "category": ...}
    """
    prompt = (
        f"Extract key vocabulary from this {source_lang} text for a language learner.\n"
        f"Text: {text}\n\n"
        "Return ONLY a JSON array (no markdown) like:\n"
        '[{"word": "hola", "meaning": "hello", "category": "greeting"}]\n'
        "Categories: greeting, noun, verb, adjective, phrase, expression.\n"
        "Return ONLY the JSON array. Max 8 items."
    )
    client = get_client()
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        temperature=0.2
    )

    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"```json|```", "", raw).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []



def text_to_speech(text: str, voice_style: str = "female", lang: str = "en") -> str:
    """
    Generate speech audio.
    voice_style: "female" | "male" | "slow"
    Returns path to mp3 file.
    """
    os.makedirs("audio", exist_ok=True)
    file_path = "audio/output.mp3"

    lang_code = GTTS_LANG_MAP.get(lang, "en")

    slow = voice_style == "slow"
    tts = gTTS(text=text, lang=lang_code, slow=slow)
    tts.save(file_path)

    return file_path


def get_flag(lang_name: str) -> str:
    return LANG_FLAGS.get(lang_name, "🌐")


def get_supported_languages() -> list:
    return sorted(LANG_CODES.values())