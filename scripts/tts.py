"""
Text-to-Speech script using gTTS.
Reads text from stdin, outputs MP3 to the specified file path.

Usage: python scripts/tts.py <output_file_path>
"""

import sys
import os
from gtts import gTTS


def main():
    if len(sys.argv) < 2:
        print("Error: Output file path required", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]

    # Read text from stdin
    text = sys.stdin.read().strip()

    if not text:
        print("Error: No text provided via stdin", file=sys.stderr)
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Generate speech using gTTS
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(output_path)

    # Print the output path so Node.js can read it
    print(output_path)


if __name__ == "__main__":
    main()
