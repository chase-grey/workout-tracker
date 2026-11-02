/**
 * Translating the coach's conversation between OpenAI's wire shape and
 * Anthropic's.
 *
 * The coach keeps its history in OpenAI's chat-completions shape (see
 * services/openai.RawMessage) and the tool loop in ChatTab is written against
 * it. Rather than teach that loop a second shape, an Anthropic turn goes out
 * as a translation of the same history and comes back translated into the same
 * shape — so a tool call Claude made reads back to the loop exactly as one
 * from GPT would, and the id it chose rides along in tool_call_id to be
 * answered next turn.
 *
 * Pure, so the translation can be tested without a network or the SDK.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { AssistantTurn, RawMessage, RawToolCall, Tool } from '../services/openai'

type BetaMessageParam = Anthropic.Beta.BetaMessageParam
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam

export type AnthropicRequest = {
  /** Every system message, joined; '' when there were none. */
  system: string
  messages: BetaMessageParam[]
}

/** JSON the model wrote for a tool call, or an empty object when it was cut off or mangled. */
function parseArgs(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * An OpenAI-shaped history as Anthropic's `system` plus `messages`.
 *
 * System messages come out of the sequence into `system`, whatever their
 * position. Tool results become `tool_result` blocks in a user message, and a
 * run of them shares one message: Anthropic wants every result for a turn's
 * calls together, and splitting them teaches the model to stop calling tools
 * in parallel. Empty content is dropped rather than sent, since an empty text
 * block is rejected.
 */
export function toAnthropicMessages(messages: RawMessage[]): AnthropicRequest {
  const system: string[] = []
  const out: BetaMessageParam[] = []

  for (const m of messages) {
    // The two text-only roles share a type, so they're told apart inside one branch.
    if (m.role === 'system' || m.role === 'user') {
      if (!m.content.trim()) continue
      if (m.role === 'system') system.push(m.content)
      else out.push({ role: 'user', content: m.content })
      continue
    }
    if (m.role === 'tool') {
      const block: BetaContentBlockParam = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: m.content,
      }
      const last = out[out.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
      continue
    }
    if (m.role === 'assistant') {
      const blocks: BetaContentBlockParam[] = []
      if (m.content && m.content.trim()) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: parseArgs(tc.function.arguments),
        })
      }
      if (blocks.length) out.push({ role: 'assistant', content: blocks })
    }
  }

  return { system: system.join('\n\n'), messages: out }
}

/** The coach's OpenAI-style tool definitions as Anthropic's. */
export function toAnthropicTools(tools: Tool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: { ...t.function.parameters, type: 'object' } as Anthropic.Beta.BetaTool.InputSchema,
  }))
}

/** The shape of a reply this module reads; the SDK's BetaMessage satisfies it. */
export type AnthropicReply = {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
  stop_reason: string | null
  stop_details?: { category?: string | null; explanation?: string | null } | null
}

/**
 * A reply as the coach's tool loop expects one.
 *
 * A refusal is an error here rather than an empty turn: the loop shows an
 * error's message, and that is what you want to read when the model declined.
 */
export function fromAnthropicReply(reply: AnthropicReply): AssistantTurn {
  if (reply.stop_reason === 'refusal') {
    const why = reply.stop_details?.explanation?.trim()
    throw new Error(why ? `the model declined: ${why}` : 'the model declined to answer.')
  }

  const text = reply.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
  const toolCalls: RawToolCall[] = reply.content
    .filter((b) => b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string')
    .map((b) => ({
      id: b.id as string,
      type: 'function' as const,
      function: { name: b.name as string, arguments: JSON.stringify(b.input ?? {}) },
    }))

  return {
    message: {
      role: 'assistant',
      content: text || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    },
    content: text || null,
    toolCalls: toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  }
}

/**
 * Whether a model takes the server-side `fallbacks` parameter — the models
 * whose safety classifiers can decline a request, so a benign question flagged
 * by mistake is re-run on another model instead of coming back as a refusal.
 * Sent to any other model it would be rejected.
 */
export function takesFallbacks(model: string): boolean {
  return /^claude-(opus-5|sonnet-5-5|fable-5-1)/.test(model)
}
