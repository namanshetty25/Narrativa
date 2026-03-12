import { NextResponse } from 'next/server';
import { getSources } from '@/lib/store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ sources: [] });
    }

    const sources = await getSources(sessionId);
    // Return sources without the massive text field
    const mapped = sources.map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type
    }));
    return NextResponse.json({ sources: mapped });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
