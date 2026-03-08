import { loadStore } from './store';
import { generateEmbedding } from './embeddings';
import { searchVector, initVectorStore } from './vector-store';

/**
 * Retrieve the most relevant document chunks for a query using FAISS vector similarity.
 */
export async function retrieveRelevantChunks(query: string, topK: number = 5) {
  initVectorStore();
  const store = loadStore();
  if (store.chunks.length === 0) return [];

  try {
    // Generate embedding for the user query
    const queryEmbedding = await generateEmbedding(query);

    // Call FAISS C++ bindings to quickly find topK vector indices and map to UUIDs
    const matchingIds = searchVector(queryEmbedding, topK);

    if (matchingIds.length === 0) {
       console.warn('FAISS returned no matches. Falling back to first chunks.');
       return store.chunks.slice(0, topK).map(c => ({ text: c.text, sourceId: c.sourceId }));
    }

    // Lookup metadata from local disk FSS metadata by ID matches
    const relevantChunks = matchingIds
      .map(id => store.chunks.find(c => c.id === id))
      .filter(chunk => chunk !== undefined)
      .map(chunk => ({ text: chunk!.text, sourceId: chunk!.sourceId }));

    return relevantChunks;

  } catch (err) {
    console.error("Retrieval failed, returning fallback", err);
    return store.chunks.slice(0, topK).map(c => ({ text: c.text, sourceId: c.sourceId }));
  }
}
