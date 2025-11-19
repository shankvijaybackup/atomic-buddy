// services/aiConfig.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-large';
const CLASSIFIER_MODEL = 'gpt-4o-mini'; // cheap & good
const WHISPER_MODEL = 'whisper-1'; // standard Whisper model

module.exports = {
  openai,
  EMBEDDING_MODEL,
  CLASSIFIER_MODEL,
  WHISPER_MODEL,
};
