# Narrativa — AI-Powered Research Notebook

Narrativa is a full-stack web application that acts as your personalized AI research assistant (inspired by Google NotebookLM). Upload documents, paste web links, or add YouTube videos as sources — then let the AI generate audio podcasts, executive summaries, presentation slides, and deep-dive research reports from your knowledge base.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.5-4285F4?logo=google)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)

---

## ✨ Features

- **3-Panel Workspace** — Animated landing page + dedicated research notebook with sources panel, chat, and studio tools
- **Source Management** — Upload PDFs, paste YouTube URLs, or link to web pages to build a per-session knowledge base
- **Chat with Citations** — Ask questions against your sources; the AI responds with precise, inline citations (e.g., `[Source-1]`)
- **5 Studio Tools:**
  | Tool | Description |
  |------|-------------|
  | 🎧 Audio Overview | Generates a conversational podcast explaining your sources via TTS |
  | 📊 Executive Summary | Creates a structured one-page overview with key findings |
  | 🎨 Slides Generator | Converts PDFs into beautiful Reveal.js presentation slides |
  | 📽️ Topic to Slides | Researches any web topic and creates data-driven presentations |
  | 📚 Research Report | Writes a comprehensive academic report with references |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel (Frontend)                        │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  Next.js   │  │  API Routes  │  │  FAISS Vector Store    │   │
│  │  React UI  │──│  (Route      │──│  (in-memory, ephemeral │   │
│  │  App Router│  │   Handlers)  │  │   per cold start)      │   │
│  └────────────┘  └──────┬───────┘  └────────────────────────┘   │
│                         │                                        │
│              ┌──────────┴──────────┐                             │
│              │  Prisma ORM         │                             │
│              │  (Sessions, Sources,│                             │
│              │   Chunks, Artifacts)│                             │
│              └──────────┬──────────┘                             │
└─────────────────────────┼────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │   Neon PostgreSQL     │
              │   (Persistent DB)     │
              └───────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Render / Railway (Python Backend)              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  FastAPI    │  │  LangGraph   │  │  edge-tts              │   │
│  │  Endpoints  │──│  Agent       │──│  Text-to-Speech        │   │
│  │  /api/*     │  │  (PDF→Slides)│  │  Audio Generation      │   │
│  └────────────┘  └──────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, CSS Modules, Lucide Icons |
| **Backend API** | Next.js Route Handlers |
| **Database** | Prisma ORM → Neon PostgreSQL |
| **AI** | Google Gemini 2.5 Flash / Pro via `@google/genai` |
| **Vector Search** | Pure-JS in-memory cosine similarity search for RAG retrieval |
| **Embeddings** | Gemini Embedding API (3072-dim) |
| **Python Service** | FastAPI, LangGraph Agent, PyMuPDF, edge-tts |
| **File Storage** | Vercel Blob (production) / local `.audio/` + `.data/` (dev) |
| **Slides Engine** | Reveal.js |

---

## 🚀 Local Development Setup

### Prerequisites

- **Node.js** v18+ and npm
- **Python** 3.10+
- A [Google Gemini API key](https://aistudio.google.com/apikey)
- A PostgreSQL database ([Neon](https://neon.tech) free tier recommended)

### 1. Clone & Install

```bash
git clone <repository-url>
cd Neurals

# Install Node.js dependencies
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `GOOGLE_API_KEY` | ✅ | Same Gemini key (used by `@google/genai`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PYTHON_API_URL` | ❌ | Python backend URL (defaults to `http://localhost:8000`) |
| `BLOB_READ_WRITE_TOKEN` | ❌ | Vercel Blob token (production only) |

### 3. Initialize Database

```bash
npx prisma db push
```

### 4. Start the Python Backend

```bash
cd python_backend

# Create and activate virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Start the Next.js Dev Server

```bash
# From the repo root
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

---



## 📦 Vector Store & Data Handling

| Concern | How It Works |
|---------|-------------|
| **Document chunks** | Stored persistently in PostgreSQL via Prisma (`DocumentChunk` table) |
| **Embeddings** | Generated by Gemini Embedding API (3072-dim vectors) |
| **Vector index** | In-memory pure-JS store cached to `.data/` dir locally. On serverless environments, the index rebuilds from PostgreSQL on each cold start |
| **Audio files** | Stored in `.audio/` locally, Vercel Blob in production |
| **Slide bundles** | Generated as ZIP files by the Python backend, stored in Vercel Blob in production |

> **Note:** The `.data/` and `.audio/` directories are runtime artifacts and are gitignored. They are created automatically when the app runs locally.

---

## 📁 Folder Structure

```
Neurals/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Animated landing page
│   │   ├── notebook/[id]/      # 3-panel research workspace
│   │   ├── deck/[id]/          # Reveal.js slide viewer
│   │   └── api/                # Route Handlers (chat, upload, generate-*)
│   └── lib/                    # Shared utilities
│       ├── db.ts               # Prisma client singleton
│       ├── store.ts            # Session, source, chunk CRUD operations
│       ├── vector-store.ts     # FAISS index management
│       ├── embeddings.ts       # Gemini embedding helpers
│       ├── retrieval.ts        # RAG retrieval pipeline
│       ├── web-search.ts       # Web scraping for Topic-to-Slides
│       └── generate-text-slides.ts  # Text-based slide generation
├── prisma/
│   └── schema.prisma           # Database schema (Session, Source, Chunk, Artifact, Report)
├── python_backend/             # Standalone FastAPI service
│   ├── app.py                  # FastAPI endpoints (slides, audio)
│   ├── agent.py                # LangGraph React agent (PDF → Slides)
│   ├── tools.py                # Agent tools (analyze PDF, plan slides, etc.)
│   ├── config.py               # Gemini model configuration
│   ├── tts.py                  # edge-tts wrapper
│   ├── requirements.txt        # Python dependencies
│   └── Procfile                # Render/Railway start command
├── scripts/
│   └── youtube_transcript.py   # YouTube transcript fetcher
├── .env.example                # Environment variable template
├── package.json                # Node.js dependencies & scripts
├── next.config.ts              # Next.js config (FAISS external package)
├── prisma.config.ts            # Prisma datasource config
└── tsconfig.json               # TypeScript config
```

---

## 🤝 Contributing

Contributions and feature requests are welcome! Create a branch and submit a PR for review.

## 📄 License

This project is proprietary. All rights reserved.
