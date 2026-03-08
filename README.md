# Narrativa

An AI-powered educational platform with two core features:

1. **📝 NotebookLM Clone** — Document upload, AI chat, and study tools (Next.js web app)
2. **🎨 Slide Generator** — PDF-to-slides AI pipeline using LangChain + Gemini (Python CLI)

---

## 🚀 Quick Start

### NotebookLM Web App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Upload PDFs and chat with AI about your documents.

### Slide Generator

```bash
# Install Python dependencies
pip install -r requirements.txt

# Set up API key
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

# Run the pipeline
python main.py --pdf input.pdf --output my_slides
```

---

## 📁 Project Structure

```
Narrativa/
├── src/                    # Next.js web app (NotebookLM clone)
│   ├── app/                # Pages and API routes
│   └── ...
├── public/                 # Static assets
├── scripts/                # Python utility scripts (TTS, YouTube)
│
├── agent.py                # LangGraph React agent (slide pipeline)
├── tools.py                # 6 LangChain tools (@tool decorated)
├── templates.py            # HTML slide renderer (8 layouts)
├── config.py               # API keys, model config, optional SAM3
├── main.py                 # CLI entry point
│
├── package.json            # Node.js dependencies
├── requirements.txt        # Python dependencies
└── .env.example            # API key template
```

---

## 🎨 Slide Generator

### Features
- **6 LangChain Tools**: analyze_pdf_page, detect_assets, extract_tables, process_asset, plan_slides, render_slides
- **Hybrid Image Extraction**: PyMuPDF for embedded images (original quality) + Gemini Vision crop for charts/diagrams
- **8 Slide Layouts**: text-only, full-image, text+image (left/right), two-image variants
- **Education Theme**: Navy blue/gray professional design with Inter font
- **Smart Table Extraction**: Tables rendered with zebra striping and styled headers
- **Optional SAM3**: GPU-accelerated segmentation for complex assets

### CLI Options

```bash
python main.py --pdf <file.pdf> --output <dir> [--pages 1-5]
```

| Flag | Description |
|------|-------------|
| `--pdf` | Input PDF file path |
| `--output` | Output directory for slides |
| `--pages` | Optional page range (e.g., `1-5`) |

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| Web Frontend | Next.js, TypeScript, React |
| Slide Pipeline | LangChain, LangGraph, Python |
| AI Models | Google Gemini 2.5 Flash & Pro |
| PDF Processing | PyMuPDF (fitz) |
| Image Processing | Pillow, NumPy |
| Segmentation | SAM3 (optional, GPU) |

---

## 📋 Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Required:
- `GOOGLE_API_KEY` — Your Google Generative AI API key

---

## 📄 License

MIT
