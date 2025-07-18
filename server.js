const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// AI SDK imports
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize AI clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
// Serve static files like app.js from the root directory
// Serve static files from the 'public' directory
app.use(express.static('public'));

// For any non-API request, send the index.html file from the 'public' directory
// This is the correct setup for a Single Page Application with your file structure
app.get('*', (req, res) => {
  // Check if the request is not for an API endpoint
  if (!req.originalUrl.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    // If it's an API route that wasn't found, send a proper 404
    res.status(404).json({ error: 'API route not found' });
  }
});

// Helper function to extract JSON from AI responses
// Helper function to extract JSON from AI responses
const extractJSON = (response) => {
  try {
    // First try to find JSON in code blocks
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return cleanJSON(jsonMatch[1].trim());
    }
    
    // Then try to find JSON object directly
    const directJsonMatch = response.match(/\{[\s\S]*\}/);
    if (directJsonMatch) {
      return cleanJSON(directJsonMatch[0].trim());
    }
    
    // Clean and return the response as-is
    return cleanJSON(response.trim());
  } catch (error) {
    console.error('JSON extraction error:', error);
    return response.trim();
  }
};

// Helper function to clean JSON strings
const cleanJSON = (jsonString) => {
  // Remove control characters and fix common issues
  return jsonString
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/"/g, '\\"') // Escape quotes
    .replace(/\\"/g, '"') // Fix double escaping
    .replace(/\\\\/g, '\\'); // Fix double backslashes
};
// Configure file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 500 * 1024 * 1024,  // 500MB limit
    files: 50  // Maximum 50 files at once
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});
// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB per file.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 50 files at once.' });
    }
  }
  next(error);
});
// Start server
// API Routes

// Upload files
// Refactored Upload files route
app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map(file => ({
      name: file.originalname,
      path: file.path,
      size: file.size,
      type: file.mimetype,
      uploaded: new Date().toISOString()
    }));

    res.json({ files });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Failed to process files' });
  }
});

// Get uploaded files
app.get('/api/files', (req, res) => {
  try {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(uploadDir).map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);
      return {
        name: filename,
        path: filePath,
        size: stats.size,
        uploaded: stats.mtime.toISOString()
      };
    });

    res.json({ files });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Analyze profile and generate outreach
