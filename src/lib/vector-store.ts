/**
 * vector-store.ts
 *
 * Pure-JS in-memory vector store using cosine similarity search.
 * Replaces faiss-node (which requires native C++ bindings that can't run on Vercel serverless).
 *
 * This is a drop-in replacement — same API surface (initVectorStore, addVectors, searchVector, saveVectorStore).
 * Performance is fine for per-session RAG with hundreds to low thousands of chunks.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.VERCEL ? '/tmp/.data' : path.join(process.cwd(), '.data');
const VECTORS_FILE = path.join(DATA_DIR, 'vectors.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredVector {
  chunkId: string;
  embedding: number[];
}

let vectors: StoredVector[] = [];
let initialized = false;

/**
 * Initialize or load the vector store
 */
export function initVectorStore() {
  if (initialized) return;

  try {
    if (fs.existsSync(VECTORS_FILE)) {
      const raw = fs.readFileSync(VECTORS_FILE, 'utf-8');
      vectors = JSON.parse(raw);
    } else {
      vectors = [];
    }
  } catch (err) {
    console.error('Failed to load vector store, creating new one', err);
    vectors = [];
  }

  initialized = true;
}

/**
 * Save vectors to disk
 */
export function saveVectorStore() {
  try {
    fs.writeFileSync(VECTORS_FILE, JSON.stringify(vectors), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist vector store (non-critical on Vercel):', err);
  }
}

/**
 * Add chunks to the vector store
 */
export function addVectors(embeddings: number[][], chunkIds: string[]) {
  initVectorStore();

  for (let i = 0; i < embeddings.length; i++) {
    vectors.push({
      chunkId: chunkIds[i],
      embedding: embeddings[i],
    });
  }

  saveVectorStore();
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Search the vector store for the k nearest neighbors using cosine similarity
 */
export function searchVector(queryEmbedding: number[], topK: number = 5): string[] {
  if (vectors.length === 0) return [];

  try {
    // Compute similarity scores for all stored vectors
    const scored = vectors.map((v) => ({
      chunkId: v.chunkId,
      score: cosineSimilarity(queryEmbedding, v.embedding),
    }));

    // Sort by similarity (highest first) and take topK
    scored.sort((a, b) => b.score - a.score);

    return scored
      .slice(0, topK)
      .map((s) => s.chunkId);
  } catch (e) {
    console.error('Vector search error', e);
    return [];
  }
}
