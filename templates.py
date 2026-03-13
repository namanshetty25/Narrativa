# ============================================
# FILE: templates.py
# HTML Slide Renderer — 13 layout types
# ============================================

import os


def render_slide(slide: dict) -> str:
    """Render a slide plan dict into a standalone 1920x1080 HTML file."""
    title = slide.get("title", "Untitled")
    content = slide.get("content", [])
    layout = slide.get("layout", "text_only")
    images = slide.get("images", [])
    styles = slide.get("styles", {})

    # Theme defaults
    font_family = styles.get("font_family", "'Inter', 'Segoe UI', system-ui, sans-serif")
    heading_color = styles.get("heading_color", "#0F172A")
    body_color = styles.get("body_color", "#334155")
    accent_color = styles.get("accent_color", "#6366F1")
    h1_size = styles.get("h1_size", 64)
    h2_size = styles.get("h2_size", 40)
    body_size = styles.get("body_size", 26)

    # Title banner
    title_html = (
        f'<div class="title-banner">'
        f'<h1 style="font-size:{h1_size}px; color:#FFFFFF; '
        f'margin:0; text-align:left; padding:24px 48px; font-weight:700; letter-spacing:-0.02em;">{title}</h1></div>'
    )

    # Convert content list to HTML
    content_html = _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color, accent_color)

    # Build full HTML
    base_html = _base_html(title, font_family, heading_color, body_color, accent_color, h1_size, h2_size, body_size, title_html, styles)
    content_div = _layout_html(layout, content_html, images, styles)
    close_html = "\n    </div>\n  </div>\n</body>\n</html>\n"

    return base_html + content_div + close_html


def _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color, accent_color="#6366F1") -> str:
    """Convert a content list into HTML paragraphs, headings, and tables."""
    if not isinstance(content, list):
        return f'<p style="font-size:{body_size}px; color:{body_color}; line-height:1.6;">{content}</p>'

    html = ""
    for item in content:
        stripped = item.strip()

        # Headings
        if stripped.startswith("# "):
            heading_text = stripped[2:].strip()
            if heading_text.lower() != title.lower():
                html += (
                    f'<h1 style="font-size:{h1_size}px; color:{heading_color}; '
                    f'margin:16px 0 8px 0; font-weight:700; letter-spacing:-0.02em;">{heading_text}</h1>\n'
                )
        elif stripped.startswith("## "):
            html += (
                f'<h2 style="font-size:{h2_size}px; color:{accent_color}; '
                f'margin:12px 0 8px 0; font-weight:600; letter-spacing:-0.01em;">{stripped[3:]}</h2>\n'
            )
        elif "<table" in stripped.lower():
            html += f'<div class="table-container">{stripped}</div>\n'
        elif stripped.startswith("- ") or stripped.startswith("* "):
            bullet_text = stripped[2:].strip()
            html += (
                f'<div style="display:flex; align-items:flex-start; margin-bottom:10px; gap:14px;">'
                f'<span style="font-size:{body_size}px; color:{accent_color}; '
                f'flex-shrink:0; font-weight:700; line-height:1.6;">&#x2022;</span>'
                f'<span style="font-size:{body_size}px; color:{body_color}; '
                f'line-height:1.6;">{bullet_text}</span></div>\n'
            )
        else:
            html += (
                f'<p style="font-size:{body_size}px; color:{body_color}; '
                f'margin-bottom:16px; line-height:1.6;">{stripped}</p>\n'
            )
    return html


def _base_html(title, font_family, heading_color, body_color, accent_color, h1_size, h2_size, body_size, title_html, styles=None) -> str:
    """Generate the HTML head + opening body tags with CSS."""
    if styles is None:
        styles = {}

    bg_color = styles.get("bg_color", "#FFFFFF")
    banner_bg = styles.get("banner_bg", "#0F172A")
    accent_soft = styles.get("accent_soft", "#EEF2FF")
    border_radius = styles.get("border_radius", "14px")
    shadow = styles.get("shadow", "0 10px 30px rgba(0,0,0,0.1)")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<title>{title}</title>
