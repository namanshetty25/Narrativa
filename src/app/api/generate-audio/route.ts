import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getChunks } from '@/lib/store';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Decoupled Python execution via FastAPI

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY not set.' },
        { status: 500 }
      );
    }

    const { selectedSourceIds } = await req.json().catch(() => ({ selectedSourceIds: [] }));

    // Load chunks from database
    const availableChunks = await getChunks('', selectedSourceIds);

    if (availableChunks.length === 0) {
      return NextResponse.json(
        { error: 'No sources selected or available.' },
        { status: 400 }
      );
    }

    const allContent = availableChunks
      .map((c: { text: string }, i: number) => `[Section ${i + 1}]\n${c.text}`)
      .join('\n\n---\n\n');

    const cappedContent = allContent.slice(0, 40000);

    console.log('🎙️ Generating narrator script via Gemini...');
    const ai = new GoogleGenAI({ apiKey });

    const scriptResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an expert narrator and teacher. Based on the source material below, write an engaging and informative audio script explaining the core concepts.

FORMAT:
- A single narrator speaking directly to the listener.
- Break down the information logically and clearly.
- No markdown, bullet points, or special formatting — just plain spoken text.
- Do not include speaker labels like "Narrator:". Just write the script.

STYLE RULES:
- Tone should be informative, engaging, and easy to follow.
- Use analogies and simple examples for complex ideas.
- No jargon without explanation.
- 300-400 words total.
- Never say "the document" or "the text" — talk about the topic directly.

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

    console.log(`✅ Script generated (${script.length} chars). Converting to audio via FastAPI backend...`);

    const audioId = crypto.randomUUID();
    const backendUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    
    const formData = new FormData();
    formData.append('text', script);

    const apiResponse = await fetch(`${backendUrl}/api/generate-audio`, {
      method: 'POST',
      body: formData,
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}));
      throw new Error(`Python API failed: ${errorData.error || apiResponse.statusText}`);
    }

    const audioBuffer = Buffer.from(await apiResponse.arrayBuffer());

    // Upload to Vercel blob
    let audioUrl = `/api/audio/${audioId}`; // fallback
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`audio/${audioId}.mp3`, audioBuffer, { access: 'public' });
      audioUrl = blob.url;
      console.log(`✅ Audio uploaded to Vercel Blob: ${audioUrl}`);
    } catch (e) {
      console.error('Failed to upload Audio to Vercel Blob (is BLOB_READ_WRITE_TOKEN set?):', e);
      // Fallback: Save audio locally if Blob fails
      const fs = await import('fs');
      const path = await import('path');
      const audioDir = process.env.VERCEL ? '/tmp/.audio' : path.join(process.cwd(), '.audio');
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
      fs.writeFileSync(path.join(audioDir, `${audioId}.mp3`), audioBuffer);
    }

    return NextResponse.json({
      success: true,
      audioId,
      audioUrl,
      script,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Audio generation error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
