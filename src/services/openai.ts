/**
 * Minimal OpenAI Chat Completions client. Non-streaming.
 *
 * The API key is supplied by the caller (stored on-device in Settings) and is
 * never logged or persisted here.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[]
}

type ErrorResponse = {
  error?: { message?: string }
}

/** Send a chat completion request and return the assistant's reply text. */
export async function chatComplete(
  apiKey: string,
  messages: ChatMessage[],
  model?: string,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: model ?? DEFAULT_MODEL, messages }),
  })

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as ErrorResponse
      if (body.error?.message) detail = body.error.message
    } catch {
      /* body not JSON — keep the status-based message */
    }
    throw new Error(`OpenAI request failed: ${detail}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('OpenAI response did not include a message.')
  }
  return content
}
