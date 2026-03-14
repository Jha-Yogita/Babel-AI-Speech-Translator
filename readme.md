# 🌍 Babel — AI Speech Translator

A **real-time speech translation application** that converts spoken language into translated speech and text using **Groq LLaMA 3.1, Faster-Whisper, and WebSockets**.

Babel enables seamless multilingual conversations by translating speech instantly, displaying subtitles, and generating translated voice responses.

---

## 🚀 Features

| Feature | Description |
|------|------|
| 🎤 Real-time Speech Translation | Converts spoken language into translated text instantly |
| 🌐 Auto Language Detection | Detects the spoken language automatically |
| 🔊 Voice Output | Generates translated speech using gTTS |
| 🗣 Conversation Mode | Two-person real-time translation |
| 📜 Live Subtitles | Displays translated captions instantly |
| 🧠 Context Awareness | Maintains conversation history for better translation |
| 📊 Confidence Score | Shows estimated translation accuracy |
| 📚 Vocabulary Extraction | Highlights key translated words |
| 📁 Transcript Export | Export conversations to TXT, JSON, or PDF |
| 🌙 Dark Mode UI | Clean Bootstrap dark theme |
| 📈 Live Audio Waveform | Displays microphone waveform |
| 🌎 30+ Languages Supported | Powered by Groq LLaMA translation capabilities |
| 🚩 Language Flags | Visual language pair indicators |

---

## 🧠 Tech Stack

| Layer | Technology |
|------|------|
| Backend | Flask |
| Speech-to-Text | Faster-Whisper |
| Translation Engine | Groq LLaMA 3.1 |
| Text-to-Speech | gTTS |
| Realtime Communication | WebSockets (Socket.IO) |
| Frontend | HTML, CSS, Bootstrap |
| Audio Processing | Web Audio API |
| Export System | Python (TXT / JSON / PDF) |

---

## 📂 Project Structure

```
babel-translator
│
├── app.py
├── translator.py
├── conversation.py
├── export.py
│
├── static
│   ├── css
│   ├── js
│   └── audio
│
├── templates
│   └── index.html
│
├── requirements.txt
└── README.md
```

---

## ⚙️ Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/babel-translator.git
cd babel-translator
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## 🔑 Environment Setup

Create the environment file:

```bash
cp .env.example .env
```

Add your **Groq API key** inside `.env`:

```
GROQ_API_KEY=your_api_key_here
```

You can obtain a free API key from:

```
https://console.groq.com
```

---

## ▶️ Running the Application

Start the server:

```bash
python app.py
```

Open the application in your browser:

```
http://localhost:8000
```

---

## 🏗 System Architecture

```
Browser
  │
  ├─ POST /translate
  │      Upload audio blob
  │
  ├─ WebSocket /socket.io
  │      Stream microphone chunks
  │
  ├─ POST /export
  │      Download transcript
  │
  └─ GET /history
         Retrieve conversation history


Flask Backend
  │
  ├── translator.py
  │      Whisper STT + Groq Translation + gTTS
  │
  ├── conversation.py
  │      Session memory manager
  │
  └── export.py
         TXT / JSON / PDF transcript generator
```

---

## 🔄 Application Workflow

1. User speaks into microphone  
2. Browser captures audio using Web Audio API  
3. Audio is transcribed using **Faster-Whisper**  
4. Text is translated using **Groq LLaMA 3.1**  
5. Translated text is converted to speech via **gTTS**  
6. Subtitles and translated audio are returned to the browser  

---

## 📊 Example Use Cases

- Real-time multilingual conversations  
- Language learning assistance  
- International meetings and communication  
- Speech-to-text translation systems  
- Travel communication tool  
