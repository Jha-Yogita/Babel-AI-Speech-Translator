
const LANGUAGES = [
  { name: "English",    flag: "🇬🇧", gtts: "en" },
  { name: "Spanish",    flag: "🇪🇸", gtts: "es" },
  { name: "French",     flag: "🇫🇷", gtts: "fr" },
  { name: "German",     flag: "🇩🇪", gtts: "de" },
  { name: "Hindi",      flag: "🇮🇳", gtts: "hi" },
  { name: "Japanese",   flag: "🇯🇵", gtts: "ja" },
  { name: "Korean",     flag: "🇰🇷", gtts: "ko" },
  { name: "Chinese",    flag: "🇨🇳", gtts: "zh" },
  { name: "Arabic",     flag: "🇸🇦", gtts: "ar" },
  { name: "Russian",    flag: "🇷🇺", gtts: "ru" },
  { name: "Portuguese", flag: "🇧🇷", gtts: "pt" },
  { name: "Italian",    flag: "🇮🇹", gtts: "it" },
  { name: "Dutch",      flag: "🇳🇱", gtts: "nl" },
  { name: "Polish",     flag: "🇵🇱", gtts: "pl" },
  { name: "Turkish",    flag: "🇹🇷", gtts: "tr" },
  { name: "Vietnamese", flag: "🇻🇳", gtts: "vi" },
  { name: "Thai",       flag: "🇹🇭", gtts: "th" },
  { name: "Swedish",    flag: "🇸🇪", gtts: "sv" },
  { name: "Bengali",    flag: "🇧🇩", gtts: "bn" },
  { name: "Urdu",       flag: "🇵🇰", gtts: "ur" },
];

const SESSION_ID = "session_" + Math.random().toString(36).slice(2, 10);
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let audioCtx = null;
let analyser = null;
let waveAnimId = null;
let waveBars = [];
let audioEl = document.getElementById("audioEl");
let currentAudioB64 = null;
let convRecording = false;
let convActivePerson = null;

const socket = io();
socket.on("connected", () => console.log("WS connected"));

socket.on("translation_result", (data) => {
  updateSubtitles(data.original, data.translated, data.detected_language, data.confidence);
  if (data.is_final) addToHistory(data);
});

socket.on("audio_ready", (data) => {
  setAudio(data.audio_b64);
});

function init() {
  populateLangSelects();
  buildWaveBars(40);
  setupToggleChips();
  loadHistory();
}

function populateLangSelects() {
  const ids = ["targetLang", "convLangA", "convLangB"];
  ids.forEach(id => {
    const sel = document.getElementById(id);
    LANGUAGES.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.name;
      opt.textContent = `${l.flag} ${l.name}`;
      sel.appendChild(opt);
    });
  });

  const src = document.getElementById("sourceLang");
  LANGUAGES.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.name;
    opt.textContent = `${l.flag} ${l.name}`;
    src.appendChild(opt);
  });

  document.getElementById("targetLang").value = "English";
  document.getElementById("convLangA").value  = "Hindi";
  document.getElementById("convLangB").value  = "English";
}

function swapLanguages() {
  const src = document.getElementById("sourceLang");
  const tgt = document.getElementById("targetLang");
  const srcVal = src.value;
  const tgtVal = tgt.value;
  if (srcVal === "auto") return; 
  src.value = tgtVal;
  tgt.value = srcVal;
}

function setupToggleChips() {
  document.querySelectorAll(".toggle-chip").forEach(chip => {
    const inp = chip.querySelector("input");
    if (!inp) return;

    if (inp.type === "radio") {
      inp.addEventListener("change", () => {
        document.querySelectorAll(`[name="${inp.name}"]`).forEach(r => {
          r.closest(".toggle-chip").classList.remove("active");
        });
        chip.classList.add("active");
      });
    } else {
      inp.addEventListener("change", () => {
        chip.classList.toggle("active", inp.checked);
      });
      chip.classList.toggle("active", inp.checked);
    }
  });
}

function buildWaveBars(count) {
  const wrap = document.getElementById("waveform-wrap");
  wrap.innerHTML = "";
  waveBars = [];
  for (let i = 0; i < count; i++) {
    const bar = document.createElement("div");
    bar.className = "wave-bar";
    bar.style.height = "4px";
    wrap.appendChild(bar);
    waveBars.push(bar);
  }
}

function startWaveform(stream) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  const src = audioCtx.createMediaStreamSource(stream);
  src.connect(analyser);

  const buf = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    waveAnimId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(buf);
    waveBars.forEach((bar, i) => {
      const val = buf[Math.floor(i * buf.length / waveBars.length)] || 0;
      const h = Math.max(4, (val / 255) * 44);
      bar.style.height = h + "px";
      bar.style.opacity = 0.4 + (val / 255) * 0.6;
    });
  }
  draw();
}

