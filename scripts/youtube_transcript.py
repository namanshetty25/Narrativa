import sys
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

def get_transcript(video_id):
    try:
        # Retrieve the transcript data
        # We can specify languages if needed, but the API handles defaults well
        transcript = YouTubeTranscriptApi.get_transcript(video_id)

        # Use the TextFormatter to get a clean, continuous text string
        formatter = TextFormatter()
        transcript_text = formatter.format_transcript(transcript)
        
        # Print to stdout for Node.js to capture
        print(transcript_text)

    except Exception as e:
        # Print error to stderr
        print(str(e), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python youtube_transcript.py <video_id>", file=sys.stderr)
        sys.exit(1)
    
    video_id = sys.argv[1]
    get_transcript(video_id)
