const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

const extractJSON = (text) => {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
};

app.post('/api/analyze', async (req, res) => {
    try {
        const { userProfile, targetProfile, knowledgeBase } = req.body;

        if (!userProfile || !targetProfile) {
            return res.status(400).json({ error: 'User and target profiles are required.' });
        }
        
        const personaPrompt = `
          You are an expert data processor and personality analyst. The following text is a raw copy-paste from LinkedIn pages, containing a lot of irrelevant UI text.

          Your first job is to intelligently parse the raw text to find the actual, meaningful profile information, IGNORING all UI elements.

          After you have mentally isolated the clean profile data, perform a deep analysis and generate a single, valid JSON object with the following structure. Do not include any explanatory text or markdown.

          RAW LEAD PROFILE TEXT: """${targetProfile}"""
          RAW COMPANY PROFILE TEXT: """${knowledgeBase}"""

          Return ONLY the JSON object:
          {
            "persona": { "name": "...", "jobTitle": "...", "level": "...", "industry": "...", "company": "...", "recentActivity": [], "personalQuotes": [], "passions": [], "painPoints": [], "decisionMaking": "..." },
            "companyData": { "name": "...", "industry": "...", "size": "...", "recentNews": [], "businessMetrics": [], "challenges": [] },
            "discProfile": { "primary": "...", "traits": [], "communication": "..." },
            "oceanProfile": {
                "openness": { "score": "integer 0-10", "summary": "brief summary" },
                "conscientiousness": { "score": "integer 0-10", "summary": "brief summary" },
                "extraversion": { "score": "integer 0-10", "summary": "brief summary" },
                "agreeableness": { "score": "integer 0-10", "summary": "brief summary" },
                "neuroticism": { "score": "integer 0-10", "summary": "brief summary" }
            }
          }
        `;

        const personaMessage = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 2000,
            messages: [{ role: "user", content: personaPrompt }]
        });

        const jsonString = extractJSON(personaMessage.content[0].text);
        if (!jsonString) {
            console.error("Failed to extract JSON from persona analysis:", personaMessage.content[0].text);
            return res.status(500).json({ error: 'Failed to parse persona analysis from AI response.' });
        }

        const personaData = JSON.parse(jsonString);
        console.log('Persona analysis completed successfully.');

        const basePrompt = `
          TARGET PROFILE:
          - Name: ${personaData.persona.name}
          - Title: ${personaData.persona.jobTitle}
          - Company: ${personaData.persona.company}
          - Recent Activity: ${personaData.persona.recentActivity?.join(', ') || 'Not available'}
          COMPANY INSIGHTS:
          - Recent Company News: ${personaData.companyData?.recentNews?.join(', ') || 'Not available'}
          - Business Metrics: ${personaData.companyData?.businessMetrics?.join(', ') || 'Not available'}
          YOUR BACKGROUND: Ex-Freshworks founder, ITIL expert, now building Atomicwork's agentic service management platform.
        `;
        
        const jsonFormatRule = `CRITICAL RULE: Return a single, valid JSON object and nothing else. All strings within the JSON must be properly escaped. Specifically, any newline characters in the 'message' fields MUST be represented as \\n.`;

        // =================================================================
        // THE FIX: Adding a more explicit rule for Gemini to prevent bad escape characters.
        // =================================================================
        const geminiJsonFormatRule = `${jsonFormatRule} IMPORTANT: Do not use any single backslashes (\\) in the message text unless it is for a newline (\\n).`

        const outreachPromises = [
            openai.chat.completions.create({ model: "gpt-4", messages: [{ role: "user", content: `${basePrompt} Generate a DIRECT & TECHNICAL message. ${jsonFormatRule} JSON format: {"linkedin":{"subject": "s", "message": "m"},"email":{"subject": "s", "message": "m"}}` }], max_tokens: 800 }),
            anthropic.messages.create({ model: "claude-3-5-sonnet-20240620", messages: [{ role: "user", content: `${basePrompt} Generate a FORMAL & ENTERPRISE message. ${jsonFormatRule} JSON format: {"linkedin":{"subject": "s", "message": "m"},"email":{"subject": "s", "message": "m"}}` }], max_tokens: 800 }),
            genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(`${basePrompt} Generate a PERSONALIZED & RELATIONSHIP-FOCUSED message. ${geminiJsonFormatRule} JSON format: {"linkedin":{"subject": "s", "message": "m"},"email":{"subject": "s", "message": "m"}}`)
        ];
        
        const [openaiRes, claudeRes, geminiRes] = await Promise.allSettled(outreachPromises);

        const getJson = (response, modelName) => {
            try {
                if (response.status === 'fulfilled') {
                    const text = modelName === 'openai' ? response.value.choices[0].message.content :
                                 modelName === 'claude' ? response.value.content[0].text :
                                 response.value.response.text();
                    
                    const jsonStr = extractJSON(text);
                    if (!jsonStr) { throw new Error(`Could not extract JSON from ${modelName}`); }
                    return JSON.parse(jsonStr);
                }
            } catch (e) { console.error(`Error parsing ${modelName} JSON`, e); }
            return { linkedin: { subject: "Error", message: "Error generating content." }, email: { subject: "Error", message: "Error generating content." } };
        };

        const result = {
            leadPersona: {
                persona: personaData.persona,
                discProfile: personaData.discProfile,
                oceanProfile: personaData.oceanProfile,
                companyData: personaData.companyData,
            },
            outreach: {
                direct: getJson(openaiRes, 'openai'),
                formal: getJson(claudeRes, 'claude'),
                personalized: getJson(geminiRes, 'gemini')
            }
        };

        res.json(result);

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'An internal error occurred during analysis.' });
    }
});

app.listen(PORT, () => {
    console.log(`Atomicwork Outreach App running on port ${PORT}`);
    console.log(`Access the app at: http://localhost:${PORT}`);
});