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

from config import get_flash_model, get_pro_model, get_sam3_processor

# Lazy-load SAM3 processor (only once)
_sam3_processor = None
_sam3_loaded = False


def _get_sam3():
    global _sam3_processor, _sam3_loaded
    if not _sam3_loaded:
        _sam3_processor = get_sam3_processor()
        _sam3_loaded = True
    return _sam3_processor


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


# ================================================================
# TOOL 1: Analyze PDF Page
# ================================================================

@tool
def analyze_pdf_page(pdf_path: str, page_num: int, output_dir: str) -> str:
    """Analyze a single PDF page: extract text, render page image, get dimensions.

    Args:
        pdf_path: Path to the PDF file.
        page_num: Page number (1-indexed).
        output_dir: Directory to save output assets.

    Returns:
        JSON string with page_num, text, page_image_path, width, height.
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

    result = {
        "page_num": page_num,
        "text": text,
        "page_image_path": img_path,
        "width": rect.width,
        "height": rect.height,
    }

    doc.close()
    return json.dumps(result)


# ================================================================
# TOOL 2: Extract Theme
# ================================================================

@tool
def extract_theme(pdf_path: str, page_num: int) -> str:
    """Extract design theme (fonts, colors, sizes) from a PDF page for slide styling.

    Args:
        pdf_path: Path to the PDF file.
        page_num: Page number (1-indexed) to extract theme from.

    Returns:
        JSON string with font_family, heading_color, body_color, h1_size, h2_size, body_size.
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    text_dict = page.get_text("dict")

    # Collect span info
    spans = []
    for block in text_dict["blocks"]:
        if "lines" in block:
            for line in block["lines"]:
                for span in line["spans"]:
                    color_int = span["color"]
                    r = (color_int >> 16) & 0xFF
                    g = (color_int >> 8) & 0xFF
                    b = color_int & 0xFF
                    spans.append({
                        "font": span["font"],
                        "size": round(span["size"], 1),
                        "color": f"#{r:02x}{g:02x}{b:02x}",
                        "text": span["text"].strip()[:50],
                    })

    unique_fonts = list(set(s["font"] for s in spans))
    unique_sizes = sorted(list(set(s["size"] for s in spans)), reverse=True)
    unique_colors = list(set(s["color"] for s in spans))
    doc.close()

    prompt = f"""Analyze this PDF page's text styles to extract a consistent theme for HTML slides.

Extracted data:
- Fonts: {unique_fonts}
- Sizes (sorted descending): {unique_sizes}
- Colors: {unique_colors}
- Sample spans: {json.dumps(spans[:10])}

Task:
- Map to web-safe font family (e.g., 'serif' for Times-like, 'sans-serif' for Arial-like)
- Choose primary heading color and body color (hex)
- Define size hierarchy: h1 (largest), h2 (next), body (smallest common)
- Scale down sizes 20-30% from original for better slide fit
- Ensure sizes fit 1920x1080 slide (h1 ~50-70px, body ~25-35px)

Return ONLY valid JSON:
{{
  "font_family": "sans-serif",
  "heading_color": "#000000",
  "body_color": "#333333",
  "h1_size": 60,
  "h2_size": 40,
  "body_size": 32
}}"""

    model = get_pro_model()
    response = model.invoke([HumanMessage(content=prompt)])
    theme = _safe_json(response.content, "Theme Extraction")
    return json.dumps(theme)


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
- type: "rectangular" (clean rectangular shape) or "complex" (irregular shape)
- format: "raster" (pixel-based) or "vector" (sharp lines like charts/diagrams)

Rules:
- Charts/graphs: classify as "vector" if sharp-lined
- Ignore pure text blocks, small icons, decorative lines, or borders

