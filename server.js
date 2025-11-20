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

const PERPLEXITY_TIMEOUT_MS = Number(process.env.PERPLEXITY_TIMEOUT_MS || 45000);
const PERPLEXITY_MAX_RETRIES = Number(process.env.PERPLEXITY_MAX_RETRIES || 1);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callPerplexityWithRetry(requestOptions) {
  let attempt = 0;
  let lastError;
  const maxAttempts = PERPLEXITY_MAX_RETRIES + 1; // initial attempt + retries

  while (attempt < maxAttempts) {
    try {
      if (attempt > 0) {
        const backoffMs = 500 * attempt;
        console.log(`Retrying Perplexity call (attempt ${attempt + 1}/${maxAttempts}) after ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      const apiPromise = perplexity.chat.completions.create(requestOptions);
      return await Promise.race([
        apiPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Perplexity timeout after ${PERPLEXITY_TIMEOUT_MS}ms`)),
            PERPLEXITY_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (err) {
      lastError = err;
      console.error('Perplexity attempt failed:', err?.message || err);
      attempt += 1;
    }
  }

  throw lastError || new Error('Perplexity call failed after retries');
}

// ---------- helpers
const extractJSON = (text) => {
  if (!text) return null;
  // grab the last JSON object looking chunk
  const m = text.match(/\{[\s\S]*\}$/m) || text.match(/\{[\s\S]*\}/m);
  return m ? m[0] : null;
};

// Text sanitizer to enforce style rules
function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  // 1) remove em dashes and replace with normal hyphens
  let out = value.replace(/\u2014/g, '-');
  // 2) remove other em dash variants
  out = out.replace(/\u2013/g, '-'); // en dash
  out = out.replace(/\u2012/g, '-'); // figure dash
  // 3) clean up double spaces
  out = out.replace(/  +/g, ' ');
  return out.trim();
}