app.post('/api/analyze', async (req, res) => {
  try {
    const { userProfile, targetProfile, knowledgeBase } = req.body;

    if (!userProfile || !targetProfile) {
      return res.status(400).json({ error: 'Both user profile and target profile are required' });
    }

    console.log('Starting analysis...');

    // Extract user name from profile
    const userNameMatch = userProfile.match(/Name[:\s]+([^\n]+)/i) || 
                         userProfile.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    const userName = userNameMatch ? userNameMatch[1].trim() : "Your Name";

    // Step 1: Analyze target profile
    const personaPrompt = `
      Analyze this LinkedIn profile and extract information. Return valid JSON only:
      
      Profile: "${targetProfile.replace(/"/g, '\\"')}"
      
      {
        "persona": {
          "name": "first name only",
          "jobTitle": "exact job title",
          "level": "entry/mid/senior/executive/c-suite",
          "industry": "specific industry", 
          "company": "company name",
          "painPoints": ["role-specific pain points"],
          "decisionMaking": "decision style"
        },
        "discProfile": {
          "primary": "D/I/S/C with brief description",
          "traits": ["key personality traits"],
          "communication": "communication preferences"
        }
      }
    `;

    const personaMessage = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages: [{ role: "user", content: personaPrompt }]
    });

    let personaData;
    try {
      const cleanedResponse = extractJSON(personaMessage.content[0].text);
      personaData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Persona parsing error:', parseError);
      return res.status(500).json({ error: 'Failed to parse persona analysis' });
    }

    console.log('Persona analysis completed');

    // Step 2: Generate outreach with strict guidelines
    // Step 2: Generate outreach with Atomicwork focus
    const basePrompt = `
      TARGET: Name: ${personaData.persona.name}, Title: ${personaData.persona.jobTitle}, Company: ${personaData.persona.company}, Industry: ${personaData.persona.industry}
      YOUR NAME: ${userName}
      YOUR BACKGROUND: Ex-Freshworks founder, ITIL expert, now building Atomicwork
      
      ATOMICWORK CONTEXT:
      - Atomicwork is an agentic service management platform
      - Revolutionary AI-powered ITSM solution 
      - Transforms how enterprises handle service delivery
      - Built by ex-Freshworks founder with deep ITSM expertise
      - Specifically designed for modern enterprise needs
      
      KNOWLEDGE BASE: ${knowledgeBase ? knowledgeBase.length : 0} Atomicwork documents available
      
      STRICT RULES:
      1. Focus on Atomicwork's agentic service management capabilities
      2. Reference your Freshworks founder credibility to establish authority
      3. Connect their ${personaData.persona.industry} challenges to Atomicwork's solutions
      4. Share insights about modern ITSM transformation
      5. NEVER mention fake companies or made-up case studies
      6. Keep LinkedIn messages under 250 characters
      7. Keep emails under 100 words
      8. Never add signatures - content only
      9. Use real name ${userName} not placeholders
      10. Position Atomicwork as the next evolution in service management
      
      Focus on how Atomicwork's agentic approach solves specific ${personaData.persona.industry} service management challenges.
    `;

    let openaiData, claudeData, geminiData;

    // OpenAI - Direct & Technical
    // OpenAI - Direct & Technical
    try {
      const openaiPrompt = `${basePrompt}
        Create DIRECT, TECHNICAL outreach about Atomicwork's agentic service management platform.
        Connect your Freshworks founder experience to building Atomicwork for ${personaData.persona.industry} challenges.
        
        {"linkedin":{"subject":"technical subject under 45 chars","message":"direct message under 250 chars about Atomicwork's technical capabilities"},"email":{"subject":"technical email subject","message":"concise email under 100 words about Atomicwork's agentic ITSM approach"}}
      `;

      const openaiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: openaiPrompt }],
        max_tokens: 600
      });

      openaiData = JSON.parse(extractJSON(openaiResponse.choices[0].message.content));
      console.log('OpenAI analysis completed');
    } catch (error) {
      console.error('OpenAI error:', error);
      openaiData = {
        linkedin: { subject: "Atomicwork Technical Insights", message: "Error generating content" },
        email: { subject: "Atomicwork Technical Insights", message: "Error generating content" }
      };
    }

    // Claude - Formal & Enterprise
    try {
      const claudePrompt = `${basePrompt}
        Create FORMAL, ENTERPRISE outreach about Atomicwork's strategic value for ${personaData.persona.industry}.
        Position Atomicwork as the next-gen service management solution built by ex-Freshworks founder.
        
        {"linkedin":{"subject":"strategic subject under 45 chars","message":"formal message under 250 chars about Atomicwork's enterprise value"},"email":{"subject":"strategic email subject","message":"concise email under 100 words about Atomicwork's strategic advantages"}}
      `;

      const claudeMessage = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 600,
        messages: [{ role: "user", content: claudePrompt }]
      });

      claudeData = JSON.parse(extractJSON(claudeMessage.content[0].text));
      console.log('Claude analysis completed');
    } catch (error) {
      console.error('Claude error:', error);
      claudeData = {
        linkedin: { subject: "Atomicwork Enterprise Strategy", message: "Error generating content" },
        email: { subject: "Atomicwork Enterprise Strategy", message: "Error generating content" }
      };
    }

    // Gemini - Personalized & Relationship
    try {
      const geminiPrompt = `${basePrompt}
        Create PERSONALIZED outreach about Atomicwork's relevance to ${personaData.persona.name}'s ${personaData.persona.industry} challenges.
        Connect your Freshworks founder journey to building Atomicwork for their specific needs.
        
        {"linkedin":{"subject":"personal subject under 45 chars","message":"personalized message under 250 chars about Atomicwork's relevance"},"email":{"subject":"personal email subject","message":"concise email under 100 words about Atomicwork's industry-specific value"}}
      `;

      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const geminiResponse = await geminiModel.generateContent(geminiPrompt);
      geminiData = JSON.parse(extractJSON(geminiResponse.response.text()));
      console.log('Gemini analysis completed');
    } catch (error) {
      console.error('Gemini error:', error);
      geminiData = {
        linkedin: { subject: "Atomicwork Industry Connect", message: "Error generating content" },
        email: { subject: "Atomicwork Industry Connect", message: "Error generating content" }
      };
    }

    // Return combined results
    const result = {
      persona: personaData.persona,
      discProfile: personaData.discProfile,
      userName: userName,
      outreach: {
        direct: openaiData,
        formal: claudeData,
        personalized: geminiData
      }
    };

    res.json(result);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze profile and generate outreach' });
  }
});
app.listen(PORT, () => {
  console.log(`Atomicwork Outreach App running on port ${PORT}`);
  console.log(`Access the app at: http://localhost:${PORT}`);
});