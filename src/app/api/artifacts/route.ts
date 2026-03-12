import { NextResponse } from 'next/server';
import { getArtifacts, saveArtifact, Artifact } from '@/lib/store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ artifacts: [] });
    }

    const artifacts = await getArtifacts(sessionId);
    return NextResponse.json({ artifacts });
  } catch (error) {
    console.error('Failed to get artifacts', error);
    return NextResponse.json({ error: 'Failed to get artifacts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, ...artifact } = body;

    // Basic validation
    if (!artifact.id || !artifact.type || !artifact.label || !artifact.sourceIds || !sessionId) {
      return NextResponse.json({ error: 'Missing required artifact fields' }, { status: 400 });
    }

    await saveArtifact(sessionId, artifact as Artifact);
    return NextResponse.json({ success: true, artifact });
  } catch (error) {
    console.error('Failed to save artifact', error);
    return NextResponse.json({ error: 'Failed to save artifact' }, { status: 500 });
  }
}
