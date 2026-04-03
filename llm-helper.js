// llm-helper.js
const axios = require('axios');
require('dotenv').config();

const LLMAPI_KEY = process.env.LLMAPI_KEY;
const BASE_URL = 'https://api.llmapi.ai/v1';

if (!LLMAPI_KEY) {
  console.warn('⚠️  LLMAPI_KEY not found in .env');
}

const models = {
  gemini:   'google/gemini-2.5-flash',
  claude:   'anthropic/claude-3-5-sonnet-latest',
  deepseek: 'deepseek/deepseek-chat',
  gpt:      'openai/gpt-4o-mini'
};

async function callLLM(modelKey, systemPrompt, userPrompt) {
  const model = models[modelKey];
  if (!model) throw new Error(`Unknown model key: ${modelKey}`);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await axios.post(`${BASE_URL}/chat/completions`, {
      model: model,
      messages: messages,
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: "json_object" }
    }, {
      headers: {
        Authorization: `Bearer ${LLMAPI_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 45000
    });

    const content = response.data.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ ${modelKey} failed:`, error.message);
    return {
      vote: "ERROR",
      confidence: 0,
      reason: `Call failed: ${error.message.substring(0, 120)}...`
    };
  }
}

module.exports = { callLLM, models };
