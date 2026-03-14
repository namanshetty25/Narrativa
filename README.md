# Narrativa: AI-Powered Research Notebook

Narrativa is a full-stack Next.js web application that acts as your personalized AI research assistant (inspired by Google's NotebookLM). You can upload documents, web links, and YouTube videos, and let the AI generate audio podcasts, executive summaries, presentation slides, and deep-dive research reports based on your sources.

## Features

- **2-Page Architecture**: A stunning, animated landing page and a dedicated 3-panel workspace for your research logic.
- **Source Management**: Upload PDFs, paste YouTube URLs, or link to web pages to build a knowledge base for your notebook.
- **Chat Interface**: Ask questions against your specific sources. The AI will respond with precise, inline citations (e.g., `[Source-1]`).
- **5 Studio Tools**: 
  - 🎧 **Audio Overview**: Generates a conversational podcast explaining your sources using TTS.
  - 📊 **Executive Summary**: Creates a structured, one-page overview with key findings.
  - 🎨 **Slides Generator**: Turns your documents into beautiful, presentation-ready slide decks.
  - 📽️ **Topic to Slides**: Researches any web topic to create data-driven presentations.
  - 📚 **Research Report**: Writes a comprehensive, strictly-formatted academic report with references.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, CSS Modules, Lucide Icons
- **Backend**: Next.js Route Handlers
- **Database**: Prisma ORM with local SQLite (`dev.db`)
- **AI Integration**: Google Gemini 2.0 Flash / Pro via `@google/genai`
- **Asset Processing**: Embedded Python scripts (PyMuPDF, gTTS, LangChain) for handling complex PDF extraction, text-to-speech generation, and slide layouts.

---

## 🚀 Setup Instructions

### 1. Prerequisites

You must have the following installed on your machine:
- **Node.js**: (v18 or higher)
- **Python**: (3.10 or higher) for local PDF parsing and TTS generation.

### 2. Clone the Repository

```bash
git clone <repository-url>
cd Narrativa
```

### 3. Install Node Dependencies

Install the necessary npm packages for the Next.js application:

```bash
npm install
```

### 4. Set Up the Python Virtual Environment

The application relies on Python scripts (located in the `./scripts/` and root directories) for heavy document processing and TTS.

```bash
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
```

### 5. Setup Environment Variables

Create a new file named `.env` in the root directory (you can copy `.env.example` if it exists).

```bash
# .env

# Your Google Gemini API Key
GOOGLE_API_KEY="your_api_key_here"

# Optional alias if you prefer
GEMINI_API_KEY="your_api_key_here"

# Database URL for Prisma (SQLite)
DATABASE_URL="file:./dev.db"
```

*Note: You can get your API key from [Google AI Studio](https://aistudio.google.com/apikey).*

### 6. Initialize the Database

Use Prisma to push the schema and create your local SQLite database (`dev.db`):

```bash
npx prisma db push
```

### 7. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to explore the application!

---
deployment trigger
## Folder Structure

```
Narrativa/
├── src/
│   ├── app/                 # Next.js App Router (Landing, API routes, Notebook workspace)
│   ├── lib/                 # Shared utilities (store.ts, vector-store.ts, web-search.ts)
│   └── components/          # Reusable UI components
├── prisma/                  # Prisma schema definition
├── scripts/                 # Python utilities (TTS, etc.)
├── .venv/                   # Python virtual environment (ignored in git)
├── .audio/                  # Generated MP3 assets (ignored in git)
└── .data/                   # local vector embeddings (ignored in git)
```

## Contributing
Contributions and feature requests are welcome! Create a branch and submit a PR for review.
