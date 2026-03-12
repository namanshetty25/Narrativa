import { getChunks, DocumentChunk } from './store';
import { generateEmbedding } from './embeddings';
import { searchVector, initVectorStore } from './vector-store';

/**
 * Retrieve the most relevant document chunks for a query using FAISS vector similarity.
 */
export async function retrieveRelevantChunks(query: string, topK: number = 5, selectedSourceIds?: string[]) {
  initVectorStore();

  // Get chunks from database
  const availableChunks = await getChunks('', selectedSourceIds);

  if (availableChunks.length === 0) return [];

  try {
    // Generate embedding for the user query
    const queryEmbedding = await generateEmbedding(query);

    // Call FAISS C++ bindings to quickly find topK vector indices and map to UUIDs
    const matchingIds = searchVector(queryEmbedding, topK);

    if (matchingIds.length === 0) {
       console.warn('FAISS returned no matches. Falling back to first chunks.');
       return availableChunks.slice(0, topK).map((c: { text: string; sourceId: string }) => ({ text: c.text, sourceId: c.sourceId }));
    }

    // Lookup metadata from local disk FSS metadata by ID matches
    const relevantChunks = matchingIds
      .map((id: string) => availableChunks.find((c: { id: string }) => c.id === id))
      .filter((chunk): chunk is DocumentChunk => chunk !== undefined)
      .slice(0, topK)
      .map((chunk: DocumentChunk) => ({ text: chunk.text, sourceId: chunk.sourceId }));

    // If FAISS matches fewer chunks than topK after filtering, pad them with available chunks
    if (relevantChunks.length < topK) {
       const existingIds = new Set(relevantChunks.map((c: { sourceId: string }) => c.sourceId));
       const extra = availableChunks.filter((c: { sourceId: string }) => !existingIds.has(c.sourceId)).slice(0, topK - relevantChunks.length);
       relevantChunks.push(...extra.map((c: { text: string; sourceId: string }) => ({ text: c.text, sourceId: c.sourceId })));
    }

    return relevantChunks;

  } catch (err) {
    console.error("Retrieval failed, returning fallback", err);
    return availableChunks.slice(0, topK).map((c: { text: string; sourceId: string }) => ({ text: c.text, sourceId: c.sourceId }));
  }
}
