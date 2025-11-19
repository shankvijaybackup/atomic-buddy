// services/vectorStore.js
const fs = require('fs');
const path = require('path');
const { openai, EMBEDDING_MODEL } = require('./aiConfig');

const VECTORS_PATH = path.join(__dirname, '..', 'data', 'atomicwork_vectors.json');

function loadStore() {
  if (!fs.existsSync(VECTORS_PATH)) {
    return { chunks: [] };
  }
  return JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));
}

function saveStore(store) {
  fs.writeFileSync(VECTORS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function cosine(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

async function embedText(text) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

// Store chunk with metadata
async function addChunk({ docId, content, meta }) {
  const store = loadStore();
  const embedding = await embedText(content);
  store.chunks.push({
    id: `${docId}::${store.chunks.length}`,
    docId,
    content,
    meta,
    embedding,
  });
  saveStore(store);
}

// Simple similarity search
async function search({ query, topK = 8, filter = {} }) {
  const store = loadStore();
  if (!store.chunks.length) return [];

  const queryEmbedding = await embedText(query);

  const scored = store.chunks
    .filter((chunk) => {
      // simple filter by tier or audience if provided
      if (filter.tiers && filter.tiers.length) {
        if (!chunk.meta?.tiers?.some((t) => filter.tiers.includes(t))) return false;
      }
      if (filter.audience && filter.audience.length) {
        if (!chunk.meta?.audience?.some((a) => filter.audience.includes(a))) return false;
      }
      return true;
    })
    .map((chunk) => ({
      ...chunk,
      score: cosine(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

module.exports = {
  addChunk,
  search,
};
