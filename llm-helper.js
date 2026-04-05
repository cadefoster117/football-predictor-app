// ══════════════════════════════════════════
//  AivsBookie — llm-helper.js
//  LLM API helper using api.llmapi.ai
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

async function callLLM(modelKey, systemPrompt, userPrompt, jsonMode = true) {
  const model = MODELS[modelKey]
  if (!model)     throw new Error(`Unknown model: ${modelKey}`)
  if (!LLMAPI_KEY) throw new Error("LLMAPI_KEY not set in .env")

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   }
    ],
    temperature: 0.5,
    max_tokens:  800
  }

  if (jsonMode) body.response_format = { type: "json_object" }

  const response = await axios.post(BASE_URL, body, {
    headers: {
      Authorization: `Bearer ${LLMAPI_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 60000
  })

  const content = response.data.choices[0].message.content.trim()

  if (!jsonMode) return content

  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error("Could not parse JSON from: " + content.slice(0, 200))
  }
}

module.exports = { callLLM, MODELS }
