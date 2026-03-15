# ============================================
# FILE: tools.py
# LangChain Tools for PDF-to-Slides Pipeline
# ============================================

import os
import re
import json
import base64
import fitz  # PyMuPDF
import numpy as np
from PIL import Image
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage

from config import get_flash_model, get_pro_model


def _img_to_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _safe_json(text: str, stage: str = "unknown"):
    """Parse JSON from LLM output, stripping markdown fences."""
    if not text or not text.strip():
        raise ValueError(f"[{stage}] LLM returned empty output")

    text = text.strip()
    text = re.sub(r"```json", "", text, flags=re.IGNORECASE)
    text = re.sub(r"```", "", text)

    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if not match:
        raise ValueError(f"[{stage}] No JSON found in LLM output")

    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as e:
        raise ValueError(f"[{stage}] Invalid JSON: {e}")


def _parse_json_safe(text: str, label: str, default=None):
    """Robustly parse JSON from agent tool input strings.

    Handles cases where the agent passes strings with unescaped backslashes,
    invalid escape sequences, or other formatting issues.
    """
    if not text or not text.strip():
        return default if default is not None else []

    # If it's already a valid JSON string, parse it directly
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fix common issue: unescaped backslashes (e.g. in Windows paths or HTML)
    try:
        fixed = text.replace("\\", "\\\\")
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Try stripping markdown fences and extracting JSON
    try:
        return _safe_json(text, label)
    except (ValueError, json.JSONDecodeError):
        pass

    print(f"  ⚠️ Could not parse {label} JSON, using default")
    return default if default is not None else []


# ================================================================
# TOOL 1: Analyze PDF Page
# ================================================================

@tool
def analyze_pdf_page(pdf_path: str, page_num: int, output_dir: str) -> str:
    """Analyze a single PDF page: extract text, render page image, and extract embedded images.

    Uses PyMuPDF to extract embedded raster images at original quality.

    Args:
        pdf_path: Path to the PDF file.
        page_num: Page number (1-indexed).
        output_dir: Directory to save output assets.

    Returns:
        JSON string with page_num, text, page_image_path, width, height,
        and embedded_images (list of extracted images with paths and bboxes).
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]

    text = page.get_text("text")
    rect = page.rect

    # Render page at 200 DPI
    assets_dir = os.path.join(output_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    img_path = os.path.join(assets_dir, f"page_{page_num}_full.png")
    pix = page.get_pixmap(dpi=200)
    pix.save(img_path)

    # Extract embedded images from PDF structure
    embedded_images = []
    image_list = page.get_images(full=True)

    for img_idx, img_info in enumerate(image_list):
        xref = img_info[0]
        try:
            base_image = doc.extract_image(xref)
            if not base_image:
                continue

            img_data = base_image["image"]
            img_ext = base_image.get("ext", "png")
            img_width = base_image.get("width", 0)
            img_height = base_image.get("height", 0)

            # Skip tiny images (icons, bullets, decorations)
            if img_width < 50 or img_height < 50:
                continue

            # Save the image — handle different formats
            img_ext = img_ext.lower()
            if img_ext in ("jpg", "jpeg", "png"):
                # Common formats — save raw bytes directly (no resampling!)
                save_name = f"p{page_num}_embedded_{img_idx}.{img_ext}"
                save_path = os.path.join(assets_dir, save_name)
                with open(save_path, "wb") as f:
                    f.write(img_data)
            else:
                # Unusual formats (CMYK, JBIG2, TIFF, etc.) — use Pixmap fallback
                save_name = f"p{page_num}_embedded_{img_idx}.png"
                save_path = os.path.join(assets_dir, save_name)
                try:
                    pix = fitz.Pixmap(doc, xref)
                    # CMYK: convert to RGB first
                    if pix.n - pix.alpha >= 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    pix.save(save_path)
                except Exception:
                    # Last resort: save raw and convert with PIL
                    raw_path = os.path.join(assets_dir, f"p{page_num}_embedded_{img_idx}_raw.{img_ext}")
                    with open(raw_path, "wb") as f:
                        f.write(img_data)
                    try:
                        pil = Image.open(raw_path).convert("RGB")
                        pil.save(save_path, "PNG")
                        os.remove(raw_path)
                    except Exception:
                        save_path = raw_path

            # Get bounding box of the image on the page
            img_rects = page.get_image_rects(xref)
            bbox = None
            if img_rects:
                r = img_rects[0]
                # Normalize to 0-1000 scale
                bbox = {
                    "xmin": int(r.x0 / rect.width * 1000),
                    "ymin": int(r.y0 / rect.height * 1000),
                    "xmax": int(r.x1 / rect.width * 1000),
                    "ymax": int(r.y1 / rect.height * 1000),
                }

            embedded_images.append({
                "path": save_path,
                "description": f"Embedded image {img_idx + 1} from page {page_num}",
                "width": img_width,
                "height": img_height,
                "bbox": bbox,
            })

        except Exception as e:
            print(f"  ⚠️ Could not extract image xref {xref}: {e}")
            continue

    result = {
        "page_num": page_num,
        "text": text,
        "page_image_path": img_path,
        "width": rect.width,
        "height": rect.height,
        "embedded_images": embedded_images,
    }

    doc.close()
    return json.dumps(result)


# ================================================================
# DEFAULT EDUCATION THEME
# ================================================================

DEFAULT_THEME = {
    "font_family": "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
    "heading_color": "#1a365d",     # Deep navy blue
    "body_color": "#4a5568",        # Warm dark gray
    "accent_color": "#2b6cb0",      # Bright blue for accents
    "bg_color": "#f7fafc",          # Light cool gray background
    "banner_bg": "#1a365d",         # Navy banner
    "banner_text": "#ffffff",       # White text on banner
    "h1_size": 56,
    "h2_size": 40,
    "body_size": 28,
}


# ================================================================
# TOOL 3: Detect Assets
# ================================================================

@tool
def detect_assets(page_image_path: str, page_num: int) -> str:
    """Detect visual elements (images, charts, diagrams, logos) in a PDF page image.

    Uses Gemini Vision to analyze the page and return bounding boxes + metadata
    for each detected visual element.

    Args:
        page_image_path: Path to the rendered page image (PNG).
        page_num: Page number for labeling.

    Returns:
        JSON string with list of detected assets, each having xmin/ymin/xmax/ymax
        (normalized 0-1000), label, type (rectangular/complex), format (raster/vector).
    """
    b64 = _img_to_b64(page_image_path)

    prompt = """Analyze this page carefully and detect ALL meaningful visual elements:
