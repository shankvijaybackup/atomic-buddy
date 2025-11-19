// services/knowledgeStore.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const { addChunk, search: vectorSearch } = require('./vectorStore');
const { openai, CLASSIFIER_MODEL } = require('./aiConfig');

const DOCS_PATH = path.join(__dirname, '..', 'data', 'atomicwork_knowledge.json');

function loadDocs() {
  if (!fs.existsSync(DOCS_PATH)) {
    return { docs: [] };
  }
  return JSON.parse(fs.readFileSync(DOCS_PATH, 'utf8'));
}

function saveDocs(store) {
  fs.writeFileSync(DOCS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

const DEFAULT_AUDIENCE = ['General'];

function computeHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function classifyDoc(text) {
  const prompt = `
You are helping label Atomicwork messaging docs.

Given this text, infer:
- tiers: which of ["L1", "L2", "L3", "Multi", "Platform"] apply
- audience: which personas it is most relevant for, from:
  ["CIO","CTO","CISO","VP_IT_Ops","ServiceDeskManager","SRE_Manager","ChangeManager","HRIT","Broad_Executive","General"]
- tags: 3-8 short tags
- summary: 1–2 sentence TL;DR

Return ONLY JSON:
{
  "tiers": [...],
  "audience": [...],
  "tags": [...],
  "summary": "..."
}
Text:
"""${text.slice(0, 4000)}"""
`;
  const res = await openai.chat.completions.create({
    model: CLASSIFIER_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const raw = res.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return {
      tiers: ['Platform'],
      audience: DEFAULT_AUDIENCE,
      tags: ['atomicwork', 'autonomy'],
      summary: text.slice(0, 140),
    };
  }
}

function chunkText(text, maxLen = 1000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = start + maxLen;
    const slice = text.slice(start, end);
    chunks.push(slice.trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function createDoc({
  title,
  body,
  sourceType,
  explicitTier,
  explicitAudience,
  sourceMeta,
}) {
  const store = loadDocs();

  const contentHash = computeHash(body);

  // dedupe rule:
  // 1) exact same contentHash
  // 2) OR same title + same first 400 chars
  const existing = store.docs.find((d) => {
    if (d.contentHash && d.contentHash === contentHash) return true;
    if (d.title === title && d.body?.slice(0, 400) === body.slice(0, 400)) return true;
    return false;
  });

  if (existing) {
    return { doc: existing, deduped: true };
  }

  // classification
  const classification = await classifyDoc(body);
  const tiers =
    explicitTier && explicitTier.length
      ? Array.isArray(explicitTier)
        ? explicitTier
        : [explicitTier]
      : classification.tiers || ['Platform'];

  const audience =
    explicitAudience && explicitAudience.length
      ? explicitAudience
      : classification.audience || DEFAULT_AUDIENCE;

  const tags = classification.tags || [];
  const summary = classification.summary || body.slice(0, 160);

  const now = new Date().toISOString();
  const docId = nanoid();

  const doc = {
    id: docId,
    title,
    tier: tiers.length === 1 ? tiers[0] : 'Multi',
    tiers,
    audience,
    tags,
    summary,
    body,
    sourceType: sourceType || 'manual', // 'upload' | 'notebooklm' | 'manual'
    sourceMeta: sourceMeta || {},      // e.g. { originalFilename, mimeType, size }
    contentHash,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  store.docs.push(doc);
  saveDocs(store);

  // embed chunks
  const chunks = chunkText(body, 900);
  for (const chunk of chunks) {
    await addChunk({
      docId,
      content: chunk,
      meta: {
        tiers,
        audience,
        tags,
        title,
        sourceType: doc.sourceType,
      },
    });
  }

  return { doc, deduped: false };
}

async function updateDoc(id, updates) {
  const store = loadDocs();
  const idx = store.docs.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error('Doc not found');

  const prev = store.docs[idx];
  const updated = {
    ...prev,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // if body changed, recompute hash
  if (updates.body && updates.body !== prev.body) {
    updated.contentHash = computeHash(updates.body);
  }

  store.docs[idx] = updated;
  saveDocs(store);
  // NOTE: not re-embedding on edit for now
  return updated;
}

function listDocs() {
  return loadDocs().docs;
}

async function ragQuery({ query, personaRole, tiers = [], maxDocs = 5 }) {
  let audience = [];
  if (personaRole) {
    const role = personaRole.toLowerCase();
    if (role.includes('cio')) audience = ['CIO', 'Broad_Executive'];
    else if (role.includes('ciso')) audience = ['CISO'];
    else if (role.includes('ops') || role.includes('it'))
      audience = ['VP_IT_Ops', 'ServiceDeskManager'];
    else if (role.includes('sre') || role.includes('platform'))
      audience = ['SRE_Manager'];
  }

  const chunks = await vectorSearch({
    query,
    topK: maxDocs * 3,
    filter: {
      tiers,
      audience,
    },
  });

  const store = loadDocs();
  const byDoc = new Map();
  chunks.forEach((c) => {
    const doc = store.docs.find((d) => d.id === c.docId);
    if (!doc) return;
    const existing = byDoc.get(doc.id) || {
      doc,
      chunks: [],
      maxScore: 0,
    };
    existing.chunks.push(c);
    existing.maxScore = Math.max(existing.maxScore, c.score);
    byDoc.set(doc.id, existing);
  });

  const merged = Array.from(byDoc.values())
    .sort((a, b) => b.maxScore - a.maxScore)
    .slice(0, maxDocs)
    .map((entry) => ({
      ...entry.doc,
      score: entry.maxScore,
    }));

  return {
    query,
    persona: personaRole ? { role: personaRole } : null,
    matchedDocs: merged,
  };
}

module.exports = {
  createDoc,
  updateDoc,
  listDocs,
  ragQuery,
};
