import { NextRequest, NextResponse } from 'next/server';
import { loadStore, saveStore } from '@/lib/store';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = loadStore();
    store.sources = store.sources.filter(s => s.id !== id);
    store.chunks = store.chunks.filter(c => c.sourceId !== id);
    saveStore(store);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
