import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, renameSession } from '@/lib/store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Transform for frontend
    const messages = session.messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const sources = session.sources.map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type,
    }));

    const artifacts = session.artifacts.map((a: any) => ({
      id: a.id,
      type: a.type,
      label: a.label,
      sourceIds: JSON.parse(a.sourceIds),
      url: a.url,
      content: a.content,
      script: a.script,
      timestamp: a.createdAt.getTime(),
    }));

    const reports = session.researchReports.map((r: any) => ({
      id: r.id,
      topic: r.topic,
      content: r.content,
      papers: JSON.parse(r.papersSummary),
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages,
        sources,
        artifacts,
        reports,
      },
    });
  } catch (error: any) {
    console.error('Failed to get session', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title } = await req.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    await renameSession(id, title);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
