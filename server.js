// server.js — no auth, OpenAI (4o) for research, Perplexity Sonar for outreach (OpenAI-compatible)
require('dotenv').config();

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Ensure required directories exist on startup
const ensureDirectories = () => {
  const dirs = ['data', 'uploads', 'temp'];
  dirs.forEach(dir => {
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

ensureDirectories();

const atomicKnowledge = require('./data/aw-knowledge');
const awValueEngine = require('./data/aw-value-engine.json');

// New knowledge services
const {
  createDoc,
  updateDoc,
  listDocs,
  ragQuery,
} = require('./services/knowledgeStore');
const { transcribeFile } = require('./services/transcription');
const { extractTextFromPDF } = require('./services/ocrService');

// File processing dependencies
const multer = require('multer');
const pdfParse = require('pdf-parse');

// OpenAI SDK (we'll use it twice: once for OpenAI, once pointed at Perplexity)
const OpenAI = require('openai');

// Anthropic SDK for research
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- middleware & static
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Log the actual MIME type for debugging
    console.log('Upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    // Use extension-based filtering instead of MIME types (more reliable)
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md', '.mp3', '.m4a', '.wav', '.mp4', '.mov'];
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type ${ext}. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
  }
});

// ---------- clients
// 1) Anthropic for research
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 2) Perplexity via OpenAI-compatible interface
// Accept either PERPLEXITY_API_KEY or PPLX_API_KEY
const PPLX_KEY = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY || '';
const perplexity = new OpenAI({
  apiKey: PPLX_KEY,
  baseURL: 'https://api.perplexity.ai', // per official docs
});

// ---------- helpers
const extractJSON = (text) => {
  if (!text) return null;
  // grab the last JSON object looking chunk
  const m = text.match(/\{[\s\S]*\}$/m) || text.match(/\{[\s\S]*\}/m);
  return m ? m[0] : null;
};

// ---------- health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- Knowledge CRUD (Vector-Powered) ----------
app.get('/api/atomicwork/knowledge', (req, res) => {
  try {
    const docs = listDocs();
    res.json({ docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list docs' });
  }
});

app.post('/api/atomicwork/knowledge', async (req, res) => {
  try {
    const { title, body, sourceType, tier, audience } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body required' });
    }
    const { doc, deduped } = await createDoc({
      title,
      body,
      sourceType: sourceType || 'manual',
      explicitTier: tier,
      explicitAudience: audience,
    });
    res.json({ doc, deduped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create doc' });
  }
});

app.put('/api/atomicwork/knowledge/:id', async (req, res) => {
  try {
    const doc = await updateDoc(req.params.id, req.body);
    res.json({ doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to update doc' });
  }
});

app.post('/api/atomicwork/knowledge/query', async (req, res) => {
  try {
    const { query, persona, context } = req.body || {};
    const tiers = context?.tiers || [];
    const maxDocs = context?.maxDocs || 5;
    const result = await ragQuery({
      query,
      personaRole: persona?.role,
      tiers,
      maxDocs,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to query knowledge' });
  }
});

// ---------- PRO: Ingestion Endpoints ----------
app.post(
  '/api/atomicwork/knowledge/ingest',
  upload.array('file', 10),   // allow up to 10 files
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();

        try {
          let text = '';

          // 1) Plain text
          if (['.txt', '.md'].includes(ext)) {
            text = fsSync.readFileSync(file.path, 'utf8');
          }

          // 2) PDF
          else if (ext === '.pdf') {
            const dataBuffer = fsSync.readFileSync(file.path);
            const parsed = await pdfParse(dataBuffer);
            text = parsed.text || '';
          }

          // 3) Audio / video → Whisper
          else if (
            ['.mp3', '.m4a', '.wav', '.mp4', '.mov'].includes(ext)
          ) {
            text = await transcribeFile(file.path);
          }

          // 4) Unsupported
          else {
            throw new Error(
              `Unsupported file type ${ext}. Supported: .txt, .md, .pdf, .mp3, .m4a, .wav, .mp4, .mov` 
            );
          }

          if (!text.trim()) {
            throw new Error(
              'No text extracted from file. It may be image-only; try exporting as text or pasting content directly.'
            );
          }

          const baseTitle =
            file.originalname.replace(ext, '') || 'Uploaded doc';

          const { doc, deduped } = await createDoc({
            title: baseTitle,
            body: text,
            sourceType: 'upload',
            explicitTier: req.body.tier,
            explicitAudience: req.body.audience,
            sourceMeta: {
              source: 'upload',
              originalFilename: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
            },
          });

          results.push({
            filename: file.originalname,
            success: true,
            deduped,
            doc,
          });
        } catch (err) {
          console.error('Ingest failed for', file.originalname, err);
          results.push({
            filename: file.originalname,
            success: false,
            error: err.message || 'Failed to ingest file',
          });
        }
      }

      return res.json({ results });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: err.message || 'Failed to ingest files' });
    }
  }
);

// --- NotebookLM import mode (paste text) ---
app.post('/api/atomicwork/knowledge/notebooklm', async (req, res) => {
  try {
    const { title, text, personaHint, tier } = req.body || {};
    if (!text || !title) {
      return res.status(400).json({ error: 'title and text required' });
    }

    const explicitAudience = personaHint
      ? [personaHint] // e.g. "CIO" / "VP_IT_Ops"
      : undefined;

    const { doc, deduped } = await createDoc({
      title,
      body: text,
      sourceType: 'notebooklm',
      explicitTier: tier,
      explicitAudience,
      sourceMeta: {
        source: 'notebooklm',
        personaHint,
      },
    });

    res.json({ doc, deduped });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: err.message || 'Failed to import NotebookLM text' });
  }
});

