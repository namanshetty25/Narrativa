import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const AUDIO_DIR = process.env.VERCEL ? '/tmp/.audio' : path.join(process.cwd(), '.audio');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Sanitize the ID to prevent path traversal
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, '');
    const filePath = path.join(AUDIO_DIR, `${safeId}.mp3`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
    }

    const audioBuffer = fs.readFileSync(filePath);
    const stat = fs.statSync(filePath);

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Audio serve error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
