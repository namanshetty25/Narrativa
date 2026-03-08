# ============================================
# FILE: agent.py
# LangChain React Agent for PDF-to-Slides
# ============================================

import json
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, SystemMessage
from config import get_flash_model
from tools import ALL_TOOLS

# ================= SYSTEM PROMPT =================

SYSTEM_PROMPT = """You are a PDF-to-Slides conversion agent. Your job is to convert PDF pages into beautiful HTML presentation slides.

You have access to these tools:
1. analyze_pdf_page — Extract text and render page image from a PDF page
2. extract_theme — Extract design theme (fonts, colors, sizes) from a PDF page
3. detect_assets — Detect visual elements (images, charts, diagrams) on a page
4. extract_tables — Detect and extract tables from a page as structured HTML
5. process_asset — Crop a detected asset from the page image as a clean PNG
6. plan_slides — Plan 1-4 slides from page content, assets, tables, and theme
7. render_slides — Render HTML slides from plans

WORKFLOW for each page:
1. Call analyze_pdf_page to get text and page image
2. Call extract_theme (ONLY for the first page — reuse the theme for all subsequent pages)
3. Call detect_assets to find visual elements on the page
4. Call extract_tables to find and extract any tables
5. For EACH detected asset, call process_asset with:
   - page_image_path from analyze_pdf_page result
   - page_num, xmin, ymin, xmax, ymax, label, asset_type from detect_assets result
   - output_dir and asset_index (0, 1, 2, etc.)
6. Collect ALL process_asset results into a JSON list, then call plan_slides
7. Call render_slides with slide_plans_json, assets_json, slide_counter, output_dir

CRITICAL RULES:
- Process pages in order from page 1 to the last page
- Track the slide_counter across pages (start at 1, use next_counter from render_slides)
- ALWAYS assign processed assets to slides — do NOT create text_only slides when assets exist
- When tables are extracted, their HTML should be included directly in the slide content
- Prefer layouts with images (text_left_image_right_large, etc.) when assets are available
- Return a summary of what was created when finished
"""


def create_pipeline_agent():
    """Create the LangChain React agent with all PDF-to-slides tools."""
    model = get_flash_model()
    agent = create_react_agent(
        model=model,
        tools=ALL_TOOLS,
        prompt=SYSTEM_PROMPT,
    )
    return agent


def run_pipeline(pdf_path: str, output_dir: str, page_range: tuple = None):
    """Run the full PDF-to-slides pipeline using the agent.

    Args:
        pdf_path: Path to the input PDF file.
        output_dir: Directory to save output slides and assets.
        page_range: Optional (start, end) page range (1-indexed, inclusive).
                    If None, processes all pages.
    """
    import fitz
    import os

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "assets"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "slides"), exist_ok=True)

    # Get total pages
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    # Determine page range
    if page_range:
        start_page, end_page = page_range
        start_page = max(1, start_page)
        end_page = min(total_pages, end_page)
    else:
        start_page, end_page = 1, total_pages

    print(f"📄 PDF: {pdf_path}")
    print(f"📁 Output: {output_dir}")
    print(f"📑 Pages: {start_page}–{end_page} (of {total_pages} total)")
    print("=" * 60)

    # Build the agent prompt
    user_message = (
        f"Convert the PDF at '{pdf_path}' into HTML slides.\n"
        f"Output directory: '{output_dir}'\n"
        f"Process pages {start_page} through {end_page}.\n"
        f"Total pages in PDF: {total_pages}.\n"
        f"Start the slide counter at 1.\n"
        f"Begin by analyzing page {start_page}."
    )

    agent = create_pipeline_agent()

    # Run the agent
    print("\n🤖 Agent starting...\n")
    result = agent.invoke({"messages": [HumanMessage(content=user_message)]})

    # Extract final message
    final_msg = result["messages"][-1]
    print("\n" + "=" * 60)
    print("✅ Pipeline complete!")
    print("=" * 60)
    print(f"\n{final_msg.content}")

    return result
