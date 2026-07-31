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
    throw new Error(`openai request failed: ${detail}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('openai response did not include a message.')
  }
  return content
}

/* ---------------------------------------------------- function-calling API */

export type Tool = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type RawToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type RawMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: RawToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type AssistantTurn = {
  /** The raw assistant message to append back into the history for the next call. */
  message: RawMessage
  content: string | null
  toolCalls: { id: string; name: string; arguments: string }[]
}

/** Chat completion that may return tool calls (for letting the assistant edit the plan). */
export async function chatCompleteRaw(
  apiKey: string,
  messages: RawMessage[],
  opts?: { model?: string; tools?: Tool[] },
): Promise<AssistantTurn> {
  // In local dev, route through the Vite dev proxy (/api/chat), which injects an
  // Epic (or OpenAI) key server-side and can reach the internal Epic LLM proxy.
  // In the deployed build there's no such server, so we call OpenAI directly.
  const useDevProxy = import.meta.env.DEV
  const res = useDevProxy
    ? await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, tools: opts?.tools, model: opts?.model }),
      })
    : await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts?.model ?? DEFAULT_MODEL,
          messages,
          ...(opts?.tools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        }),
      })

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as ErrorResponse
      if (body.error?.message) detail = body.error.message
    } catch {
      /* keep status-based message */
    }
    throw new Error(`openai request failed: ${detail}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: RawToolCall[] } }[]
  }
  const msg = data.choices?.[0]?.message ?? { content: '' }
  const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }))
  return {
    message: { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls },
    content: msg.content ?? null,
    toolCalls,
  }
}
