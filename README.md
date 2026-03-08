# 🎨 PDF-to-Slides: AI-Powered Presentation Generator

Convert PDF documents into beautiful HTML presentation slides using an AI agent powered by **LangChain**, **LangGraph**, and **Google Gemini**.

## How It Works

A LangGraph React agent orchestrates 7 specialized tools to:

1. **Analyze** PDF pages — extract text, render high-res images
2. **Extract theme** — detect fonts, colors, sizes from the PDF
3. **Detect assets** — find images, charts, diagrams via Gemini Vision
4. **Extract tables** — detect and convert tables to structured HTML
5. **Process assets** — crop, segment (SAM3), or extract SVGs
6. **Plan slides** — AI designs 1–4 slides per page with optimal layouts
7. **Render HTML** — generate standalone 1920×1080 slide files

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up API Key

```bash
cp .env.example .env
```

Edit `.env` and add your [Google AI Studio](https://aistudio.google.com/apikey) API key:

```
GOOGLE_API_KEY=your_api_key_here
```

### 3. Run

```bash
# Convert entire PDF
python main.py --pdf input.pdf --output my_slides

# Convert specific pages only
python main.py --pdf input.pdf --output my_slides --pages 1-5

# Uses default output dir (<pdf_name>_slides)
python main.py --pdf input.pdf
```

### 4. View Slides

Open any file in `my_slides/slides/` in a browser. Each slide is a standalone HTML file at 1920×1080.

## Project Structure

```
├── main.py            # CLI entry point
├── agent.py           # LangGraph React agent
├── tools.py           # 7 LangChain @tool definitions
├── templates.py       # HTML slide renderer (8 layouts)
├── config.py          # Model setup & configuration
├── requirements.txt   # Python dependencies
├── .env.example       # API key template
└── sam3/              # SAM3 model (optional, for GPU)
```

## Available Slide Layouts

| Layout | Description |
|--------|-------------|
| `text_only` | Full-width text |
| `full_image` | Background image with text overlay |
| `text_left_image_right_large` | 50/50 split, large image |
| `text_right_image_left_large` | Mirror of above |
| `text_left_image_right_medium` | 50/50 split, medium image |
| `text_right_image_left_medium` | Mirror of above |
| `text_left_two_images_right` | Text + two stacked images |
| `text_right_two_images_left` | Mirror of above |

## Requirements

- Python 3.10+
- Google Gemini API key
- **Optional**: NVIDIA GPU + PyTorch for SAM3 segmentation (falls back to cropping without it)

## Tech Stack

- **LangChain** + **LangGraph** — agent orchestration & tool calling
- **Google Gemini 2.5** — Flash (detection) + Pro (planning)
- **PyMuPDF** — PDF text/image extraction
- **SAM3** — optional image segmentation
