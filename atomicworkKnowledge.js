// atomicworkKnowledge.js
// Simple JSON-backed knowledge store for Atomicwork RAG

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const FILE_PATH = path.join(__dirname, 'knowledge', 'atomicwork.json');

let cache = null;

function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) {
    const initial = { docs: [] };
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadKnowledge() {
  if (cache) return cache;
  ensureFile();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  cache = parsed.docs || [];
  return cache;
}

function saveKnowledge() {
  if (!cache) return;
  const data = { docs: cache };
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Get all docs (array)
 */
function getAllDocs() {
  return loadKnowledge();
}

/**
 * Get a single doc by id
 */
function getDocById(id) {
  const docs = loadKnowledge();
  return docs.find((d) => d.id === id) || null;
}

/**
 * Create a new doc
 */
function createDoc(payload) {
  const now = new Date().toISOString();
  const docs = loadKnowledge();

  const doc = {
    id: uuidv4(),
    title: payload.title || 'Untitled',
    tier: payload.tier || 'Platform',
    audience: Array.isArray(payload.audience)
      ? payload.audience
      : ['General'],
    tags: Array.isArray(payload.tags)
      ? payload.tags
      : typeof payload.tags === 'string'
      ? payload.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    summary: payload.summary || '',
    body: payload.body || '',
    sourceType: payload.sourceType || 'narrative',
    createdAt: now,
    updatedAt: now,
    isActive:
      typeof payload.isActive === 'boolean' ? payload.isActive : true,
  };

  docs.push(doc);
  saveKnowledge();
  return doc;
}

/**
 * Update an existing doc
 */
function updateDoc(id, payload) {
  const docs = loadKnowledge();
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) {
    const err = new Error('Knowledge doc not found');
    err.statusCode = 404;
    throw err;
  }

  const existing = docs[idx];
  const updated = {
    ...existing,
    title: payload.title !== undefined ? payload.title : existing.title,
    tier: payload.tier !== undefined ? payload.tier : existing.tier,
    audience:
      payload.audience !== undefined
        ? payload.audience
        : existing.audience,
    tags:
      payload.tags !== undefined
        ? Array.isArray(payload.tags)
          ? payload.tags
          : typeof payload.tags === 'string'
          ? payload.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : existing.tags
        : existing.tags,
    summary:
      payload.summary !== undefined ? payload.summary : existing.summary,
    body: payload.body !== undefined ? payload.body : existing.body,
    sourceType:
      payload.sourceType !== undefined
        ? payload.sourceType
        : existing.sourceType,
    isActive:
      payload.isActive !== undefined ? payload.isActive : existing.isActive,
    updatedAt: new Date().toISOString(),
  };

  docs[idx] = updated;
  saveKnowledge();
  return updated;
}

/**
 * Query / rank docs for RAG
 */
function queryKnowledge({ query, personaRole, tiers = [], maxDocs = 5 }) {
  const docs = loadKnowledge();

  const q = (query || '').toLowerCase();
  const role = (personaRole || '').toLowerCase();

  const scored = docs
    .filter((d) => d.isActive !== false)
    .map((doc) => {
      let score = 0;

      if (tiers.length && !tiers.includes(doc.tier)) {
        return null;
      }

      // audience match
      const audHit = (doc.audience || [])
        .map((a) => a.toLowerCase())
        .some((a) => role.includes(a.replace('_', '')) || role.includes(a.split('_')[0]));
      if (audHit) score += 2;

      // tags + text match
      const haystack =
        (doc.title +
          ' ' +
          doc.summary +
          ' ' +
          doc.body +
          ' ' +
          (doc.tags || []).join(' ')).toLowerCase();

      if (q) {
        const qWords = q.split(/\s+/).filter(Boolean);
        qWords.forEach((w) => {
          if (haystack.includes(w)) score += 0.5;
        });
      }

      if (doc.tier === 'Platform') score += 0.5;

      return { doc, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDocs);

  return scored.map(({ doc, score }) => ({ ...doc, score }));
}

module.exports = {
  getAllDocs,
  getDocById,
  createDoc,
  updateDoc,
  queryKnowledge,
};