function stopWaveform() {
  if (waveAnimId) cancelAnimationFrame(waveAnimId);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  waveBars.forEach(b => { b.style.height = "4px"; b.style.opacity = "1"; });
}

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    audioChunks = [];

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => sendAudio(stream);

    mediaRecorder.start();
    startWaveform(stream);
    isRecording = true;

    document.getElementById("recordBtn").classList.add("recording");
    document.getElementById("recordIcon").className = "bi bi-stop-fill";
    document.getElementById("recordLabel").textContent = "Recording... Click to stop";
    setStatus("listening", "Listening...");
    document.getElementById("originalText").textContent = "";
    document.getElementById("originalText").classList.add("typing-cursor");
  } catch (err) {
    alert("Microphone access denied: " + err.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  stopWaveform();
  isRecording = false;
  document.getElementById("recordBtn").classList.remove("recording");
  document.getElementById("recordIcon").className = "bi bi-mic-fill";
  document.getElementById("recordLabel").textContent = "Click to speak";
  document.getElementById("originalText").classList.remove("typing-cursor");
  setStatus("processing", "Processing...");
}

async function sendAudio(stream) {
  const blob = new Blob(audioChunks, { type: "audio/webm" });

  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");
  formData.append("target", document.getElementById("targetLang").value);
  formData.append("source", document.getElementById("sourceLang").value);
  formData.append("session_id", SESSION_ID);
  formData.append("voice", document.querySelector("[name='voice']:checked")?.value || "female");
  formData.append("explain", document.getElementById("optExplain").checked ? "true" : "false");
  formData.append("vocab",   document.getElementById("optVocab").checked ? "true" : "false");

  try {
    const res = await fetch("/translate", { method: "POST", body: formData });
    const data = await res.json();

    if (data.error) {
      setStatus("idle", "Idle");
      alert("Error: " + data.error);
      return;
    }

    updateSubtitles(data.original, data.translated, data.detected_language, data.confidence);
    setAudio(data.audio_b64);
    addToHistory(data);

    if (data.explanation) renderExplanation(data.explanation);
    if (data.vocabulary) renderVocabulary(data.vocabulary);

    setStatus("done", "Done");
    setTimeout(() => setStatus("idle", "Idle"), 3000);

  } catch (err) {
    setStatus("idle", "Idle");
    console.error(err);
  }
}

function updateSubtitles(original, translated, detectedLang, confidence) {
  const langData = LANGUAGES.find(l => l.name === detectedLang) || { flag: "🌐" };
  document.getElementById("detectedLangLabel").textContent =
    `${langData.flag} ${detectedLang || "Detected"}`;

  const tgtLang = document.getElementById("targetLang").value;
  const tgtData = LANGUAGES.find(l => l.name === tgtLang) || { flag: "🌐" };
  document.getElementById("targetLangLabel").textContent =
    `${tgtData.flag} ${tgtLang}`;

  document.getElementById("originalText").textContent = original;
  document.getElementById("translatedText").textContent = translated;

  if (document.getElementById("optConf").checked && confidence != null) {
    document.getElementById("confidenceBar").style.width = confidence + "%";
    document.getElementById("confidenceScore").textContent = confidence + "%";
  }
}

function renderExplanation(items) {
  const panel = document.getElementById("explainPanel");
  const tbody = document.getElementById("explainBody");
  tbody.innerHTML = "";

  if (!items || items.length === 0) { panel.classList.add("hidden"); return; }

  items.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="word-orig">${escHtml(item.original || "")}</td>
      <td class="word-trans">${escHtml(item.translation || "")}</td>
      <td style="color:var(--text-muted); font-size:0.82rem">${escHtml(item.notes || "")}</td>
    `;
    tbody.appendChild(tr);
  });

  panel.classList.remove("hidden");
}

function renderVocabulary(items) {
  const panel = document.getElementById("vocabPanel");
  const grid  = document.getElementById("vocabGrid");
  grid.innerHTML = "";

  if (!items || items.length === 0) { panel.classList.add("hidden"); return; }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "vocab-card";
    card.innerHTML = `
      <div class="vocab-word">${escHtml(item.word || "")}</div>
      <div class="vocab-meaning">${escHtml(item.meaning || "")}</div>
      <div class="vocab-category">${escHtml(item.category || "")}</div>
    `;
    grid.appendChild(card);
  });

  panel.classList.remove("hidden");
}

function setAudio(b64) {
  currentAudioB64 = b64;
  const dataUrl = `data:audio/mp3;base64,${b64}`;
  audioEl.src = dataUrl;
  document.getElementById("audioCard").classList.remove("hidden");

  audioEl.ontimeupdate = () => {
    if (audioEl.duration) {
      const pct = (audioEl.currentTime / audioEl.duration) * 100;
      document.getElementById("audioProgressFill").style.width = pct + "%";
      document.getElementById("audioDuration").textContent = fmtTime(audioEl.currentTime);
    }
  };

  audioEl.onended = () => {
    document.getElementById("playIcon").className = "bi bi-play-fill";
  };


  audioEl.play().catch(() => {});
  document.getElementById("playIcon").className = "bi bi-pause-fill";
}

function playAudio() {
  if (!audioEl.src) return;
  if (audioEl.paused) {
    audioEl.play();
    document.getElementById("playIcon").className = "bi bi-pause-fill";
  } else {
    audioEl.pause();
    document.getElementById("playIcon").className = "bi bi-play-fill";
  }
}

function seekAudio(e) {
  if (!audioEl.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * audioEl.duration;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function setStatus(type, text) {
  const badge = document.getElementById("statusBadge");
  badge.className = `status-badge status-${type}`;
  document.getElementById("statusText").textContent = text;
}

function switchTab(name) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".custom-tab").forEach(t => t.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  event.currentTarget.classList.add("active");

  if (name === "history") loadHistory();
}

let localHistory = [];

function addToHistory(data) {
  localHistory.push({
    turn: localHistory.length + 1,
    timestamp: new Date().toLocaleTimeString(),
    original: data.original,
    translated: data.translated,
    source_lang: data.detected_language || "?",
    target_lang: data.target_language || document.getElementById("targetLang").value,
    confidence: data.confidence
  });
}

function loadHistory() {
  const list = document.getElementById("historyList");
  if (localHistory.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted); font-size:0.88rem">No history yet. Start translating!</div>`;
    return;
  }

  list.innerHTML = localHistory.map(t => `
    <div class="turn-item fade-in">
      <div class="turn-header">
        <span class="turn-num">Turn ${t.turn} · ${t.timestamp}</span>
        <span class="turn-langs">
          ${getFlagFor(t.source_lang)} ${t.source_lang} → ${getFlagFor(t.target_lang)} ${t.target_lang}
          ${t.confidence ? `<span style="color:var(--accent); margin-left:8px">${t.confidence}%</span>` : ""}
        </span>
      </div>
      <div class="turn-original">${escHtml(t.original)}</div>
      <div class="turn-translated">${escHtml(t.translated)}</div>
    </div>
  `).join("");
}

