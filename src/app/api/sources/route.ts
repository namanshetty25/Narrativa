import { NextResponse } from 'next/server';
import { loadStore } from '@/lib/store';

export async function GET() {
  const store = loadStore();
  // Return sources without the massive text field to save bandwidth
  const sources = store.sources.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type
  }));
  return NextResponse.json({ sources });
}
