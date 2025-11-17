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

    // ------- Single Perplexity call for everything (faster!)
    console.log('Making Perplexity call for research + outreach...');
    const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    console.log('Using Perplexity model:', model);

    const combinedPrompt = `You are an expert analyst. Analyze the lead profile, research their company, and generate outreach.

MY POSITION: Vijay Shankar - Atomicwork founder, former Freshworks founder, former Zoho/ManageEngine leader.

INPUTS:
- LEAD PROFILE: """${targetProfile}"""
- COMPANY CONTEXT: """${knowledgeBase || 'N/A'}"""

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
      },
      outreach: data.outreach || {},
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
