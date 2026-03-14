import os
import shutil
import tempfile
import zipfile
import asyncio
from fastapi import FastAPI, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from typing_extensions import Annotated

# Import our existing pipeline functions
from agent import run_pipeline
from tts import generate_speech

app = FastAPI(title="Narrativa AI Python API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def remove_temp_file(path: str):
    """Background task to remove temporary files/directories after response."""
    try:
        if os.path.exists(path):
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
    except Exception as e:
        print(f"Failed to remove temp file {path}: {e}")

@app.post("/api/generate-slides")
async def generate_slides_endpoint(
    background_tasks: BackgroundTasks,
    pdf: UploadFile,
    page_range: Annotated[Optional[str], Form()] = None
):
    """
    Receives a PDF, runs the LangGraph pipeline to generate slides,
    and returns a ZIP file containing deck.json and all assets.
    """
    temp_dir = tempfile.mkdtemp(prefix="narrativa_slides_")
    
    # We will clean up the entire temporary directory after the response is sent
    background_tasks.add_task(remove_temp_file, temp_dir)

    try:
        # Save uploaded PDF to temp
        pdf_path = os.path.join(temp_dir, "input.pdf")
        with open(pdf_path, "wb") as f:
            shutil.copyfileobj(pdf.file, f)
        
        # Output directory for slides
        output_dir = os.path.join(temp_dir, "output_slides")
        os.makedirs(output_dir, exist_ok=True)
        
        # Parse page range
        parsed_range = None
        if page_range:
            parts = page_range.split("-")
            if len(parts) == 2:
                parsed_range = (int(parts[0]), int(parts[1]))
            elif len(parts) == 1:
                parsed_range = (int(parts[0]), int(parts[0]))
        
        # Run pipeline
        run_pipeline(pdf_path, output_dir, parsed_range)
        
        # Verify deck.json was generated
        if not os.path.exists(os.path.join(output_dir, "deck.json")):
            return JSONResponse(status_code=500, content={"error": "Agent finished but deck.json was not created."})
            
        # Create ZIP file of the output directory
        zip_path = os.path.join(temp_dir, "slides_bundle.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(output_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, output_dir)
                    zipf.write(file_path, arcname)
        
        return FileResponse(
            zip_path, 
            media_type="application/zip", 
            filename="slides_bundle.zip"
        )
        
    except Exception as e:
        print(f"Error generating slides: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/generate-audio")
async def generate_audio_endpoint(
    background_tasks: BackgroundTasks,
    text: Annotated[str, Form()]
):
    """
    Receives text, generates TTS audio, and returns the MP3.
    """
    if not text or not text.strip():
        return JSONResponse(status_code=400, content={"error": "Text is required"})
        
    temp_dir = tempfile.mkdtemp(prefix="narrativa_audio_")
    background_tasks.add_task(remove_temp_file, temp_dir)
    
    mp3_path = os.path.join(temp_dir, "output.mp3")
    
    try:
        await generate_speech(text, mp3_path)
        
        if not os.path.exists(mp3_path):
            return JSONResponse(status_code=500, content={"error": "Failed to generate audio file."})
            
        return FileResponse(
            mp3_path,
            media_type="audio/mpeg",
            filename="narrator.mp3"
        )
        
    except Exception as e:
        print(f"Error generating audio: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    # To run locally: python app.py
    uvicorn.run(app, host="0.0.0.0", port=8000)
