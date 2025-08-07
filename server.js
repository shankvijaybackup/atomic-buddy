// Forcing a new commit for deployment update
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
app.use(express.static('public'));

// Helper function to extract JSON from AI responses
const extractJSON = (response) => {
  try {
    // Remove all markdown formatting
    let cleanResponse = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/^I apologize[\s\S]*?(?=\{)/, '') // Remove Claude's apology text
      .trim();

    // Find JSON object
    const jsonStart = cleanResponse.indexOf('{');
    const jsonEnd = cleanResponse.lastIndexOf('}') + 1;
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = cleanResponse.substring(jsonStart, jsonEnd);
      return cleanJSON(jsonStr);
    }
    
    return cleanJSON(cleanResponse);
  } catch (error) {
    console.error('JSON extraction error:', error);
    console.log('Problematic response:', response.substring(0, 200));
    return response.trim();
  }
};

// Helper function to clean JSON strings
const cleanJSON = (jsonString) => {
  return jsonString
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .trim();
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

// API Routes

// Upload files
app.post('/api/upload', (req, res) => {
  upload.array('files')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 500MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Too many files. Maximum 50 files at once.' });
        }
      }
      return res.status(500).json({ error: 'Upload failed' });
    }

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

// Analyze profile and generate outreach
app.post('/api/analyze', async (req, res) => {
  try {
    const { userProfile, targetProfile, knowledgeBase } = req.body;

    if (!userProfile || !targetProfile) {
      return res.status(400).json({ error: 'Both user profile and target profile are required' });
    }

    console.log('Starting analysis...');

    // Use placeholder for user name
    const userName = "{{Your Name}}";
    console.log('Using placeholder name:', userName);

// Step 1: Analyze target profile with DEEP content analysis
    const personaPrompt = `
      Analyze this complete LinkedIn profile including recent posts, activities, and company information:
      
      Profile: "${targetProfile.replace(/"/g, '\\"')}"
      
      Extract SPECIFIC details including:
      - Recent post topics and themes
      - Specific quotes or messages they've shared
      - Events they've participated in
      - Causes they care about
      - Company information (size, industry, recent news, achievements)
      - Company performance data or stats mentioned
      - Any Account IQ or business metrics referenced
      
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
        "companyData": {
          "name": "company name",
          "industry": "industry sector",
          "size": "company size if mentioned",
          "recentNews": ["any company achievements, news, or updates mentioned"],
          "businessMetrics": ["any performance data, growth stats, or Account IQ mentioned"],
          "challenges": ["company-specific challenges or transformation initiatives"]
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

// Step 2: Generate outreach with company-specific insights
    const basePrompt = `
      TARGET PROFILE: 
      - Name: ${personaData.persona.name}
      - Title: ${personaData.persona.jobTitle} 
      - Company: ${personaData.persona.company}
      - Industry: ${personaData.persona.industry}
      - Recent Activity: ${personaData.persona.recentActivity?.join(', ') || 'Not available'}
      - Personal Quotes: ${personaData.persona.personalQuotes?.join(', ') || 'Not available'}
      - Passions: ${personaData.persona.passions?.join(', ') || 'Not available'}
      
      COMPANY INSIGHTS:
      - Company: ${personaData.companyData?.name || 'Not available'}
      - Industry: ${personaData.companyData?.industry || 'Not available'}
      - Recent Company News: ${personaData.companyData?.recentNews?.join(', ') || 'Not available'}
      - Business Metrics: ${personaData.companyData?.businessMetrics?.join(', ') || 'Not available'}
      - Company Challenges: ${personaData.companyData?.challenges?.join(', ') || 'Not available'}
      
      YOUR NAME: {{Your Name}}
      YOUR BACKGROUND: Ex-Freshworks founder, ITIL expert, now building Atomicwork's agentic service management platform
      
      CRITICAL RULES:
      1. START by acknowledging their recent posts/activities specifically
      2. Reference specific company data, metrics, or recent news if available
      3. Connect their company's challenges to Atomicwork's capabilities
      4. Show genuine knowledge about their company's situation
      5. Use proper formatting - NO em-dashes, NO special characters
      6. Be specific about industry trends relevant to their company
      7. Reference actual business metrics or performance data if mentioned
      8. Make it feel like you've researched their company thoroughly
      
      Focus on demonstrating knowledge of their business context, not generic pitches.
    `;

    let openaiData, claudeData, geminiData;

    // OpenAI - Direct & Technical
    try {
      const openaiPrompt = `${basePrompt}
        Create DIRECT, TECHNICAL outreach acknowledging their specific recent activities.
        
        CRITICAL: Return ONLY valid JSON. No explanations, no markdown, no code blocks.
        
        {"linkedin":{"subject":"technical subject under 50 chars","message":"message under 250 chars"},"email":{"subject":"technical email subject","message":"email under 100 words"}}
      `;

      const openaiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: openaiPrompt }],
        max_tokens: 800
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
        Create FORMAL, ENTERPRISE outreach acknowledging their specific recent activities.
        
        CRITICAL: Return ONLY valid JSON. No explanations, no apologies, no markdown.
        
        {"linkedin":{"subject":"formal subject under 50 chars","message":"message under 250 chars"},"email":{"subject":"formal email subject","message":"email under 100 words"}}
      `;

      const claudeMessage = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
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
        Create PERSONALIZED outreach acknowledging their specific recent activities.
        
        CRITICAL: Return ONLY valid JSON. No markdown code blocks, no explanations.
        
        {"linkedin":{"subject":"personal subject under 50 chars","message":"message under 250 chars"},"email":{"subject":"personal email subject","message":"email under 100 words"}}
      `;

      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const geminiResponse = await geminiModel.generateContent(geminiPrompt);
      
      console.log('Raw Gemini response:', geminiResponse.response.text());
      
      geminiData = JSON.parse(extractJSON(geminiResponse.response.text()));
      console.log('Gemini analysis completed');
    } catch (error) {
      console.error('Gemini error:', error);
      geminiData = {
        linkedin: { subject: "Industry Connect", message: "Error generating content" },
        email: { subject: "Industry Connect", message: "Error generating content" }
      };
    }

// Return combined results
    const result = {
      persona: personaData.persona,
      discProfile: personaData.discProfile,
      companyData: personaData.companyData,
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Atomicwork Outreach App running on port ${PORT}`);
  console.log(`Access the app at: http://localhost:${PORT}`);
});