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
1. analyze_pdf_page — Extract text, render page image, AND extract embedded images from a PDF page
2. detect_assets — Detect additional visual elements (charts, diagrams) not already extracted as embedded images
3. extract_tables — Detect and extract tables from a page as structured HTML
4. process_asset — Crop a VLM-detected asset from the page image as a PNG
5. plan_slides — Plan 1-3 slides from page content, assets, and tables (theme is applied automatically)
6. bundle_slides — Bundle all slide plans into a single deck.json file for Reveal.js

WORKFLOW for each page:
1. Call analyze_pdf_page → returns text, page_image_path, AND embedded_images list
   - embedded_images are already extracted at original quality (no further processing needed!)
   - Each embedded image has: path, description, width, height
2. Call detect_assets → finds charts/diagrams that weren't embedded images
3. Call extract_tables → finds and extracts tables as HTML
4. For EACH asset from detect_assets, call process_asset to crop it
5. COMBINE embedded_images from step 1 + cropped assets from step 4 into one assets list
   - Each item should have "path" and "description"
6. Call plan_slides with page_text, the combined assets_json, and tables_json
   - NOTE: plan_slides takes only 3 arguments: page_text, assets_json, tables_json
   - Theme/styling is handled automatically — do NOT pass a theme argument
7. Call bundle_slides with slide_plans_json, the combined assets_json, output_dir

CRITICAL RULES:
- Embedded images are already saved — use them directly in the assets list
- Process pages in order
- ALWAYS assign assets to slides — do NOT create text_only slides when assets exist
- Include table HTML directly in slide content
- Prefer layouts with images when assets are available
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

    print(f"PDF: {pdf_path}")
    print(f"Output: {output_dir}")
    print(f"Pages: {start_page}-{end_page} (of {total_pages} total)")
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
    print("\nAgent starting...\n")
    result = agent.invoke({"messages": [HumanMessage(content=user_message)]})

    # Extract final message
    final_msg = result["messages"][-1]
    print("\n" + "=" * 60)
    print("Pipeline complete!")
    print("=" * 60)
    print(f"\n{final_msg.content}")

    return result
