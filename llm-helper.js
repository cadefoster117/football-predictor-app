// ══════════════════════════════════════════
//  AivsBookie — llm-helper.js
//  LLM API helper using app.llmapi.ai
//  Supports: Gemini, DeepSeek, GPT-4o-mini
// ══════════════════════════════════════════

require("dotenv").config()
const axios = require("axios")

const LLMAPI_KEY = process.env.LLMAPI_KEY
const BASE_URL   = "https://app.llmapi.com/api/chat/completions"

const MODELS = {
  gemini:   "google/gemini-2.5-flash",
  deepseek: "deepseek/deepseek-chat",
  gpt:      "openai/gpt-4o-mini"
}

// Call a model via llmapi.ai
// Returns parsed JSON object from model response
async function callLLM(modelKey, systemPrompt, userPrompt) {
  const model = MODELS[modelKey]
  if (!model) throw new Error(`Unknown model: ${modelKey}`)
  if (!LLMAPI_KEY) throw new Error("LLMAPI_KEY not set in .env")

  const response = await axios.post(
    BASE_URL,
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt }
      ],
      temperature:     0.5,
      max_tokens:      500,
      response_format: { type: "json_object" }
    },
    {
      headers: {
        Authorization: `Bearer ${LLMAPI_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  )

  const content = response.data.choices[0].message.content.trim()

  try {
    return JSON.parse(content)
  } catch {
    // Try to extract JSON if wrapped in markdown
    const match = content.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error("Could not parse JSON from model response: " + content.slice(0, 200))
  }
}

module.exports = { callLLM, MODELS }