// --- Google Drive sync (skeleton) ---
app.post('/api/atomicwork/knowledge/google-drive/sync', async (req, res) => {
  // PSEUDO:
  // 1) Use googleapis + OAuth/Service Account
  // 2) List files in a folder
  // 3) For each file, export as text or PDF, extract text
  // 4) Call createDoc() for each
  res.status(501).json({
    error:
      'Google Drive sync skeleton in place. Wire googleapis + credentials to use it.',
  });
});

/**
 * POST /api/analyze
 * Body: { userProfile: string, targetProfile: string, knowledgeBase?: string }
 * - Uses OpenAI to perform deep research (company + context)
 * - Uses Perplexity (single model) to generate LI + Email copy
 */
app.post('/api/analyze', async (req, res) => {
  try {
    console.log('Starting analysis...');
    const { userProfile, targetProfile, knowledgeBase } = req.body || {};
    console.log('Request body received:', { userProfile: !!userProfile, targetProfile: !!targetProfile, knowledgeBase: !!knowledgeBase });
    
    if (!userProfile || !targetProfile) {
      return res.status(400).json({ error: 'User and target profiles are required.' });
    }

    // ------- Single Perplexity call for everything (faster!)
    console.log('Making Perplexity call for research + outreach...');
    const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    console.log('Using Perplexity model:', model);

    const AW_KNOWLEDGE_BLOCK = atomicKnowledge;
    const AW_VALUE_ENGINE_STR = JSON.stringify(awValueEngine.aw_value_engine, null, 2);

    const combinedPrompt = `You are Atomicwork Buddy, an expert outreach strategist who always grounds recommendations in Atomicwork's autonomy narrative.

Use the following canonical Atomicwork knowledge when describing value. Treat it as factually accurate and do not contradict it:
${AW_KNOWLEDGE_BLOCK}

Atomicwork Value Engine (tiers, friction, solutions, outcomes, hooks):
${AW_VALUE_ENGINE_STR}

MY POSITION: Vijay Shankar - Atomicwork founder, former Freshworks founder, former Zoho/ManageEngine leader.

INPUTS:
- LEAD PROFILE: """${targetProfile}"""
- COMPANY CONTEXT: """${knowledgeBase || 'N/A'}"""

TASKS:
1. Infer the lead persona and map relevant Atomicwork tiers (L1/L2/L3) using the value engine.
2. Summarize company research grounded in the knowledge above.
3. Generate outreach copy that clearly ties Atomicwork capabilities to the lead's priorities, referencing L1/L2/L3 outcomes where relevant.

Return ONLY JSON:
{
  "persona": { "name": "...", "jobTitle": "...", "level": "...", "industry": "...", "company": "...", "discProfile": {"primary": "D/I/S/C", "communication": "..."} },
  "companyResearch": { "name": "...", "industry": "...", "size": "...", "keyProducts": [], "recentNews": [] },
  "outreach": {
    "direct": {
      "linkedin": { "subject": "Technical efficiency for [company]", "message": "300-400 char message focusing on operational efficiency" },
      "email": { "subject": "Different subject", "message": "300-400 char email version" }
    },
    "formal": {
      "linkedin": { "subject": "Enterprise scalability at [company]", "message": "300-400 char message on business alignment" },
      "email": { "subject": "Different subject", "message": "300-400 char email version" }
    },
    "personalized": {
      "linkedin": { "subject": "Shared challenges in [industry]", "message": "300-400 char relationship-building message" },
      "email": { "subject": "Different subject", "message": "300-400 char email version" }
    }
  }
}`.trim();

    let apiResp;
    try {
      const apiPromise = perplexity.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 3000,
        messages: [{ role: 'user', content: combinedPrompt }],
      });
      
      apiResp = await Promise.race([
        apiPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Perplexity timeout after 28s')), 28000)
        )
      ]);
      console.log('Perplexity response received');
    } catch (e) {
      console.error('Perplexity API error:', e);
      return res.status(502).json({
        error: 'Perplexity API call failed',
        detail: e?.message || String(e),
      });
    }

    const responseText = apiResp?.choices?.[0]?.message?.content || '';
    console.log('Response text length:', responseText.length);

    if (/<!doctype html>|<html/i.test(responseText)) {
      console.log('Perplexity returned HTML (likely auth issue)');
      return res.status(502).json({
        error: 'Perplexity API returned HTML (likely 401/authorization).',
        detail: 'Double-check PPLX_API_KEY.',
      });
    }

    const jsonStr = extractJSON(responseText);
    console.log('Extracted JSON string:', !!jsonStr);
    if (!jsonStr) {
      console.log('Response text sample:', responseText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse JSON from Perplexity.' });
    }
    const data = JSON.parse(jsonStr);
    console.log('JSON parsed successfully');

    // Return combined data from single Perplexity call
    return res.json({
      leadPersona: {
        persona: data.persona || {},
        companyData: data.companyResearch || {},
        discProfile: data.persona?.discProfile || null,
      },
      outreach: data.outreach || {},
    });
  } catch (err) {
    console.error('Analyze error:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({ error: 'An internal error occurred during analysis.' });
  }
});