function clearHistory() {
  if (!confirm("Clear all history?")) return;
  localHistory = [];
  loadHistory();
  fetch("/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION_ID })
  });
}

async function exportTranscript(fmt) {
  if (localHistory.length === 0) {
    alert("No conversation to export.");
    return;
  }

  const res = await fetch("/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION_ID, format: fmt })
  });

  if (!res.ok) { alert("Export failed."); return; }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `babel-transcript.${fmt}`;
  a.click();
  URL.revokeObjectURL(url);
}

let convSilenceTimer = null;
let convAudioCtx = null;
let convAnalyser = null;
let convSilenceCheckId = null;
let convMediaRecorder = null;
let convStream = null;

const convAudioQueue = [];
let convAudioPlaying = false;

function queueConvAudio(b64, onDone) {
  convAudioQueue.push({ b64, onDone });
  if (!convAudioPlaying) drainConvAudioQueue();
}

function drainConvAudioQueue() {
  if (convAudioQueue.length === 0) { convAudioPlaying = false; return; }
  convAudioPlaying = true;
  const { b64, onDone } = convAudioQueue.shift();
  const el = new Audio(`data:audio/mp3;base64,${b64}`);
  el.onended = () => { if (onDone) onDone(); drainConvAudioQueue(); };
  el.onerror  = () => { drainConvAudioQueue(); };
  el.play().catch(() => drainConvAudioQueue());
}

