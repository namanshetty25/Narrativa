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

const DATA_FILE = path.join(process.cwd(), '.data.json');

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

export function addSourceAndChunks(source: Source) {
  const store = loadStore();
  store.sources.push(source);
  
  // Basic semantic chunking (split by double newline or fallback to chunks of 1000 chars)
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
  
  return source;
}
