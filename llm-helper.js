// llm-helper.js
const axios = require('axios');
require('dotenv').config();

const LLMAPI_KEY = process.env.LLMAPI_KEY;
const BASE_URL = 'https://api.llmapi.ai/v1';

if (!LLMAPI_KEY) {
  console.error('❌ LLMAPI_KEY is missing in .env file');
}

const models = {
  gemini:   'google/gemini-2.5-flash',      // fast & good value
  deepseek: 'deepseek/deepseek-chat',       // very cost-effective
  gpt:      'openai/gpt-4o-mini'            // balanced
};

async function callLLM(modelKey, systemPrompt, userPrompt) {
  const model = models[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await axios.post(`${BASE_URL}/chat/completions`, {
      model: model,
      messages: messages,
      temperature: 0.55,
      max_tokens: 700,
      response_format: { type: "json_object" }
    }, {
      headers: {
        Authorization: `Bearer ${LLMAPI_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const content = response.data.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ ${modelKey.toUpperCase()} failed:`, error.response?.data?.error?.message || error.message);
    return {
      vote: "ERROR",
      confidence: 0,
      reason: `API call failed for ${modelKey}. Please try again later.`
    };
  }
}

module.exports = { callLLM, models };
