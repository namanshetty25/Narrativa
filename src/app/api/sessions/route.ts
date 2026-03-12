import { NextResponse } from 'next/server';
import { createSession, listSessions } from '@/lib/store';

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error('Failed to list sessions', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = body.title || 'New Chat';
    const id = await createSession(title);
    return NextResponse.json({ success: true, sessionId: id });
  } catch (error: any) {
    console.error('Failed to create session', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
