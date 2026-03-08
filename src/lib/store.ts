import fs from 'fs';
import path from 'path';

export type Source = {
  id: string;
  name: string;
  type: string;
  text: string;
};

export type DocumentChunk = {
  id: string;
  sourceId: string;
  text: string;
};

type StoreData = {
  sources: Source[];
  chunks: DocumentChunk[];
};

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data) as StoreData;
    }
  } catch (error) {
    console.error("Failed to load store", error);
  }
  return { sources: [], chunks: [] };
}

export function saveStore(data: StoreData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to save store", error);
  }
}

export function deleteSourceAndChunks(id: string) {
  const store = loadStore();
  store.sources = store.sources.filter(s => s.id !== id);
  store.chunks = store.chunks.filter(c => c.sourceId !== id);
  saveStore(store);
}

export function addSourceAndChunks(source: Source): { source: Source; chunks: DocumentChunk[] } {
  const store = loadStore();
  store.sources.push(source);
  
  // Basic semantic chunking
  const paragraphs = source.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  let currentChunk = '';
  const chunks: DocumentChunk[] = [];
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > 1000) {
      if (currentChunk.trim()) {
        chunks.push({
          id: crypto.randomUUID(),
          sourceId: source.id,
          text: currentChunk.trim()
        });
      }
      currentChunk = paragraph + '\n\n';
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }
  if (currentChunk.trim()) {
    chunks.push({
      id: crypto.randomUUID(),
      sourceId: source.id,
      text: currentChunk.trim()
    });
  }

  store.chunks.push(...chunks);
  saveStore(store);
  
  return { source, chunks };
}
