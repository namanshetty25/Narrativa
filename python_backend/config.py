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