async function convSpeak(person) {
  if (convRecording && convActivePerson === person) {
    stopConvRecording(person);
    return;
  }
  if (convRecording) return;

  const langA = document.getElementById("convLangA").value;
  const langB = document.getElementById("convLangB").value;
  const srcLang = person === "A" ? langA : langB;
  const tgtLang = person === "A" ? langB : langA;

  convRecording = true;
  convActivePerson = person;

  const panel = document.getElementById(`panel${person}`);
  const btn   = document.getElementById(`btn${person}`);
  panel.classList.add("active-speaker");
  btn.innerHTML = '<i class="bi bi-stop-fill"></i>';

  const origEl = document.getElementById(`convOrig${person}`);
  origEl.textContent = "🎤 Listening...";
  origEl.classList.add("typing-cursor");

  try {
    convStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

    convMediaRecorder = new MediaRecorder(convStream, { mimeType });
    const chunks = [];

    convMediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    convMediaRecorder.onstop = async () => {
      clearConvSilenceDetect();
      convStream.getTracks().forEach(t => t.stop());
      origEl.classList.remove("typing-cursor");

      const blob = new Blob(chunks, { type: mimeType });

      if (blob.size < 3000) {
        resetConvBtn(person);
        return;
      }

      origEl.textContent = "⏳ Translating...";

      const ext  = mimeType.includes("ogg") ? "ogg" : "webm";
      const fd   = new FormData();
      fd.append("audio", blob, `conv.${ext}`);
      fd.append("target", tgtLang);
      fd.append("source", srcLang);   
      fd.append("session_id", SESSION_ID + "_conv");
      fd.append("voice", "female");

      try {
        const res  = await fetch("/translate", { method: "POST", body: fd });
        const data = await res.json();

        if (data.error) {
          origEl.textContent = "❌ " + data.error;
          resetConvBtn(person);
          return;
        }

        origEl.textContent = data.original;
        const other = person === "A" ? "B" : "A";
        const otherEl = document.getElementById(`convOrig${other}`);
        otherEl.textContent = data.translated;

        addConvFeedItem(person, data.original, data.translated, srcLang, tgtLang, data.confidence);
        if (data.audio_b64) {
          queueConvAudio(data.audio_b64);
        }

      } catch (fetchErr) {
        origEl.textContent = "❌ Network error";
      }

      resetConvBtn(person);
    };
    convMediaRecorder.start(250);
    startConvSilenceDetect(convStream, () => {
      if (convRecording && convActivePerson === person) {
        stopConvRecording(person);
      }
    });
    convSilenceTimer = setTimeout(() => {
      if (convRecording && convActivePerson === person) stopConvRecording(person);
    }, 15000);

  } catch (err) {
    convRecording = false;
    convActivePerson = null;
    panel.classList.remove("active-speaker");
    btn.innerHTML = '<i class="bi bi-mic"></i>';
    origEl.classList.remove("typing-cursor");
    alert("Microphone error: " + err.message);
  }
}

function stopConvRecording(person) {
  if (convMediaRecorder && convMediaRecorder.state !== "inactive") {
    convMediaRecorder.stop();
  }
  clearTimeout(convSilenceTimer);
}

function resetConvBtn(person) {
  convRecording = false;
  convActivePerson = null;
  document.getElementById(`panel${person}`).classList.remove("active-speaker");
  document.getElementById(`btn${person}`).innerHTML = '<i class="bi bi-mic"></i>';
}

function startConvSilenceDetect(stream, onSilence) {
  convAudioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  convAnalyser  = convAudioCtx.createAnalyser();
  convAnalyser.fftSize = 512;
  const src = convAudioCtx.createMediaStreamSource(stream);
  src.connect(convAnalyser);

  const buf = new Uint8Array(convAnalyser.fftSize);
  let silenceStart = null;
  const SILENCE_THRESHOLD = 8;   
  const SILENCE_DURATION  = 1800; 

  function check() {
    convSilenceCheckId = requestAnimationFrame(check);
    convAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length) * 100;

    if (rms < SILENCE_THRESHOLD) {
      if (!silenceStart) silenceStart = Date.now();
      else if (Date.now() - silenceStart > SILENCE_DURATION) {
        onSilence();
      }
    } else {
      silenceStart = null; 
    }
  }
  check();
}

function clearConvSilenceDetect() {
  if (convSilenceCheckId) cancelAnimationFrame(convSilenceCheckId);
  if (convAudioCtx) { convAudioCtx.close().catch(() => {}); convAudioCtx = null; }
}

function addConvFeedItem(person, original, translated, srcLang, tgtLang, confidence) {
  const feed = document.getElementById("convFeedBody");
  const placeholder = feed.querySelector(".conv-placeholder");
  if (placeholder) placeholder.remove();

  const item = document.createElement("div");
  item.className = "turn-item fade-in";
  const confBadge = confidence
    ? `<span style="color:var(--accent); font-size:0.75rem; margin-left:8px">${confidence}%</span>`
    : "";
  item.innerHTML = `
    <div class="turn-header">
      <span class="turn-num" style="color:${person === 'A' ? 'var(--accent)' : 'var(--accent-2)'}">
        Person ${person}
      </span>
      <span class="turn-langs">${getFlagFor(srcLang)} → ${getFlagFor(tgtLang)}${confBadge}</span>
    </div>
    <div class="turn-original">${escHtml(original)}</div>
    <div class="turn-translated">${escHtml(translated)}</div>
  `;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}
function getFlagFor(langName) {
  const l = LANGUAGES.find(x => x.name === langName);
  return l ? l.flag : "🌐";
}

function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.addEventListener("DOMContentLoaded", init);