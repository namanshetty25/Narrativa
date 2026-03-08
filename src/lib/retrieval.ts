import { loadStore } from './store';

// Basic Lexical (Keyword) Retrieval implementation for simplicity
// In a production NotebookLM clone, this would be replaced by vector embeddings (e.g., Gemini text-embedding-004)
export function retrieveRelevantChunks(query: string, topK: number = 5) {
  const store = loadStore();
  if (store.chunks.length === 0) return [];

  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (queryWords.length === 0) {
    // Return first few chunks if we have no meaningful keywords
    return store.chunks.slice(0, topK);
  }

  const scoredChunks = store.chunks.map(chunk => {
    let score = 0;
    const chunkText = chunk.text.toLowerCase();
    
    // simple term frequency
    for (const word of queryWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = chunkText.match(regex);
        if (matches) {
            score += matches.length;
        }
    }
    
    return { ...chunk, score };
  });

  // Sort by score descending and return
  scoredChunks.sort((a, b) => b.score - a.score);
  
  return scoredChunks
    .filter(chunk => chunk.score > 0)
    .slice(0, topK)
    .map(c => ({ text: c.text, sourceId: c.sourceId }));
}
