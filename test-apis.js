require('dotenv').config();
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

async function testAPIs() {
  console.log('Testing API keys...\n');

  // Test Anthropic
  try {
    console.log('Testing Anthropic API...');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "Hello"' }],
    });

    console.log('✅ Anthropic API: OK');
    console.log('   Response:', response.content[0].text.trim());
  } catch (error) {
    console.log('❌ Anthropic API: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('');

  // Test Perplexity
  try {
    console.log('Testing Perplexity API...');
    const perplexity = new OpenAI({
      apiKey: process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });

    const response = await perplexity.chat.completions.create({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      max_tokens: 10,
    });

    console.log('✅ Perplexity API: OK');
    console.log('   Response:', response.choices[0].message.content.trim());
  } catch (error) {
    console.log('❌ Perplexity API: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('');

  // Test OpenAI (optional, since we're not using it)
  try {
    console.log('Testing OpenAI API...');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for testing
      messages: [{ role: 'user', content: 'Say "Hi"' }],
      max_tokens: 5,
    });

    console.log('✅ OpenAI API: OK');
    console.log('   Response:', response.choices[0].message.content.trim());
  } catch (error) {
    console.log('❌ OpenAI API: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\nAPI testing complete!');
}

testAPIs();
