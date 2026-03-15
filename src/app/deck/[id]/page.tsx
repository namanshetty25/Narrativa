import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import DeckClient from './DeckClient';

// Server Component forces dynamic rendering
export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const sourceId = resolvedParams.id;

  // Strategy 1: Load deck data from database artifact (works on Vercel)
  const artifact = await prisma.artifact.findFirst({
    where: {
      id: sourceId,
      type: 'slides',
    },
    select: { content: true },
  });

  if (artifact?.content) {
    try {
      const deckData = JSON.parse(artifact.content);
      return <DeckClient deck={deckData} sourceId={sourceId} />;
    } catch (err) {
      console.error('Failed to parse deck from database artifact:', err);
    }
  }

  // Strategy 2: Fallback to local filesystem (local dev only)
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Check /tmp first (Vercel writes here), then public/slides (local dev)
    const candidates = [
      path.join('/tmp', 'slides', sourceId, 'deck.json'),
      path.join(process.cwd(), 'public', 'slides', sourceId, 'deck.json'),
    ];

    for (const deckPath of candidates) {
      if (fs.existsSync(deckPath)) {
        const rawData = fs.readFileSync(deckPath, 'utf8');
        const deckData = JSON.parse(rawData);
        return <DeckClient deck={deckData} sourceId={sourceId} />;
      }
    }
  } catch (err) {
    console.error('Failed to load deck from filesystem:', err);
  }

  notFound();
}
