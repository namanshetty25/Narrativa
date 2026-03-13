import fs from 'fs';
import path from 'path';
import { IndexFlatL2 } from 'faiss-node';

const DATA_DIR = path.join(process.cwd(), '.data');
const FAISS_INDEX_FILE = path.join(DATA_DIR, 'vector.index');
const MAP_FILE = path.join(DATA_DIR, 'vector_map.json');
const EMBEDDING_DIMENSION = 3072; // gemini-embedding-001 dimension

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let faissIndex: IndexFlatL2 | null = null;
let idToChunkIdMap: string[] = [];

/**
 * Initialize or load the FAISS index
 */
export function initVectorStore() {
  if (faissIndex) return;
  
  try {
    if (fs.existsSync(FAISS_INDEX_FILE)) {
      faissIndex = IndexFlatL2.read(FAISS_INDEX_FILE);
      if (fs.existsSync(MAP_FILE)) {
        idToChunkIdMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
      }
    } else {
      faissIndex = new IndexFlatL2(EMBEDDING_DIMENSION);
      idToChunkIdMap = [];
    }
  } catch (err) {
    console.error('Failed to init FAISS index, creating new one', err);
    faissIndex = new IndexFlatL2(EMBEDDING_DIMENSION);
    idToChunkIdMap = [];
  }
}

/**
 * Save index to disk
 */
export function saveVectorStore() {
  if (!faissIndex) return;
  faissIndex.write(FAISS_INDEX_FILE);
  fs.writeFileSync(MAP_FILE, JSON.stringify(idToChunkIdMap), 'utf-8');
}

/**
 * Add chunks to the FAISS index
 * 
 * @param embeddings Array of number arrays (the vectors)
 * @param chunkIds Array of internal chunk IDs corresponding to the embeddings
 */
export function addVectors(embeddings: number[][], chunkIds: string[]) {
  if (!faissIndex) initVectorStore();
  
  // Flatten vectors into a 1D Float32Array
  const numVectors = embeddings.length;
  if (numVectors === 0) return;
  
  const flattened = new Float32Array(numVectors * EMBEDDING_DIMENSION);
  for (let i = 0; i < numVectors; i++) {
    for (let j = 0; j < EMBEDDING_DIMENSION; j++) {
      flattened[i * EMBEDDING_DIMENSION + j] = embeddings[i][j];
    }
  }
  
  // Add to FAISS and map the local ID
  // faiss-node bindings generally expect standard arrays, not typed arrays, based on definitions
  const vectorArray = Array.from(flattened);
  faissIndex!.add(vectorArray);
  
  // Since faiss assigns incremental integer IDs starting from the current size,
  // we just push our UUID string IDs into an array in identical order to map back.
  idToChunkIdMap.push(...chunkIds);
  
  saveVectorStore();
}

/**
 * Search the FAISS index for the k nearest neighbors
 * 
 * @param queryEmbedding A single query embedding vector
 * @param topK Number of results to return
 * @returns Array of matching chunk string IDs
 */
export function searchVector(queryEmbedding: number[], topK: number = 5): string[] {
  if (!faissIndex || faissIndex.ntotal() === 0) return [];
  
  const queryArray = Array.from(new Float32Array(queryEmbedding));
  
  try {
    // Prevent FAISS error: topK cannot exceed total items in index
    const actualK = Math.min(topK, faissIndex.ntotal());
    const results = faissIndex.search(queryArray, actualK);
    
    const matchingChunkIds: string[] = [];
    for (let i = 0; i < results.labels.length; i++) {
      const idxId = results.labels[i];
      if (idxId !== -1 && idxId < idToChunkIdMap.length) {
        matchingChunkIds.push(idToChunkIdMap[idxId]);
      }
    }
    
    return matchingChunkIds;
  } catch (e) {
    console.error("FAISS search error", e);
    return [];
  }
}
