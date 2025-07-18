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
    // Remove all markdown formatting first
    let cleanResponse = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\*\*/g, '')  // Remove bold markdown
      .replace(/\*/g, '')    // Remove italic markdown
      .replace(/#{1,6}\s*/g, '') // Remove headers
      .trim();

    // Find the JSON object
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return cleanJSON(jsonMatch[0]);
    }
    
    // If no JSON found, try the original response
    return cleanJSON(cleanResponse);
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

    // Step 1: Analyze target profile with DEEP content analysis
    const personaPrompt = `
      Analyze this complete LinkedIn profile including recent posts and activities:
      
      Profile: "${targetProfile}"
      
      Extract SPECIFIC details from their recent posts, comments, and activities. Look for:
      - Recent post topics and themes
      - Specific quotes or messages they've shared
      - Events they've participated in
      - Causes they care about
      - Their personal mission/passion
      
      Return ONLY valid JSON without markdown formatting:
      {
        "persona": {
          "name": "first name only",
          "jobTitle": "exact job title",
          "level": "entry/mid/senior/executive/c-suite",
          "industry": "specific industry",
          "company": "company name",
          "recentActivity": ["specific recent posts/activities from profile"],
          "personalQuotes": ["any quotes or key messages they've shared"],
          "passions": ["what they're passionate about based on posts"],
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
  // Update the basePrompt to include specific recent activity
    const basePrompt = `
      TARGET PROFILE: 
      - Name: ${personaData.persona.name}
      - Title: ${personaData.persona.jobTitle} 
      - Company: ${personaData.persona.company}
      - Industry: ${personaData.persona.industry}
      - Recent Activity: ${personaData.persona.recentActivity?.join(', ') || 'Not available'}
      - Personal Quotes: ${personaData.persona.personalQuotes?.join(', ') || 'Not available'}
      - Passions: ${personaData.persona.passions?.join(', ') || 'Not available'}
      
      YOUR NAME: ${userName}
      YOUR BACKGROUND: Ex-Freshworks founder, ITIL expert, now building Atomicwork's agentic service management platform
      
      CRITICAL RULES:
      1. START by acknowledging their recent posts/activities specifically
      2. Reference their actual quotes, events, or initiatives they mentioned
      3. Connect their passions to your Atomicwork journey authentically
      4. Show genuine appreciation for their work before any business context
      5. Make it feel like you actually READ their profile and posts
      6. Be authentic about shared values (mentorship, transformation, etc.)
      7. NEVER generic pitches - everything must be specific to their recent content
      8. Use real name ${userName} not placeholders
      
      Focus on human connection first, Atomicwork's relevance second.
    `;

    let openaiData, claudeData, geminiData;

    // OpenAI - Direct & Technical
    // OpenAI - Direct & Technical
    try {
      const openaiPrompt = `${basePrompt}
        Create DIRECT, TECHNICAL outreach that acknowledges their specific recent activities.
        Reference their actual posts, quotes, or initiatives before connecting to Atomicwork.
        
        {"linkedin":{"subject":"technical subject under 50 chars referencing their work","message":"message under 250 chars acknowledging their specific recent posts then connecting to Atomicwork's technical capabilities"},"email":{"subject":"technical email subject referencing their activity","message":"email under 100 words acknowledging their specific work then discussing Atomicwork's agentic ITSM relevance"}}
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
        Create DIRECT, TECHNICAL outreach that acknowledges their specific recent activities.
        Reference their actual posts, quotes, or initiatives before connecting to Atomicwork.
        
        {"linkedin":{"subject":"technical subject under 50 chars referencing their work","message":"message under 250 chars acknowledging their specific recent posts then connecting to Atomicwork's technical capabilities"},"email":{"subject":"technical email subject referencing their activity","message":"email under 100 words acknowledging their specific work then discussing Atomicwork's agentic ITSM relevance"}}
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
    // Gemini - Personalized & Relationship
    try {
      const geminiPrompt = `${basePrompt}
        Create PERSONALIZED outreach acknowledging their specific recent activities and posts.
        Reference their actual content before connecting to Atomicwork's relevance.
        
        IMPORTANT: Return ONLY raw JSON without any markdown, asterisks, or formatting.
        
        {"linkedin":{"subject":"personal subject under 50 chars referencing their posts","message":"message under 250 chars acknowledging specific recent activities then connecting to Atomicwork"},"email":{"subject":"personal email subject referencing their work","message":"email under 100 words acknowledging specific posts then discussing Atomicwork's industry relevance"}}
        
        No markdown formatting. No asterisks. No code blocks. Just pure JSON.
      `;

      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const geminiResponse = await geminiModel.generateContent(geminiPrompt);
      
      console.log('Raw Gemini response:', geminiResponse.response.text()); // Debug log
      
      geminiData = JSON.parse(extractJSON(geminiResponse.response.text()));
      console.log('Gemini analysis completed');
    } catch (error) {
      console.error('Gemini error:', error);
      console.log('Gemini raw response that failed:', geminiResponse?.response?.text?.());
      geminiData = {
        linkedin: { subject: "Industry Connect", message: "Error generating Gemini content" },
        email: { subject: "Industry Connect", message: "Error generating Gemini content" }
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