photos, product images, screenshots, charts (pie, bar, line, flowcharts),
diagrams, logos, icons, etc.

For each detected element, provide:
- Bounding box in normalized coordinates (0-1000): xmin, ymin, xmax, ymax
- label: short precise description
- type: "rectangular" (clean rectangular shape) or "complex" (irregular shape needing segmentation)

Rules:
- Make bounding boxes TIGHT around each individual element — do NOT include surrounding text
- Ignore pure text blocks, small decorative elements, page borders, or headers/footers
- Each chart/graph/diagram should be detected as a SEPARATE element

Return ONLY valid JSON:
{
  "detected_assets": [
    {
      "xmin": 100, "ymin": 200, "xmax": 500, "ymax": 600,
      "label": "description",
      "type": "rectangular"
    }
  ]
}"""

    model = get_flash_model()
    message = HumanMessage(content=[
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": f"data:image/png;base64,{b64}"},
    ])
    response = model.invoke([message])
    data = _safe_json(response.content, f"Asset Detection Page {page_num}")

    # Normalize output format
    if isinstance(data, list):
        assets = data
    elif isinstance(data, dict):
        assets = data.get("detected_assets", data.get("detected_images", []))
    else:
        assets = []

    # Filter tiny detections
    assets = [
        a for a in assets
        if isinstance(a, dict)
        and (a.get("xmax", 0) - a.get("xmin", 0)) >= 50
        and (a.get("ymax", 0) - a.get("ymin", 0)) >= 50
    ]

    return json.dumps(assets)


# ================================================================
# TOOL 4: Extract Tables
# ================================================================

@tool
def extract_tables(page_image_path: str, page_num: int) -> str:
    """Detect and extract tables from a PDF page image as structured HTML.

    Uses Gemini Vision to find tables and convert them to clean HTML <table> elements.

    Args:
        page_image_path: Path to the rendered page image (PNG).
        page_num: Page number for labeling.

    Returns:
        JSON string with list of extracted tables, each having 'html' (table HTML)
        and 'description' (brief description of the table content).
        Returns empty list if no tables found.
    """
    b64 = _img_to_b64(page_image_path)

    prompt = """Analyze this page image and detect any tables (data tables, comparison tables, etc.).

For each table found:
1. Extract ALL data accurately — preserve headers, rows, and column alignment
2. Convert to clean HTML <table> with <thead> and <tbody>
3. Provide a brief description

