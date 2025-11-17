// server.js — no auth, OpenAI (4o) for research, Perplexity Sonar for outreach (OpenAI-compatible)
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// OpenAI SDK (we'll use it twice: once for OpenAI, once pointed at Perplexity)
const OpenAI = require('openai');

// Anthropic SDK for research
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- middleware & static
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

    // ------- 1) Research with Anthropic (default claude-3-5-sonnet-20240620)
    console.log('Making Anthropic research call...');
    const researchModel = process.env.OPENAI_RESEARCH_MODEL || 'claude-3-5-sonnet-20240620';
    console.log('Using Anthropic model:', researchModel);
    const researchPrompt = `
You are the world's best analyst and researcher.

Objectives:
1) Analyze the pasted LinkedIn lead profile and infer clean, structured persona details.
2) Research the company named in the profile (and any provided company text) deeply.
3) Incorporate modern service management context for Atomicwork, explaining credibility (why moving from Freshworks to start Atomicwork makes sense).
4) Summarize what leaders on Reddit/social media say about why many AI projects fail.
5) STRICT TONE: any outreach or content must be learning- and sharing-focused, never salesy.

INPUTS
- USER (sender) PROFILE (free text):
"""${userProfile}"""

- LEAD (target) PROFILE RAW (noisy paste from LinkedIn):
"""${targetProfile}"""

- COMPANY CONTEXT (optional raw paste; can be empty):
"""${knowledgeBase || ''}"""

Return ONLY one well-formed JSON:
{
  "persona": { "name": "...", "jobTitle": "...", "level": "...", "industry": "...", "company": "...", "recentActivity": [], "personalQuotes": [], "passions": [], "painPoints": [], "decisionMaking": "..." },
  "companyResearch": { "name": "...", "industry": "...", "size": "...", "keyProducts": [], "recentNews": [], "strategicInitiatives": [], "risks": [] },
  "msmContext": { "whyAtomicwork": "one short paragraph tying Freshworks → Atomicwork → agentic service management", "nonSalesyPrinciples": ["...","..."] },
  "aiFailuresThemes": ["brief bullet #1","brief bullet #2","brief bullet #3","brief bullet #4"]
}
`.trim();

    let researchResp;
    try {
      researchResp = await anthropic.messages.create({
        model: researchModel,
        max_tokens: 4096,
        temperature: 0.2,
        messages: [{ role: 'user', content: researchPrompt }],
      });
      console.log('Anthropic research response received');
    } catch (e) {
      console.error('Anthropic API error:', e);
      return res.status(502).json({
        error: 'Anthropic API call failed',
        detail: e?.message || String(e),
      });
    }
    const researchText = researchResp.content?.[0]?.text || '';
    console.log('Research text length:', researchText.length);
    const researchJSONStr = extractJSON(researchText);
    console.log('Extracted JSON string:', !!researchJSONStr);
    if (!researchJSONStr) {
      console.log('Research text sample:', researchText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse research JSON from Anthropic.' });
    }
    const research = JSON.parse(researchJSONStr);
    console.log('Research JSON parsed successfully');

    // ------- 2) Outreach with Perplexity Sonar
    if (!PPLX_KEY) {
      return res.status(500).json({ error: 'Missing PERPLEXITY_API_KEY/PPLX_API_KEY on server.' });
    }

    console.log('Making Perplexity outreach call...');
    const ppxModel = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    console.log('Using Perplexity model:', ppxModel);

    const outreachBrief = `
Create non-salesy outreach copy focused on learning & sharing.

Context (JSON):
${JSON.stringify(research, null, 2)}

Rules:
- Never sound salesy; be human, curious, credible.
- Mention Atomicwork only to establish credibility (agentic service management) and prior Freshworks experience if it helps.
- You may reference common AI project failure themes ONLY to empathize, not to pitch.
- Personalize to the lead persona and their company situation based on research.
- Return ONLY JSON in this exact schema:
{
  "linkedin": { "subject": "string", "message": "single string with \\n for new lines" },
  "email": { "subject": "string", "message": "single string with \\n for new lines" }
}
`.trim();

    let ppxCompletion;
    try {
      ppxCompletion = await perplexity.chat.completions.create({
        model: ppxModel,
        // NOTE: Sonar "online" models can browse by default; no special params needed.
        temperature: 0.3,
        messages: [{ role: 'user', content: outreachBrief }],
      });
      console.log('Perplexity API call successful');
    } catch (e) {
      // Common causes: wrong model name or key/entitlements → surface a helpful message.
      console.error('Perplexity API error:', e);
      return res.status(502).json({
        error: 'Perplexity API call failed',
        detail: e?.message || String(e),
      });
    }

    const ppxText = ppxCompletion?.choices?.[0]?.message?.content || '';
    console.log('Perplexity response text length:', ppxText.length);
    // If the API returns an HTML Cloudflare/401 page (common when key is wrong), detect & explain:
    if (/<!doctype html>|<html/i.test(ppxText)) {
      console.log('Perplexity returned HTML (likely auth issue)');
      return res.status(502).json({
        error: 'Perplexity API returned HTML (likely 401/authorization).',
        detail:
          'Double-check PPLX/PERPLEXITY API key and model name. If you are on a restricted tier, ensure your key is entitled for this model.',
      });
    }

    const outreachStr = extractJSON(ppxText);
    console.log('Extracted outreach JSON string:', !!outreachStr);
    if (!outreachStr) {
      console.log('Outreach text sample:', ppxText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse outreach JSON from Perplexity.' });
    }
    const outreach = JSON.parse(outreachStr);
    console.log('Outreach JSON parsed successfully');

    // Final payload consumed by your UI
    return res.json({
      leadPersona: {
        persona: research.persona,
        companyData: research.companyResearch,
        msdContext: research.msmContext,
        aiFailuresThemes: research.aiFailuresThemes,
      },
      outreach,
    });
  } catch (err) {
    console.error('Analyze error:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({ error: 'An internal error occurred during analysis.' });
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
