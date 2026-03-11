import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import DeckClient from './DeckClient';

// Server Component forces dynamic rendering
export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  // Read the deck.json from the output folder
  const resolvedParams = await params;
  const sourceId = resolvedParams.id;
  const deckPath = path.join(process.cwd(), 'public', 'slides', sourceId, 'deck.json');

  if (!fs.existsSync(deckPath)) {
    notFound();
  }

  try {
    const rawData = fs.readFileSync(deckPath, 'utf8');
    const deckData = JSON.parse(rawData);

    // Pass the parsed JSON and source ID to the interactive Client Component
    return <DeckClient deck={deckData} sourceId={sourceId} />;
  } catch (err) {
    console.error("Failed to parse deck.json:", err);
    return (
      <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>
        <h1>Error Loading Presentation</h1>
        <p>The presentation file could not be parsed.</p>
      </div>
    );
  }
}