Return ONLY valid JSON:
{
  "tables": [
    {
      "html": "<table><thead><tr><th>Header1</th></tr></thead><tbody><tr><td>Data1</td></tr></tbody></table>",
      "description": "Brief description of what the table contains"
    }
  ]
}

If NO tables are found, return: {"tables": []}"""

    model = get_flash_model()
    message = HumanMessage(content=[
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": f"data:image/png;base64,{b64}"},
    ])
    response = model.invoke([message])
    data = _safe_json(response.content, f"Table Extraction Page {page_num}")

    tables = data.get("tables", []) if isinstance(data, dict) else []
    return json.dumps(tables)


# ================================================================
# TOOL 5: Process Asset (Crop / Segment / SVG)
# ================================================================

@tool
def process_asset(
    page_image_path: str,
    page_num: int,
    xmin: float,
    ymin: float,
    xmax: float,
    ymax: float,
    label: str,
    asset_type: str,
    output_dir: str,
    asset_index: int,
) -> str:
    """Process a single detected asset: crop from the page image as a clean PNG."""
    assets_dir = os.path.join(output_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    pil_img = Image.open(page_image_path)
    img_w, img_h = pil_img.size

    png_path = os.path.join(assets_dir, f"p{page_num}_asset_{asset_index}.png")

    # Crop the bounding box region
    left = int(xmin / 1000 * img_w)
    top = int(ymin / 1000 * img_h)
    right = int(xmax / 1000 * img_w)
    bottom = int(ymax / 1000 * img_h)
    cropped = pil_img.crop((left, top, right, bottom))

    # Save the crop
    cropped.save(png_path, "PNG")
    return json.dumps({"path": png_path, "description": label})




# ================================================================
# Modern theme defaults
# ================================================================

DEFAULT_THEME = {
    "font_family": "'Inter', 'Segoe UI', system-ui, sans-serif",
    "heading_color": "#0F172A",
    "body_color": "#334155",
    "accent_color": "#6366F1",
    "accent_soft": "#EEF2FF",
    "bg_color": "#FFFFFF",
    "bg_alt": "#F8FAFC",
    "banner_bg": "#0F172A",
    "banner_text": "#FFFFFF",
    "h1_size": 52,
    "h2_size": 32,
    "body_size": 22,
    "border_radius": "14px",
    "shadow": "0 10px 30px rgba(0,0,0,0.1)",
}


# ================================================================
# TOOL 6: Plan Slides
# ================================================================

@tool
def plan_slides(page_text: str, assets_json: str, tables_json: str) -> str:
    """Plan 1-4 presentation slides from page content, assets, and tables.

    Uses Gemini Pro to create an optimal slide layout plan.
    Theme is applied automatically from the default education theme.

    Args:
        page_text: Extracted text from the PDF page.
        assets_json: JSON string of processed assets (list of {path, description}).
        tables_json: JSON string of extracted tables (list of {html, description}).

    Returns:
        JSON string with array of slide plans. Each plan has title, content,
        layout, images (with indices), and styles.
    """
    # Robust JSON parsing — agent may pass strings with unescaped chars
    assets = _parse_json_safe(assets_json, "assets", default=[])
    tables = _parse_json_safe(tables_json, "tables", default=[])
    theme = DEFAULT_THEME

    # Build asset info
    asset_infos = []
    for idx, asset in enumerate(assets):
        asset_infos.append(f"Asset {idx+1}: {asset.get('description', 'Unnamed')}")
    asset_str = "\n".join(asset_infos) if asset_infos else "No visual assets available."

    # Build table info
    table_infos = []
    for idx, tbl in enumerate(tables):
        table_infos.append(f"Table {idx+1}: {tbl.get('description', 'Unnamed table')}")
    table_str = "\n".join(table_infos) if table_infos else "No tables found."

    has_assets = asset_str != "No visual assets available."

    prompt = f"""You are an elite presentation designer working at Apple / TED / Stanford.

Your task is to convert a textbook page into BEAUTIFUL presentation slides.

GOAL: Condense the material efficiently. You MUST cover the ENTIRE page text in NO MORE THAN 1 TO 3 SLIDES. Do NOT generate more than 3 slides for this page content.

CRITICAL DESIGN RULES:

1. INFORMATION DENSITY - Maximize the value of every slide without making it unreadable.

2. TEXT LIMITS{' (relaxed since no images available)' if not has_assets else ''}
   Maximum per slide:
   - {'12' if not has_assets else '8'} bullet points
   - {'25' if not has_assets else '18'} words per bullet
   - {'150' if not has_assets else '90'} words per slide total

