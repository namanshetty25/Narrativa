"""
Text-to-Speech script using edge-tts.
Reads text from stdin, outputs MP3 to the specified file path.
Provides higher quality and better reliability than gTTS.

Usage: python scripts/tts.py <output_file_path>
"""

import sys
import os
import asyncio
import edge_tts


async def generate_speech(text, output_path):
    # Standard high-quality voice
    VOICE = "en-US-AvaNeural"
    
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(output_path)


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

    try:
        # Run the async TTS generation
        asyncio.run(generate_speech(text, output_path))
        # Print the output path so Node.js can read it
        print(output_path)
    except Exception as e:
        print(f"Error during TTS generation: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
