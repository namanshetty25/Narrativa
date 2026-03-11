import { NextResponse } from 'next/server';
import { getArtifacts, saveArtifact, Artifact } from '@/lib/store';

export async function GET() {
  try {
    const artifacts = getArtifacts();
    return NextResponse.json({ artifacts });
  } catch (error) {
    console.error('Failed to get artifacts', error);
    return NextResponse.json({ error: 'Failed to get artifacts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const artifact = await req.json() as Artifact;
    
    // Basic validation
    if (!artifact.id || !artifact.type || !artifact.label || !artifact.sourceIds) {
      return NextResponse.json({ error: 'Missing required artifact fields' }, { status: 400 });
    }
    
    saveArtifact(artifact);
    return NextResponse.json({ success: true, artifact });
  } catch (error) {
    console.error('Failed to save artifact', error);
    return NextResponse.json({ error: 'Failed to save artifact' }, { status: 500 });
  }
}