3. VISUAL PRIORITY
   {'Since NO images are available, use rich text hierarchy with headings, subheadings, and bullets to create visual interest.' if not has_assets else 'Images and diagrams should dominate. Text SUPPORTS visuals.'}

4. TYPOGRAPHY HIERARCHY
   "# Heading" - slide headline
   "## Subheading" - supporting idea
   "- bullet" - key points
   Plain text - explanation

5. IMAGE USAGE
   {'No assets available - use text_only layout with strong visual hierarchy.' if not has_assets else 'Every slide MUST contain an image. Use large visuals. Charts must appear beside explanations.'}

6. SLIDE TYPES YOU SHOULD USE

   {'Available layouts (text-only since no assets):' if not has_assets else 'Available layouts (PREFER layouts with images):'}
   - hero_image: Large image with title overlay (great for opening slides)
   - big_number: One key statistic or idea, centered and bold
   - visual_focus: Large diagram center, minimal text
   - text_left_image_right_large: 50/50 split, image right - BEST for charts
   - text_right_image_left_large: Mirror of above
   - text_left_image_right_medium: 50/50 split, medium image
   - text_right_image_left_medium: Mirror of above
   - text_left_two_images_right: Text + two stacked images
   - text_right_two_images_left: Mirror of above
   - comparison: Two columns for comparing concepts
   - step_process: 3-4 steps shown horizontally
   - full_image: Full background image with overlay text
   {' ' if has_assets else '- text_only: Full text, no assets - USE THIS with rich formatting'}

7. TABLE RULES
   If tables exist, convert into visual comparison slides or include HTML table.

Return ONLY a valid JSON array:
[
  {{
    "title": "Slide title (DO NOT repeat in content)",
    "content": ["# Heading", "## Subheading", "- Key point 1", "- Key point 2"],
    "layout": "text_left_image_right_large",
    "images": [{{{{
      "image_index": 1,
      "size": "large",
      "position": "right"
    }}}}],
    "styles": {{}}
  }}
]

PAGE TEXT:
{page_text}

AVAILABLE ASSETS:
{asset_str}

EXTRACTED TABLES:
{table_str}"""

    model = get_pro_model()
    response = model.invoke([HumanMessage(content=prompt)])
    planned_slides = _safe_json(response.content, "Slide Planning")

    # Merge global theme with per-slide overrides
    for slide in planned_slides:
        slide_styles = slide.get("styles", {})
        slide["styles"] = {**theme, **slide_styles}

    return json.dumps(planned_slides)


# ================================================================
# TOOL 7: Bundle Slides (Reveal.js JSON)
# ================================================================

@tool
def bundle_slides(slide_plans_json: str, assets_json: str, output_dir: str) -> str:
    """Bundle planned slides into a single deck.json file for Reveal.js.

    Args:
        slide_plans_json: JSON string of slide plans array.
        assets_json: JSON string of processed assets (for resolving image paths).
        output_dir: Output directory where deck.json will be saved or appended to.

    Returns:
        JSON string indicating success and the number of slides bundled.
    """
    plans = _parse_json_safe(slide_plans_json, "slide_plans", default=[])
    assets = _parse_json_safe(assets_json, "assets", default=[])
    
    deck_path = os.path.join(output_dir, "deck.json")
    
    # Load existing deck if appending, else create new
    if os.path.exists(deck_path):
        with open(deck_path, "r", encoding="utf-8") as f:
            deck = json.load(f)
    else:
        deck = {
            "title": "Narrativa Presentation",
            "slides": []
        }

    for plan in plans:
        # Resolve image paths from asset indices to be relative for the web viewer
        assigned_images = []
        for img_assignment in plan.get("images", []):
            idx = img_assignment.get("image_index", 0) - 1
            if 0 <= idx < len(assets):
                # The Next.js API will serve these from the output dir
                basename = os.path.basename(assets[idx]["path"])
                assigned_images.append({
                    "path": basename,  # Just store basename, Next.js handles the rest
                    "size": img_assignment.get("size", "medium"),
                    "position": img_assignment.get("position", "right"),
                })
        plan["images"] = assigned_images
        
        # Add to deck
        deck["slides"].append(plan)

    # Save updated deck
    with open(deck_path, "w", encoding="utf-8") as f:
        json.dump(deck, f, indent=2)

    return json.dumps({"status": "success", "total_slides": len(deck["slides"])})


# ================================================================
# All tools exported for agent binding
# ================================================================

ALL_TOOLS = [
    analyze_pdf_page,
    detect_assets,
    extract_tables,
    process_asset,
    plan_slides,
    bundle_slides,
]