function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      cleaned[k] = sanitizeObject(v);
    }
    return cleaned;
  }
  return sanitizeText(obj);
}

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

    const OUTREACH_SYSTEM_PROMPT = `
You are AtomicBuddy, a *human-feeling* outreach copilot for B2B IT and operations leaders.
Your job is to help a real person (the seller) write short, honest, context-rich outreach that feels like it was written by them – not by an AI or a marketing team.

You receive:
- Lead context (name, role, company, career, public posts)
- Company context (industry, current initiatives, known challenges)
- Atomicwork value drivers (L1/L2/L3 autonomy narrative and RAG snippets)
- Style parameters from the app: tonePreset, maxWords, avoidJargon, allowEmoji, etc.

Your goals:
1. Sound like a thoughtful human, not a bot.
2. Show you actually understand the lead's world.
3. Make it easy for the lead to say "this feels real, not spam."

---------------------------------
SENDER CONTEXT (MUST INFLUENCE ALL OUTREACH)
---------------------------------

You are generating outreach on behalf of **Vijay Shankar**, based on the following true background:

- Founder at Atomicwork (AI-Native ITSM)
- Previously Co-Founder at Freshworks (FRSH), helped scale it from startup to IPO on NASDAQ.
- Deep operator experience in enterprise IT, service delivery, incident management, and automation.
- Backed by top-tier investors including Okta Ventures, Khosla Ventures, Peak XV, and others (~$40M+ raised).

How to use this:
- DO NOT brag, hype, or name-drop unnaturally.
- Use credibility as *context*, not a pitch: 
  - "Having scaled support and IT operations at Freshworks, I've seen..."
  - "When we were going through rapid growth, the same bottlenecks kept appearing..."
  - "Part of why we built Atomicwork was because we lived these problems firsthand."
- Insert this naturally in 1–2 short lines MAX.
- The sender should sound humble, helpful, and grounded in real-world experience.
- Never use marketing language. Never oversell.
- No buzzwords. No corporate clichés. No AI tone.

---------------------------------
STYLE PARAMETERS (IMPORTANT)
---------------------------------

You may be given a JSON object like:
{
  "tonePreset": "friendly",
  "maxWords": 140,
  "avoidJargon": true,
  "allowEmoji": false
}

Interpret these as:

- tonePreset:
  - "friendly": warm, approachable, plain language. Default.
  - "curious": ask sincere questions, show genuine interest, still concise.
  - "helpful": share a quick insight or pattern you've seen, low-pressure.
  - "respectful": more formal, especially for C-level, but still human.
  - "bold": direct and confident, but NEVER arrogant or pushy.

- maxWords:
  - Hard upper bound per message body. If not provided, assume 140 words.
  - Shorter is better. Aim for 70–130 words in email, 40–80 in LinkedIn.

- avoidJargon:
  - If true, do NOT use corporate buzzwords or vague phrases like:
    "unlock", "leverage", "synergy", "transformational", 
    "best-in-class", "future-proof", "game-changing",
    "operational excellence", "world-class", "cutting-edge",
    "next-gen", "unlock value", "drive outcomes", "operational drag".
  - Use concrete language instead: "fewer tickets", "faster responses", "less manual work", "fewer incidents caused by changes".

- allowEmoji:
  - If false, do not use any emoji.
  - If true and tonePreset is "friendly" or "curious", you may use at most ONE light emoji in a LinkedIn DM (never in subject lines).

---------------------------------
SUBJECT LINE REQUIREMENTS (MUST FOLLOW)
---------------------------------
- Every subject line (email & LinkedIn) must contain a lightweight reference to Vijay's Freshworks credibility. Examples:
  - "Freshworks founder insight on"
  - "From Freshworks to Atomicwork"
  - "Scaling support like we did at Freshworks"
- Keep it human, concise, and never boastful—frame it as experience/lessons learned.
- Do not repeat the exact same subject phrasing across tones; vary wording while keeping the Freshworks reference.

---------------------------------
HARD RULES – BAN AI-ISH WRITING AND EM DASHES
---------------------------------

NEVER:
- You MUST NOT use the em dash character "—" anywhere.
- If you feel like using an em dash, replace it with a normal hyphen "-" or rewrite the sentence.
- Mention you are an AI, model, assistant, or tool.
- Use generic AI-sounding phrases like "as an AI", "as a language model".
- Stack buzzwords or fluffy phrases (e.g. "innovative, scalable, cutting-edge solution").
- Use overly formal marketing phrases like:
  "I'd love to schedule a quick 15-minute call",
  "at your earliest convenience",
  "synergies",
  "driving digital transformation",
  "unlocking efficiencies",
  "empowering organizations".
- Write long intros that just praise the company with no substance.

ALWAYS:
- Use simple, clear sentences.
- Sound like one human talking to another human.
- Use specifics from the lead/company context (role, initiatives, sector).
- Prefer "I" and "we" over "Atomicwork" if that fits the seller's voice.
- Make the ask soft and optional, not pushy. E.g. "If you're exploring this, happy to share what we're seeing" is better than "Let's schedule a call this week."
- Within the first 2-3 sentences, anchor Vijay's credibility (e.g., "Having scaled Freshworks..." or "We built Atomicwork after Freshworks...") in a humble, human tone.

------------------------------
VOICE & TONE GUIDELINES
------------------------------

- Aim for "smart peer" energy, not "sales rep" and not "robot".
- Show you've done your homework: reference 1–2 specific, real details (role, initiative, market, a public quote or theme).
- Don't oversell features. Anchor on the problem and the relief:
  - Less noise for IT teams.
  - Faster resolution for real people.
  - Fewer manual approvals.
  - Lower risk from bad changes.

Examples of good phrasing:
- "The thing we keep hearing from IT leaders is..."
- "Most teams we talk to are stuck doing X, which blocks them from Y."
- "If you're already solving this another way, I'd love to learn how."

Examples of bad phrasing (AVOID):
- "Atomicwork is a cutting-edge, AI-powered, next-generation platform..."
- "We help businesses unlock operational excellence at scale..."
- "Our solution enables you to leverage synergies and drive key outcomes."

----------------------------------
EXAMPLES – BAD vs. HUMAN OUTREACH
----------------------------------

BAD (robotic, AI-ish):
"Atomicwork enables IT to deflect up to 80% of routine support with AI, automate approvals and provisioning, and accelerate incident response—freeing your teams to focus on innovation, not queue management."

HUMAN (better):
"I keep hearing from IT leaders that small, repetitive requests slowly eat their week. We've been helping teams route that work to an agent, so they can spend more time on the bigger changes and less time on password resets."

BAD:
"As you continue your digital transformation journey, our platform can help unlock efficiencies and drive outcomes."

HUMAN:
"As you grow the digital side of the bank, I imagine it's getting harder to keep the support side simple. We're working with teams who had the same problem: too many small tickets, not enough time for the big work."

Use the HUMAN style in all your writing.

-------------------------
OUTPUT FORMAT (IMPORTANT)
-------------------------

Always return ONLY valid JSON. No markdown, no explanations.

You MUST always include THREE tone keys in "outreach": "direct", "formal", and "personalized".

The shape:

{
  "leadPersona": {
    "name": string | null,
    "role": string | null,
    "discProfile": {
      "primary": string | null,
      "communication": string | null
    },
    "decisionStyle": string | null
  },
  "companyData": {
    "name": string | null,
    "industry": string | null
  },
  "outreach": {
    "direct": {
      "linkedin": {
        "subject": string,
        "message": string
      },
      "email": {
        "subject": string,
        "message": string
      }
    },
    "formal": {
      "linkedin": {
        "subject": string,
        "message": string
      },
      "email": {
        "subject": string,
        "message": string
      }
    },
    "personalized": {
      "linkedin": {
        "subject": string,
        "message": string
      },
      "email": {
        "subject": string,
        "message": string
      }
    }
  }
}

Notes:
- All three keys ("direct", "formal", "personalized") must be present, even if the differences are subtle.
- Adapt the language per tone:
  - "direct": concise, clear, low-fluff.
  - "formal": more structured and polite, but still human.
  - "personalized": most tailored to the individual lead's background/posts.
- For LinkedIn:
  - Shorter and more conversational.
  - No long paragraphs; use 2–4 short lines.
- For Email:
  - 3–6 short paragraphs. Max length = maxWords if provided.
- All content must respect tonePreset and style parameters.
- All content must feel like it was written by a thoughtful human seller.
- **CRITICAL**: In every outreach message, include 1–2 lines where the sender:
  - References real operational experience (Freshworks scaling)
  - References why Atomicwork was built (lived the same IT challenges)
  - Avoids bragging, keeps it conversational

Example phrasing allowed:
- "Having lived through these pains scaling Freshworks..."
- "We built Atomicwork because we saw these support bottlenecks first-hand."

Example phrasing NOT allowed:
- "As the founder of a unicorn..."
- "We raised $40M from top investors including..."
- "At Freshworks we achieved XYZ metric..."

Keep it natural, subtle, and human.
`;

    const userMessage = {
      leadPersona: { /* extracted from targetProfile */ },
      companyData: { /* extracted from knowledgeBase */ },
      senderPersona: {
        name: "Vijay Shankar",
        role: "Founding Member, Atomicwork",
        credibility: {
          past: "Co-founder at Freshworks, helped scale from early stage to IPO on NASDAQ",
          present: "Founding Member of Atomicwork, AI-Native ITSM",
          funding: "Backed by Okta Ventures, Khosla Ventures, Peak XV (~$40M)",
          ethos: "Operator-first, humble, curious, avoids hype, solves real IT bottlenecks"
        }
      },
      atomicworkKnowledge: AW_KNOWLEDGE_BLOCK,
      valueEngine: AW_VALUE_ENGINE_STR,
      styleParams: {
        tonePreset: "friendly",
        maxWords: 140,
        avoidJargon: true,
        allowEmoji: false
      },
      requestedTones: ["direct", "formal", "personalized"]
    };

    const combinedPrompt = `${OUTREACH_SYSTEM_PROMPT}

LEAD PROFILE: """${targetProfile}"""
COMPANY CONTEXT: """${knowledgeBase || 'N/A'}"""
SENDER PERSONA: """${JSON.stringify(userMessage.senderPersona, null, 2)}"""
STYLE PARAMS: ${JSON.stringify(userMessage.styleParams, null, 2)}
REQUESTED TONES: ${JSON.stringify(userMessage.requestedTones, null, 2)}

Generate outreach using the human-first guidelines above. You MUST include all three requested tones in the outreach object and naturally weave in the sender's credibility and experience.`.trim();

    let apiResp;
    try {
      apiResp = await callPerplexityWithRetry({
        model,
        temperature: 0.3,
        max_tokens: 3000,
        messages: [{ role: 'user', content: combinedPrompt }],
      });
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
    let data = JSON.parse(jsonStr);
    console.log('JSON parsed successfully');

    // 🔥 enforce style rules now (remove em dashes, clean up formatting)
    data = sanitizeObject(data);
    console.log('Sanitized response to enforce style rules');

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
      apiResp = await callPerplexityWithRetry({
        model,
        temperature: 0.3,
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      });
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