<style>
  body {{ margin:0; padding:0; overflow:hidden; font-family: {font_family}; background:{bg_color}; }}
  .slide {{ width:1920px; height:1080px; display:flex; flex-direction:column; position:relative; align-items:stretch; background:{bg_color}; }}
  .title-banner {{ flex-shrink:0; width:100%; background: linear-gradient(135deg, {banner_bg} 0%, {accent_color} 100%); }}
  .content-area {{ flex:1; display:flex; flex-direction:row; overflow:hidden; }}
  .text {{ padding:48px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:flex-start; overflow-y:auto; flex:1; }}
  .text h1 {{ font-size:{h1_size}px; margin:0 0 16px 0; color:{heading_color}; font-weight:700; letter-spacing:-0.02em; }}
  .text h2 {{ font-size:{h2_size}px; margin:8px 0; color:{accent_color}; font-weight:600; }}
  .text p {{ font-size:{body_size}px; line-height:1.6; margin:0 0 14px 0; color:{body_color}; }}

  /* Image containers */
  .img-container {{ display:flex; align-items:center; justify-content:center; padding:24px; box-sizing:border-box; overflow:hidden; width:100%; height:100%; }}
  .img-container img {{ width:100%; height:100%; object-fit:contain; border-radius:{border_radius}; }}
  .img-full {{ position:absolute; top:0; left:0; width:100%; height:100%; z-index:-1; }}
  .img-full img {{ width:100%; height:100%; object-fit:cover; }}
  .overlay {{ position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; padding:80px; box-sizing:border-box; background:linear-gradient(135deg, rgba(15,23,42,0.85), rgba(99,102,241,0.7)); z-index:1; }}
  .overlay h1, .overlay h2, .overlay p, .overlay span {{ color:#FFFFFF !important; }}
  .half {{ flex:0 0 50%; display:flex; flex-direction:column; align-items:stretch; justify-content:stretch; overflow:hidden; }}
  .image-stack {{ display:flex; flex-direction:column; justify-content:center; gap:16px; padding:24px; box-sizing:border-box; height:100%; }}

  /* Hero layout */
  .hero-content {{ position:absolute; bottom:0; left:0; right:0; padding:80px; z-index:2; background: linear-gradient(transparent, rgba(15,23,42,0.9)); }}
  .hero-content h1 {{ font-size:80px; color:#FFFFFF; font-weight:800; letter-spacing:-0.03em; margin:0 0 16px 0; }}
  .hero-content p {{ font-size:32px; color:rgba(255,255,255,0.8); margin:0; }}

  /* Big number layout */
  .big-number-container {{ display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; text-align:center; padding:60px; box-sizing:border-box; }}
  .big-number {{ font-size:160px; font-weight:800; color:{accent_color}; line-height:1; margin-bottom:24px; letter-spacing:-0.04em; }}
  .big-number-label {{ font-size:36px; color:{body_color}; font-weight:500; }}

  /* Visual focus layout */
  .visual-focus {{ display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; padding:40px; box-sizing:border-box; }}
  .visual-focus .img-container {{ flex:1; max-height:80%; }}
  .visual-focus .caption {{ font-size:{body_size}px; color:{body_color}; text-align:center; margin-top:16px; }}

  /* Comparison layout */
  .comparison-container {{ display:flex; flex-direction:row; gap:32px; width:100%; height:100%; padding:48px; box-sizing:border-box; }}
  .comparison-col {{ flex:1; background:{accent_soft}; border-radius:{border_radius}; padding:40px; display:flex; flex-direction:column; box-shadow:{shadow}; }}
  .comparison-col h2 {{ font-size:{h2_size}px; color:{accent_color}; margin:0 0 16px 0; font-weight:700; }}

  /* Step process layout */
  .steps-container {{ display:flex; flex-direction:row; gap:24px; width:100%; height:100%; padding:48px; box-sizing:border-box; align-items:center; }}
  .step {{ flex:1; background:{accent_soft}; border-radius:{border_radius}; padding:32px; text-align:center; box-shadow:{shadow}; }}
  .step-number {{ font-size:48px; font-weight:800; color:{accent_color}; margin-bottom:12px; }}
  .step-text {{ font-size:{int(body_size * 0.85)}px; color:{body_color}; line-height:1.5; }}

  /* Table styles */
  .table-container {{ width:100%; overflow-x:auto; margin:12px 0; border-radius:{border_radius}; box-shadow:{shadow}; }}
  .table-container table {{ width:100%; border-collapse:collapse; font-size:{int(body_size * 0.75)}px; }}
  .table-container th {{ background:{banner_bg}; color:#ffffff; padding:14px 18px; text-align:left; font-weight:600; }}
  .table-container td {{ padding:12px 18px; border-bottom:1px solid #E2E8F0; color:{body_color}; }}
  .table-container tr:nth-child(even) {{ background:{accent_soft}; }}
  .table-container tr:hover {{ background:#E0E7FF; }}

  /* Scrollbar hiding */
  .text::-webkit-scrollbar {{ display: none; }}
  .text {{ scrollbar-width: none; -ms-overflow-style: none; }}
</style>
</head>
<body>
  <div class="slide">
    {title_html}
    <div class="content-area">
"""


def _img_tag(img: dict, size_class: str = "") -> str:
    """Generate an <img> tag (works for both PNG and SVG files)."""
    path = img.get("path", "")
    basename = os.path.basename(path)
    url = f"../assets/{basename}"
    return f'<img src="{url}" alt="{basename}">'


def _layout_html(layout: str, content_html: str, images: list, styles: dict = None) -> str:
    """Generate the content div based on the selected layout."""
    if styles is None:
        styles = {}

    accent_color = styles.get("accent_color", "#6366F1")
    accent_soft = styles.get("accent_soft", "#EEF2FF")

    # ---- text_only ----
    if layout == "text_only" or (not images and layout not in ("big_number", "comparison", "step_process")):
        return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""

    # ---- hero_image ----
    if layout == "hero_image" and images:
        tag = _img_tag(images[0])
        # Extract first heading and first paragraph from content for the hero overlay
        return f"""
      <div class="img-full">{tag}</div>
      <div class="hero-content">
        {content_html}
      </div>"""

    # ---- big_number ----
    if layout == "big_number":
        return f"""
      <div class="big-number-container">
        {content_html}
      </div>"""

    # ---- visual_focus ----
    if layout == "visual_focus" and images:
        tag = _img_tag(images[0])
        return f"""
      <div class="visual-focus">
        <div class="img-container" style="flex:1; max-height:75%;">{tag}</div>
        <div class="caption">{content_html}</div>
      </div>"""

    # ---- comparison ----
    if layout == "comparison":
        return f"""
      <div class="comparison-container">
        {content_html}
      </div>"""

    # ---- step_process ----
    if layout == "step_process":
        return f"""
      <div class="steps-container">
        {content_html}
      </div>"""

    # ---- full_image ----
    if layout == "full_image" and images:
        tag = _img_tag(images[0])
        return f"""
      <div class="overlay">
        {content_html}
      </div>
      <div class="img-full">{tag}</div>"""

    # ---- text_left_image_right (large/medium) ----
    if layout in ("text_left_image_right_large", "text_left_image_right_medium"):
        size = "large" if "large" in layout else "medium"
        tag = _img_tag(images[0], size) if images else ""
        if not images:
            return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""
        return f"""
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>
      <div class="img-container {size} half" style="flex:0 0 50%;">
        {tag}
      </div>"""

    # ---- text_right_image_left (large/medium) ----
    if layout in ("text_right_image_left_large", "text_right_image_left_medium"):
        size = "large" if "large" in layout else "medium"
        tag = _img_tag(images[0], size) if images else ""
        if not images:
            return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""
        return f"""
      <div class="img-container {size} half" style="flex:0 0 50%;">
        {tag}
      </div>
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>"""

    # ---- text_left_two_images_right ----
    if layout == "text_left_two_images_right" and len(images) >= 2:
        tag1, tag2 = _img_tag(images[0]), _img_tag(images[1])
        return f"""
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>
      <div class="image-stack half" style="flex:0 0 50%;">
        <div class="img-container medium" style="flex:1;">{tag1}</div>
        <div class="img-container medium" style="flex:1;">{tag2}</div>
      </div>"""

    # ---- text_right_two_images_left ----
    if layout == "text_right_two_images_left" and len(images) >= 2:
        tag1, tag2 = _img_tag(images[0]), _img_tag(images[1])
        return f"""
      <div class="image-stack half" style="flex:0 0 50%;">
        <div class="img-container medium" style="flex:1;">{tag1}</div>
        <div class="img-container medium" style="flex:1;">{tag2}</div>
      </div>
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>"""

    # ---- Fallback ----
    return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""