Return ONLY valid JSON:
{
  "detected_assets": [
    {
      "xmin": 100, "ymin": 200, "xmax": 500, "ymax": 600,
      "label": "description",
      "type": "rectangular",
      "format": "raster"
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
    pdf_path: str,
    page_num: int,
    page_width: float,
    page_height: float,
    xmin: float,
    ymin: float,
    xmax: float,
    ymax: float,
    label: str,
    asset_type: str,
    asset_format: str,
    output_dir: str,
    asset_index: int,
) -> str:
    """Process a single detected asset: crop, segment with SAM3, or extract as SVG.

    Uses Gemini Vision to verify if SAM3 segmentation is truly needed for complex types.

    Args:
        page_image_path: Path to the full page image.
        pdf_path: Path to the source PDF.
        page_num: Page number (1-indexed).
        page_width: PDF page width in points.
        page_height: PDF page height in points.
        xmin: Left coordinate (0-1000 normalized).
        ymin: Top coordinate (0-1000 normalized).
        xmax: Right coordinate (0-1000 normalized).
        ymax: Bottom coordinate (0-1000 normalized).
        label: Description of the asset.
        asset_type: "rectangular" or "complex".
        asset_format: "raster" or "vector".
        output_dir: Output directory for saved assets.
        asset_index: Index number for the output filename.

    Returns:
        JSON string with path and description of the processed asset.
    """
    assets_dir = os.path.join(output_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    pil_img = Image.open(page_image_path)
    img_w, img_h = pil_img.size

    # ---- Vector: Extract SVG from PDF structure ----
    if asset_format == "vector":
        svg_path = os.path.join(assets_dir, f"p{page_num}_asset_{asset_index}.svg")
        scale_x = page_width / img_w
        scale_y = page_height / img_h

        clip_rect = fitz.Rect(
            (xmin / 1000) * img_w * scale_x,
            (ymin / 1000) * img_h * scale_y,
            (xmax / 1000) * img_w * scale_x,
            (ymax / 1000) * img_h * scale_y,
        )

        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]
        temp_doc = fitz.open()
        new_page = temp_doc.new_page(width=clip_rect.width, height=clip_rect.height)
        new_page.show_pdf_page(new_page.rect, doc, page_num - 1, clip=clip_rect)
        svg = new_page.get_svg_image(text_as_path=True)

        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg)

        temp_doc.close()
        doc.close()

        return json.dumps({"path": svg_path, "description": label})

    # ---- Raster: Crop or Segment ----
    png_path = os.path.join(assets_dir, f"p{page_num}_asset_{asset_index}.png")

    # Simple rectangular crop
    left = int(xmin / 1000 * img_w)
    top = int(ymin / 1000 * img_h)
    right = int(xmax / 1000 * img_w)
    bottom = int(ymax / 1000 * img_h)
    cropped = pil_img.crop((left, top, right, bottom))

    if asset_type == "complex":
        # Ask Gemini Flash: does this really need segmentation?
        needs_sam = _verify_needs_segmentation(cropped, label)

        if needs_sam:
            processor = _get_sam3()
            if processor is not None:
                seg_result = _segment_with_sam3(pil_img, label, xmin, ymin, xmax, ymax, png_path, processor)
                if seg_result:
                    return json.dumps({"path": seg_result, "description": label})

    # Default: save the crop
    cropped.save(png_path, "PNG")
    return json.dumps({"path": png_path, "description": label})


def _verify_needs_segmentation(cropped_img: Image.Image, label: str) -> bool:
    """Ask Gemini Flash if this image truly needs SAM3 segmentation."""
    try:
        # Save cropped to temp for b64 encoding
        import io
        buf = io.BytesIO()
        cropped_img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()

        model = get_flash_model()
        message = HumanMessage(content=[
            {
                "type": "text",
                "text": (
                    f'This image is described as "{label}". '
                    "Does this image contain an irregular/complex shape that would benefit "
                    "from precise background-removal segmentation, or is a simple rectangular "
                    'crop sufficient? Answer ONLY with JSON: {"needs_segmentation": true/false}'
                ),
            },
            {"type": "image_url", "image_url": f"data:image/png;base64,{b64}"},
        ])
        response = model.invoke([message])
        data = _safe_json(response.content, "Segmentation Check")
        return data.get("needs_segmentation", False)
    except Exception:
        return False


def _segment_with_sam3(pil_img, description, xmin, ymin, xmax, ymax, output_path, processor):
    """Run SAM3 text-prompted segmentation. Returns output path on success, None on failure."""
    try:
        from scipy.ndimage import zoom as scipy_zoom

        inference_state = processor.set_image(pil_img)
        output = processor.set_text_prompt(state=inference_state, prompt=description)

        if "masks" not in output or len(output["masks"]) == 0:
            return None

        mask_tensor = output["masks"][0]
        mask_np = mask_tensor.cpu().detach().numpy().squeeze()

        h, w = pil_img.height, pil_img.width
        if mask_np.shape != (h, w):
            zoom_factors = (h / mask_np.shape[0], w / mask_np.shape[1])
            mask_np = scipy_zoom(mask_np.astype(float), zoom_factors)

        rgba = pil_img.convert("RGBA")
        data = np.array(rgba)
        alpha = (mask_np > 0.5).astype(np.uint8) * 255
        data[:, :, 3] = alpha
        segmented = Image.fromarray(data)

        bbox = segmented.getbbox()
        if bbox:
            segmented = segmented.crop(bbox)

        segmented.save(output_path, "PNG")
        print(f"    → SAM3 segmentation successful: {description}")
        return output_path

    except Exception as e:
        print(f"    ⚠️  SAM3 failed ({e}), falling back to crop")
        return None


# ================================================================
# TOOL 6: Plan Slides
# ================================================================

@tool
def plan_slides(page_text: str, assets_json: str, tables_json: str, theme_json: str) -> str:
    """Plan 1-4 presentation slides from page content, assets, tables, and theme.

    Uses Gemini Pro with multimodal input to create an optimal slide layout plan.

    Args:
        page_text: Extracted text from the PDF page.
        assets_json: JSON string of processed assets (list of {path, description}).
        tables_json: JSON string of extracted tables (list of {html, description}).
        theme_json: JSON string of the design theme.

    Returns:
        JSON string with array of slide plans. Each plan has title, content,
        layout, images (with indices), and styles.
    """
    assets = json.loads(assets_json)
    tables = json.loads(tables_json)
    theme = json.loads(theme_json)

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

    prompt = f"""You are a world-class presentation designer converting textbook pages into beautiful, clear slides.

Use this theme to match the original PDF style:
{json.dumps(theme)}

Task:
- Analyze the page text, available assets, and extracted tables
- Split into 1–4 logical slides (avoid overcrowding — ensure content fits without overflow)
- Preserve all important text verbatim (do not summarize or paraphrase)
- IMPORTANT: Do NOT include the slide title in the "content" array — title is handled separately
- Structure content flexibly: Use "# Heading" for h1, "## Subheading" for h2, plain strings for paragraphs
- If tables were extracted, include them in the relevant slide's content as HTML
- Use paragraphs for narrative sections; only use bullets if the original text is list-like
- Assign 0-2 most relevant assets to each slide
- Choose the most suitable layout based on content and assets

Available layouts:
- text_only: Full text, no assets
- full_image: Full slide asset with overlay text
- text_left_image_right_large: 50% left text, 50% right asset (fills height)
- text_right_image_left_large: Mirror of above
- text_left_image_right_medium: 50% left text, 50% right asset (medium size)
- text_right_image_left_medium: Mirror of above
- text_left_two_images_right: Text left (50%), two assets stacked right (50%)
- text_right_two_images_left: Mirror of above

Return ONLY a valid JSON array:
[
  {{
    "title": "Slide title (DO NOT repeat in content)",
    "content": ["# Heading", "Paragraph text.", "## Sub Heading", "More text."],
    "layout": "layout_name",
    "images": [
      {{
        "image_index": 1,
        "size": "full | large | medium",
        "position": "left | right | center"
      }}
    ],
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
# TOOL 7: Render Slides
# ================================================================

@tool
def render_slides(slide_plans_json: str, assets_json: str, slide_counter: int, output_dir: str) -> str:
    """Render planned slides as standalone HTML files.

    Args:
        slide_plans_json: JSON string of slide plans array.
        assets_json: JSON string of processed assets (for resolving image paths).
        slide_counter: Starting slide number for filenames.
        output_dir: Output directory.

    Returns:
        JSON string with list of created slide file paths and next_counter.
    """
    from templates import render_slide

    plans = json.loads(slide_plans_json)
    assets = json.loads(assets_json)
    slides_dir = os.path.join(output_dir, "slides")
    os.makedirs(slides_dir, exist_ok=True)

    html_paths = []
    counter = slide_counter

    for plan in plans:
        # Resolve image paths from asset indices
        assigned_images = []
        for img_assignment in plan.get("images", []):
            idx = img_assignment.get("image_index", 0) - 1
            if 0 <= idx < len(assets):
                assigned_images.append({
                    "path": assets[idx]["path"],
                    "size": img_assignment.get("size", "medium"),
                    "position": img_assignment.get("position", "right"),
                })
        plan["images"] = assigned_images

        html = render_slide(plan)
        slide_path = os.path.join(slides_dir, f"slide_{counter:03d}.html")
        with open(slide_path, "w", encoding="utf-8") as f:
            f.write(html)

        html_paths.append(slide_path)
        counter += 1

    return json.dumps({"paths": html_paths, "next_counter": counter})


# ================================================================
# All tools exported for agent binding
# ================================================================

ALL_TOOLS = [
    analyze_pdf_page,
    extract_theme,
    detect_assets,
    extract_tables,
    process_asset,
    plan_slides,
    render_slides,
]
