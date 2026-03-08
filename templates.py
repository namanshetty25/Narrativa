# ============================================
# FILE: templates.py
# HTML Slide Renderer — 8 layout types
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
    font_family = styles.get("font_family", "'Helvetica Neue', Arial, sans-serif")
    heading_color = styles.get("heading_color", "#2c3e50")
    body_color = styles.get("body_color", "#34495e")
    h1_size = styles.get("h1_size", 72)
    h2_size = styles.get("h2_size", int(h1_size * 0.75))
    body_size = styles.get("body_size", 42)

    # Title banner
    title_html = (
        f'<div class="title-banner">'
        f'<h1 style="font-size:{h1_size}px; color:{heading_color}; '
        f'margin:0; text-align:center; padding:20px 0;">{title}</h1></div>'
    )

    # Convert content list → HTML
    content_html = _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color)

    # Build full HTML
    base_html = _base_html(title, font_family, heading_color, body_color, h1_size, h2_size, body_size, title_html)
    content_div = _layout_html(layout, content_html, images)
    close_html = "\n    </div>\n  </div>\n</body>\n</html>\n"

    return base_html + content_div + close_html


def _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color) -> str:
    """Convert a content list into HTML paragraphs, headings, and tables."""
    if not isinstance(content, list):
        return f'<p style="font-size:{body_size}px; color:{body_color}; line-height:1.5;">{content}</p>'

    html = ""
    for item in content:
        stripped = item.strip()

        # Headings
        if stripped.startswith("# "):
            heading_text = stripped[2:].strip()
            if heading_text.lower() != title.lower():
                html += (
                    f'<h1 style="font-size:{h1_size}px; color:{heading_color}; '
                    f'margin:20px 0 10px 0;">{heading_text}</h1>\n'
                )
        elif stripped.startswith("## "):
            html += (
                f'<h2 style="font-size:{h2_size}px; color:{heading_color}; '
                f'margin:15px 0 10px 0;">{stripped[3:]}</h2>\n'
            )
        elif "<table" in stripped.lower():
            # Inline table HTML — wrap in a styled container
            html += f'<div class="table-container">{stripped}</div>\n'
        elif stripped.startswith("- ") or stripped.startswith("• "):
            # Bullet point
            bullet_text = stripped[2:].strip()
            html += (
                f'<div style="display:flex; align-items:flex-start; margin-bottom:12px;">'
                f'<span style="font-size:{body_size}px; color:{heading_color}; '
                f'margin-right:15px; flex-shrink:0;">•</span>'
                f'<span style="font-size:{body_size}px; color:{body_color}; '
                f'line-height:1.5;">{bullet_text}</span></div>\n'
            )
        else:
            html += (
                f'<p style="font-size:{body_size}px; color:{body_color}; '
                f'margin-bottom:20px; line-height:1.5;">{stripped}</p>\n'
            )
    return html


def _base_html(title, font_family, heading_color, body_color, h1_size, h2_size, body_size, title_html) -> str:
    """Generate the HTML head + opening body tags with CSS."""
    # Pull education theme colors from styles (merged in plan_slides)
    bg_color = "#f7fafc"
    banner_bg = "#1a365d"
    banner_text = "#ffffff"
    accent_color = "#2b6cb0"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>{title}</title>
<style>
  body {{ margin:0; padding:0; overflow:hidden; font-family: 'Inter', {font_family}; background:{bg_color}; }}
  .slide {{ width:1920px; height:1080px; display:flex; flex-direction:column; position:relative; align-items:stretch; background:{bg_color}; }}
  .title-banner {{ flex-shrink:0; width:100%; background:{banner_bg}; border-bottom:4px solid {accent_color}; }}
  .title-banner h1 {{ color:{banner_text} !important; }}
  .content-area {{ flex:1; display:flex; flex-direction:row; overflow:hidden; }}
  .text {{ padding:40px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:flex-start; overflow-y:auto; flex:1; }}
  .text h1 {{ font-size:{h1_size}px; margin:0 0 20px 0; color:{heading_color}; font-weight:700; }}
  .text h2 {{ font-size:{h2_size}px; margin:10px 0; color:{heading_color}; font-weight:600; }}
  .text p {{ font-size:{body_size}px; line-height:1.6; margin:0 0 15px 0; color:{body_color}; }}

  /* Image containers — fill available space, maintain aspect ratio */
  .img-container {{ display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; overflow:hidden; width:100%; height:100%; }}
  .img-container img {{ width:100%; height:100%; object-fit:contain; }}
  .img-full {{ position:absolute; top:0; left:0; width:100%; height:100%; z-index:-1; }}
  .img-full img {{ width:100%; height:100%; object-fit:cover; }}
  .overlay {{ position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; padding:60px; box-sizing:border-box; background:rgba(247,250,252,0.9); z-index:1; }}
  .half {{ flex:0 0 50%; display:flex; flex-direction:column; align-items:stretch; justify-content:stretch; overflow:hidden; }}
  .image-stack {{ display:flex; flex-direction:column; justify-content:center; gap:20px; padding:20px; box-sizing:border-box; height:100%; }}

  /* Table styles — education blue theme */
  .table-container {{ width:100%; overflow-x:auto; margin:15px 0; border-radius:8px; }}
  .table-container table {{ width:100%; border-collapse:collapse; font-size:{int(body_size * 0.75)}px; }}
  .table-container th {{ background:{banner_bg}; color:#ffffff; padding:12px 16px; text-align:left; font-weight:600; border:1px solid {accent_color}; }}
  .table-container td {{ padding:10px 16px; border:1px solid #e2e8f0; color:{body_color}; }}
  .table-container tr:nth-child(even) {{ background:#edf2f7; }}
  .table-container tr:hover {{ background:#e2e8f0; }}

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


def _layout_html(layout: str, content_html: str, images: list) -> str:
    """Generate the content div based on the selected layout."""

    if layout == "text_only" or not images:
        return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""

    if layout == "full_image":
        tag = _img_tag(images[0])
        return f"""
      <div class="overlay">
        {content_html}
      </div>
      <div class="img-full">{tag}</div>"""

    if layout in ("text_left_image_right_large", "text_left_image_right_medium"):
        size = "large" if "large" in layout else "medium"
        tag = _img_tag(images[0], size)
        return f"""
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>
      <div class="img-container {size} half" style="flex:0 0 50%;">
        {tag}
      </div>"""

    if layout in ("text_right_image_left_large", "text_right_image_left_medium"):
        size = "large" if "large" in layout else "medium"
        tag = _img_tag(images[0], size)
        return f"""
      <div class="img-container {size} half" style="flex:0 0 50%;">
        {tag}
      </div>
      <div class="text half" style="flex:0 0 50%;">
        {content_html}
      </div>"""

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

    # Fallback
    return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""
