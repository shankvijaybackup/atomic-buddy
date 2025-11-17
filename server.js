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

    // ------- 1) Research with Perplexity (sonar-pro)
    console.log('Making Perplexity research call...');
    const researchModel = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    console.log('Using Perplexity model:', researchModel);

    const researchPrompt = `You are the world's best analyst and researcher.

Objectives:
1) Analyze the pasted LinkedIn lead profile and infer clean, structured persona details including DISC personality analysis.
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
  "persona": { "name": "...", "jobTitle": "...", "level": "...", "industry": "...", "company": "...", "recentActivity": [], "personalQuotes": [], "passions": [], "painPoints": [], "decisionMaking": "...", "discProfile": {"primary": "...", "communication": "..."} },
  "companyResearch": { "name": "...", "industry": "...", "size": "...", "keyProducts": [], "recentNews": [], "strategicInitiatives": [], "risks": [] },
  "msmContext": { "whyAtomicwork": "one short paragraph tying Freshworks → Atomicwork → agentic service management", "nonSalesyPrinciples": ["...","..."] },
  "aiFailuresThemes": ["brief bullet #1","brief bullet #2","brief bullet #3","brief bullet #4"]
}`.trim();

    let researchResp;
    try {
      researchResp = await perplexity.chat.completions.create({
        model: researchModel,
        temperature: 0.2,
        messages: [{ role: 'user', content: researchPrompt }],
      });
      console.log('Perplexity research response received');
    } catch (e) {
      console.error('Perplexity research API error:', e);
      return res.status(502).json({
        error: 'Perplexity research API call failed',
        detail: e?.message || String(e),
      });
    }

    const researchText = researchResp?.choices?.[0]?.message?.content || '';
    console.log('Research text length:', researchText.length);

    // Handle HTML responses from Perplexity
    if (/<!doctype html>|<html/i.test(researchText)) {
      console.log('Perplexity returned HTML (likely auth issue)');
      return res.status(502).json({
        error: 'Perplexity API returned HTML (likely 401/authorization).',
        detail: 'Double-check PPLX/PERPLEXITY API key.',
      });
    }

    const researchJSONStr = extractJSON(researchText);
    console.log('Extracted JSON string:', !!researchJSONStr);
    if (!researchJSONStr) {
      console.log('Research text sample:', researchText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse research JSON from Perplexity.' });
    }
    const research = JSON.parse(researchJSONStr);
    console.log('Research JSON parsed successfully');

    // ------- 2) Outreach with Anthropic
    console.log('Making Anthropic outreach call...');
    const outreachModel = process.env.OPENAI_RESEARCH_MODEL || 'claude-3-7-sonnet-20250219';
    console.log('Using Anthropic model:', outreachModel);

    const outreachBrief = `Create authentic outreach from Atomicwork founder Vijay Shankar - emphasize current role, not past affiliations (300-400 characters total per message).

MY CURRENT POSITION: Vijay Shankar - Atomicwork founder, former Freshworks founder (startup phase), former Zoho/ManageEngine enterprise leader. Currently building agentic service management solutions.

Context (JSON):
${JSON.stringify(research, null, 2)}

Rules:
- Lead with current Atomicwork role and mission
- Reference past experience only to establish credibility (Freshworks founder, Zoho enterprise leader)
- Focus on Atomicwork's unique value proposition
- Be authentic founder-to-founder, not ex-employee
- Address real enterprise pain points directly
- Keep each message between 300-400 characters total
- Return ONLY JSON in this exact schema:
{
  "linkedin": { "subject": "string (50 chars max)", "message": "single string with \\n for new lines (300-400 chars total)" },
  "email": { "subject": "string (50 chars max)", "message": "single string with \\n for new lines (300-400 chars total)" }
}`.trim();

    let outreachResp;
    try {
      outreachResp = await anthropic.messages.create({
        model: outreachModel,
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{ role: 'user', content: outreachBrief }],
      });
      console.log('Anthropic outreach response received');
    } catch (e) {
      console.error('Anthropic outreach API error:', e);
      return res.status(502).json({
        error: 'Anthropic outreach API call failed',
        detail: e?.message || String(e),
      });
    }

    const outreachText = outreachResp.content?.[0]?.text || '';
    console.log('Outreach text length:', outreachText.length);

    const outreachStr = extractJSON(outreachText);
    console.log('Extracted outreach JSON string:', !!outreachStr);
    if (!outreachStr) {
      console.log('Outreach text sample:', outreachText.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse outreach JSON from Anthropic.' });
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
