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

    # Convert content list → HTML (headings + paragraphs, no forced bullets)
    content_html = _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color)

    # Build full HTML
    base_html = _base_html(title, font_family, heading_color, body_color, h1_size, h2_size, body_size, title_html)
    content_div = _layout_html(layout, content_html, images)
    close_html = "\n    </div>\n  </div>\n</body>\n</html>\n"

    return base_html + content_div + close_html


def _render_content(content, title, h1_size, h2_size, body_size, heading_color, body_color) -> str:
    """Convert a content list into HTML paragraphs and headings."""
    if not isinstance(content, list):
        return f'<p style="font-size:{body_size}px; color:{body_color}; line-height:1.5;">{content}</p>'

    html = ""
    for item in content:
        stripped = item.strip()
        if stripped.startswith("# "):
            heading_text = stripped[2:].strip()
            # Skip if this heading duplicates the slide title
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
        else:
            html += (
                f'<p style="font-size:{body_size}px; color:{body_color}; '
                f'margin-bottom:20px; line-height:1.5;">{stripped}</p>\n'
            )
    return html


def _base_html(title, font_family, heading_color, body_color, h1_size, h2_size, body_size, title_html) -> str:
    """Generate the HTML head + opening body tags with CSS."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  body {{ margin:0; padding:0; overflow:hidden; font-family: {font_family}; background:#ffffff; }}
  .slide {{ width:1920px; height:1080px; display:flex; flex-direction:column; position:relative; align-items:stretch; }}
  .title-banner {{ flex-shrink:0; border-bottom:1px solid #eee; width:100%; }}
  .content-area {{ flex:1; display:flex; flex-direction:row; overflow:hidden; }}
  .text {{ padding:40px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:flex-start; overflow-y:auto; flex:1; }}
  .text h1 {{ font-size:{h1_size}px; margin:0 0 20px 0; color:{heading_color}; }}
  .text h2 {{ font-size:{h2_size}px; margin:10px 0; color:{heading_color}; }}
  .text p {{ font-size:{body_size}px; line-height:1.5; margin:0 0 15px 0; color:{body_color}; hyphens:auto; }}
  .image {{ background-size:contain; background-repeat:no-repeat; background-position:center; }}
  .image.large {{ height:100%; width:100%; background-size:cover; }}
  .image.medium {{ height:70%; width:70%; margin:auto; background-size:contain; }}
  .image.full {{ position:absolute; top:0; left:0; width:100%; height:100%; z-index:-1; background-size:cover; }}
  .overlay {{ position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; padding:60px; box-sizing:border-box; background:rgba(255,255,255,0.85); z-index:1; }}
  .half {{ flex:0 0 50%; display:flex; align-items:center; justify-content:center; }}
  .image-stack {{ display:flex; flex-direction:column; justify-content:center; gap:20px; padding:20px; box-sizing:border-box; }}
  .text::-webkit-scrollbar {{ display: none; }}
  .text {{ scrollbar-width: none; -ms-overflow-style: none; }}
</style>
</head>
<body>
  <div class="slide">
    {title_html}
    <div class="content-area">
"""


def _img_url(img: dict) -> str:
    """Get relative image URL from an image assignment dict."""
    return f"../assets/{os.path.basename(img['path'])}"


def _layout_html(layout: str, content_html: str, images: list) -> str:
    """Generate the content div based on the selected layout."""

    if layout == "text_only" or not images:
        return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""

    if layout == "full_image":
        url = _img_url(images[0])
        return f"""
      <div class="overlay">
        {content_html}
      </div>
      <div class="image full" style="background-image:url('{url}');"></div>"""

    if layout in ("text_left_image_right_large", "text_left_image_right_medium"):
        size = "large" if "large" in layout else "medium"
        url = _img_url(images[0])
        return f"""
      <div class="text half">
        {content_html}
      </div>
      <div class="half">
        <div class="image {size}" style="background-image:url('{url}');"></div>
      </div>"""

    if layout in ("text_right_image_left_large", "text_right_image_left_medium"):
        size = "large" if "large" in layout else "medium"
        url = _img_url(images[0])
        return f"""
      <div class="half">
        <div class="image {size}" style="background-image:url('{url}');"></div>
      </div>
      <div class="text half">
        {content_html}
      </div>"""

    if layout == "text_left_two_images_right" and len(images) >= 2:
        url1, url2 = _img_url(images[0]), _img_url(images[1])
        return f"""
      <div class="text half">
        {content_html}
      </div>
      <div class="half image-stack">
        <div class="image medium" style="background-image:url('{url1}'); flex:1;"></div>
        <div class="image medium" style="background-image:url('{url2}'); flex:1;"></div>
      </div>"""

    if layout == "text_right_two_images_left" and len(images) >= 2:
        url1, url2 = _img_url(images[0]), _img_url(images[1])
        return f"""
      <div class="half image-stack">
        <div class="image medium" style="background-image:url('{url1}'); flex:1;"></div>
        <div class="image medium" style="background-image:url('{url2}'); flex:1;"></div>
      </div>
      <div class="text half">
        {content_html}
      </div>"""

    # Fallback
    return f"""
      <div class="text" style="width:100%;">
        {content_html}
      </div>"""
