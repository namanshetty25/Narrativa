import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  return new GoogleGenAI({ apiKey });
}

/**
 * Generate an embedding vector for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getAI();

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [
      {
        parts: [{ text }],
      },
    ],
  });

  if (
    !response.embeddings ||
    response.embeddings.length === 0 ||
    !response.embeddings[0].values
  ) {
    throw new Error("Failed to generate embedding — no values returned.");
  }

  return response.embeddings[0].values;
}

/**
 * Generate embeddings for multiple texts with controlled parallelism.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 5;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text))
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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