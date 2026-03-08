# ============================================
# FILE: config.py
# Configuration & Model Setup
# ============================================

import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

# ================= PATHS =================
DEFAULT_OUTPUT_DIR = "output"

# ================= MODEL SETUP =================

def get_flash_model() -> ChatGoogleGenerativeAI:
    """Gemini 2.5 Flash — fast tasks: asset detection, image verification, table extraction."""
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.2,
        max_retries=2,
    )

def get_pro_model() -> ChatGoogleGenerativeAI:
    """Gemini 2.5 Pro — complex tasks: theme extraction, slide planning."""
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        temperature=0.3,
        max_retries=2,
    )

# ================= SAM3 (OPTIONAL) =================

def get_sam3_processor():
    """Load SAM3 model if GPU is available. Returns None otherwise."""
    try:
        import torch
        if not torch.cuda.is_available():
            print("⚠️  GPU unavailable: SAM3 disabled (will use crop fallback)")
            return None

        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        BPE_PATH = os.path.join(os.path.dirname(__file__), "sam3", "sam3", "assets", "bpe_simple_vocab_16e6.txt.gz")
        if not os.path.exists(BPE_PATH):
            print(f"⚠️  SAM3 BPE file not found at {BPE_PATH}: SAM3 disabled")
            return None

        device = "cuda"
        print(f"Loading SAM3 on {device}...")
        sam3_model = build_sam3_image_model(bpe_path=BPE_PATH)
        sam3_model.to(device)
        return Sam3Processor(sam3_model, confidence_threshold=0.5)

    except ImportError:
        print("⚠️  SAM3/PyTorch not installed: SAM3 disabled")
        return None
