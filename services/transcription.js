// services/transcription.js
const fs = require('fs');
const path = require('path');
const { openai, WHISPER_MODEL } = require('./aiConfig');

async function transcribeFile(filePath) {
  const fileStream = fs.createReadStream(filePath);

  // Using OpenAI Whisper API
  const response = await openai.audio.transcriptions.create({
    model: WHISPER_MODEL,
    file: fileStream,
  });

  // Response will contain text
  const text = response.text || '';

  return text;
}

module.exports = { transcribeFile };
