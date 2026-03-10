import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { loadStore } from '@/lib/store';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const AUDIO_DIR = path.join(process.cwd(), '.audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Spawn Python gTTS process, pipe script text via stdin, wait for MP3 output.
 */
function runTTS(scriptText: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'tts.py');

    // Use the virtual environment Python
    const pythonExecutable = path.join(process.cwd(), '.venv', 'bin', 'python');
    const proc = spawn(pythonExecutable, [pythonScript, outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000, // 2 minutes for TTS only
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`TTS process exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start TTS process: ${err.message}`));
    });

    // Write script text to stdin and close it
    proc.stdin.write(scriptText);
    proc.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not set.' },
        { status: 500 }
      );
    }

    const { selectedSourceIds } = await req.json().catch(() => ({ selectedSourceIds: [] }));

    // 1. Load all source texts
    const store = loadStore();
    let availableChunks = store.chunks;
    if (selectedSourceIds && selectedSourceIds.length > 0) {
      availableChunks = availableChunks.filter(c => selectedSourceIds.includes(c.sourceId));
    }

    if (availableChunks.length === 0) {
      return NextResponse.json(
        { error: 'No sources selected or available.' },
        { status: 400 }
      );
    }

    // Gather source content (use chunks for better context)
    const allContent = availableChunks
      .map((c, i) => `[Section ${i + 1}]\n${c.text}`)
      .join('\n\n---\n\n');

    // Cap the content to avoid token limits (~40k chars)
    const cappedContent = allContent.slice(0, 40000);

    // 2. Generate narrator script via Gemini
    console.log('🎙️ Generating narrator script via Gemini...');
    const ai = new GoogleGenAI({ apiKey });

    const scriptResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are explaining something interesting to a friend in person. Based on this source material, create a casual, engaging audio explanation.

STYLE:
- Talk directly to the listener using "you" — like a one-on-one conversation
- Use natural filler phrases like "So basically...", "Here's the thing...", "Now this is where it gets interesting...", "Think of it like this...", "You know what's cool about this?"
- Ask rhetorical questions to keep the listener engaged: "Right?", "Makes sense?", "Ever wondered why...?"
- Use analogies and simple examples to explain complex ideas
- Sound enthusiastic and genuine, not robotic or formal
- Vary your sentence length — mix short punchy lines with longer explanations

RULES:
- No markdown, bullet points, or special characters
- Write ONLY spoken text
- About 300-400 words (roughly 2 minutes)
- Never say "the document" or "the text" — you just KNOW this stuff

SOURCE MATERIAL:
${cappedContent}`,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 800,
      },
    });

    const script = scriptResponse.text?.trim();
    if (!script) {
      return NextResponse.json(
        { error: 'Failed to generate audio script.' },
        { status: 500 }
      );
    }

    console.log(`✅ Script generated (${script.length} chars). Converting to audio via gTTS...`);

    // 3. Generate audio using gTTS (Python)
    const audioId = crypto.randomUUID();
    const audioFilePath = path.join(AUDIO_DIR, `${audioId}.mp3`);

    await runTTS(script, audioFilePath);

    // Verify the audio file was created
    if (!fs.existsSync(audioFilePath)) {
      return NextResponse.json(
        { error: 'Audio generation failed — file not created.' },
        { status: 500 }
      );
    }

    const stat = fs.statSync(audioFilePath);
    console.log(`✅ Audio file created: ${audioFilePath} (${(stat.size / 1024).toFixed(1)} KB)`);

    return NextResponse.json({
      success: true,
      audioId,
      audioUrl: `/api/audio/${audioId}`,
      script,
    });
  } catch (error: any) {
    console.error('Audio generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

