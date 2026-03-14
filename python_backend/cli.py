# ============================================
# FILE: main.py
# CLI Entry Point for PDF-to-Slides Pipeline
# ============================================

import argparse
import sys
from agent import run_pipeline


def main():
    parser = argparse.ArgumentParser(
        description="🎨 PDF-to-Slides: Convert PDFs into beautiful HTML presentations using AI agents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --pdf input.pdf --output slides_output
  python main.py --pdf report.pdf --output report_slides --pages 1-5
  python main.py --pdf textbook.pdf  # Uses default output dir
""",
    )
    parser.add_argument(
        "--pdf", required=True, help="Path to the input PDF file"
    )
    parser.add_argument(
        "--output", default=None, help="Output directory (default: <pdf_name>_slides)"
    )
    parser.add_argument(
        "--pages",
        default=None,
        help="Page range to process, e.g. '1-5' or '3-3' for a single page (default: all pages)",
    )

    args = parser.parse_args()

    # Validate PDF exists
    import os
    if not os.path.exists(args.pdf):
        print(f"❌ PDF not found: {args.pdf}")
        sys.exit(1)

    # Default output dir from PDF name
    if args.output is None:
        pdf_name = os.path.splitext(os.path.basename(args.pdf))[0]
        args.output = f"{pdf_name}_slides"

    # Parse page range
    page_range = None
    if args.pages:
        try:
            parts = args.pages.split("-")
            if len(parts) == 2:
                page_range = (int(parts[0]), int(parts[1]))
            elif len(parts) == 1:
                page_range = (int(parts[0]), int(parts[0]))
            else:
                raise ValueError
        except ValueError:
            print(f"❌ Invalid page range: {args.pages} (use format like '1-5')")
            sys.exit(1)

    # Run the pipeline
    print()
    print("PDF-to-Slides Pipeline")
    print("=" * 40)
    run_pipeline(args.pdf, args.output, page_range)


if __name__ == "__main__":
    main()