app.post('/api/atomicwork/knowledge/query', (req, res) => {
  try {
    const { query, persona, context } = req.body || {};
    const personaRole = persona?.role || '';
    const tiers = context?.tiers || [];
    const maxDocs = context?.maxDocs || 5;

    const matchedDocs = queryKnowledge({ query, personaRole, tiers, maxDocs });

    res.json({
      query,
      persona: persona || null,
      matchedDocs,
    });
  } catch (err) {
    console.error('Knowledge query error:', err);
    res.status(500).json({ error: 'Failed to query Atomicwork knowledge' });
  }
});

app.post('/api/value-drivers/infer', async (req, res) => {
  try {
    const { text, personaHint } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: 'Missing required "text" input for value driver inference.' });
    }

    const AW_KNOWLEDGE_BLOCK = atomicKnowledge;
    const AW_VALUE_ENGINE_STR = JSON.stringify(awValueEngine.aw_value_engine, null, 2);

    // Infer persona from text to drive knowledge retrieval
    const personaGuess = personaHint || 'unknown';
    const ragDocs = queryKnowledge({ query: text, personaRole: personaGuess, tiers: [], maxDocs: 4 });
    const ragSnippet = ragDocs.map((d, i) => `${i + 1}) ${d.title}\nSummary: ${d.summary}\nBody:\n${d.body}`).join('\n\n');

    const prompt = `You are the Atomicwork Value Driver Engine. Given persona or company context, you must map Atomicwork's value narrative precisely.

Use the canonical Atomicwork knowledge block and value engine JSON as the source of truth. Always ground outputs in the autonomy narrative (L1 deflection, L2 automation, L3 acceleration) and the platform-enabler story.

Canonical Atomicwork knowledge:
${AW_KNOWLEDGE_BLOCK}

Atomicwork Value Engine JSON:
${AW_VALUE_ENGINE_STR}

Relevant Atomicwork knowledge docs (use these as grounding; do not contradict):
${ragSnippet}

INPUT TEXT (persona/company/context):
"""${text}"""

Optional persona hint: ${personaHint || 'N/A'}

Return ONLY JSON:
{
  "persona": "Inferred persona or role.",
  "recommended_tiers": ["L1", "L2"],
  "value_drivers": [
    {
      "tier": "L1",
      "hooks": ["..."],
      "outcomes": ["..."],
      "solution": ["..."],
      "angles": ["... persona-specific messaging angles ..."]
    }
  ],
  "executive_synthesis": "One paragraph tying autonomy narrative together.",
  "outreach_blocks": {
    "short_hook": "One-liner hook",
    "email_intro": "Opening sentence for an email",
    "persona_pitch": "Persona-specific value articulation",
    "value_summary": "Short summary connecting Atomicwork to outcomes"
  }
}`.trim();

    let apiResp;
    try {
      const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
      const apiPromise = perplexity.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      });

      apiResp = await Promise.race([
        apiPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Perplexity timeout after 28s')), 28000)),
      ]);
    } catch (err) {
      console.error('Value driver Perplexity API error:', err);
      return res.status(502).json({
        error: 'Perplexity API call failed',
        detail: err?.message || String(err),
      });
    }

    const responseText = apiResp?.choices?.[0]?.message?.content || '';

    if (/<!doctype html>|<html/i.test(responseText)) {
      console.log('Perplexity returned HTML (likely auth issue)');
      return res.status(502).json({
        error: 'Perplexity API returned HTML (likely 401/authorization).',
        detail: 'Double-check PPLX_API_KEY.',
      });
    }

    const jsonStr = extractJSON(responseText);
    if (!jsonStr) {
      console.log('Value driver response sample:', responseText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse JSON from Perplexity for value drivers.' });
    }

    const data = JSON.parse(jsonStr);

    // Attach grounding knowledge snippets
    const persona = data.persona || 'Unknown';
    const recommendedTiers = Array.isArray(data.recommended_tiers) ? data.recommended_tiers : [];
    const matchedDocs = queryKnowledge({
      query: text || '',
      personaRole: personaHint || persona,
      tiers: recommendedTiers,
      maxDocs: 4,
    });

    const knowledgeSnippets = matchedDocs.map((d) => ({
      id: d.id,
      title: d.title,
      tier: d.tier,
      audience: d.audience,
      tags: d.tags,
      summary: d.summary,
      score: d.score,
    }));

    return res.json({
      ...data,
      knowledge_snippets: knowledgeSnippets,
    });
  } catch (err) {
    console.error('Value driver inference error:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({ error: 'An internal error occurred during value driver inference.' });
  }
});

// ---------- pages
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/app', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- start
app.listen(PORT, () => {
  console.log(`AtomicBiddy running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
