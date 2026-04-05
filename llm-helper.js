// ══════════════════════════════════════════
//  AivsBookie — llm-helper.js
//  LLM API helper using api.llmapi.ai
//  NOTE: json_object mode disabled for Gemini
// ══════════════════════════════════════════

require("dotenv").config()
const axios = require("axios")

const LLMAPI_KEY = process.env.LLMAPI_KEY
const BASE_URL   = "https://api.llmapi.ai/v1/chat/completions"

const MODELS = {
  gemini:   "google/gemini-2.5-flash",
  deepseek: "deepseek/deepseek-chat",
  gpt:      "openai/gpt-4o-mini"
}

// Models that do NOT support response_format json_object
const NO_JSON_MODE = ["gemini"]

async function callLLM(modelKey, systemPrompt, userPrompt, jsonMode = true) {
  const model = MODELS[modelKey]
  if (!model)      throw new Error(`Unknown model: ${modelKey}`)
  if (!LLMAPI_KEY) throw new Error("LLMAPI_KEY not set in .env")

  const useJsonMode = jsonMode && !NO_JSON_MODE.includes(modelKey)

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   }
    ],
    temperature: 0.5,
    max_tokens:  800
  }

  if (useJsonMode) body.response_format = { type: "json_object" }

  const response = await axios.post(BASE_URL, body, {
    headers: {
      Authorization: `Bearer ${LLMAPI_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 60000
  })

  const content = response.data.choices[0].message.content.trim()

  if (!jsonMode) return content

  // Try to parse JSON — strip markdown fences if present
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    throw new Error("Could not parse JSON from model response: " + content.slice(0, 200))
  }
}

module.exports = { callLLM, MODELS }
