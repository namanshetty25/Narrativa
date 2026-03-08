import { NextRequest, NextResponse } from 'next/server';
import { loadStore, saveStore, deleteSourceAndChunks } from '@/lib/store';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Deletes both the source definition and the chunk FSS files
    deleteSourceAndChunks(id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
