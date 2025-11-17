require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testModels() {
  const modelsToTest = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ];

  console.log('Testing Anthropic models with your API key...\n');

  for (const model of modelsToTest) {
    try {
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      console.log(`✅ ${model} - WORKS`);
    } catch (error) {
      if (error.status === 404) {
        console.log(`❌ ${model} - NOT AVAILABLE (404)`);
      } else if (error.status === 401) {
        console.log(`❌ ${model} - AUTH ERROR (401)`);
      } else {
        console.log(`❌ ${model} - ERROR: ${error.message}`);
      }
    }
  }
}

testModels();
