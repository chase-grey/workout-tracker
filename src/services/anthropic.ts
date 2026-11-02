/**
 * The coach speaking to Anthropic directly from the browser.
 *
 * Same contract as chatCompleteRaw in ./openai — the OpenAI-shaped history in,
 * an AssistantTurn out, the reply reported as it streams — so the tool loop in
 * ChatTab doesn't know which it got. The translation both ways is in
 * lib/anthropicWire; this file is only the network call.
 *
 * The SDK is loaded on first use rather than imported at the top, so the
 * installed app only downloads it on a device whose coach is set to Anthropic.
 * The key is the user's own, typed into Settings and held on this device, which
 * is what `dangerouslyAllowBrowser` is there to make you say out loud.
 */

import type { AssistantTurn, RawMessage, Tool } from './openai'
import {
  fromAnthropicReply,
  takesFallbacks,
  toAnthropicMessages,
  toAnthropicTools,
} from '../lib/anthropicWire'

// A reply ceiling, not a target: the coach answers in a few paragraphs, and
// every current model allows at least this much.
const MAX_TOKENS = 16000

export async function anthropicCompleteRaw(
  apiKey: string,
  messages: RawMessage[],
  opts: {
    model: string
    tools?: Tool[]
    /** Called with the reply so far as it arrives. Its presence asks for a stream. */
    onText?: (textSoFar: string) => void
  },
): Promise<AssistantTurn> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const { system, messages: converted } = toAnthropicMessages(messages)
  const params = {
    model: opts.model,
    max_tokens: MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: converted,
    ...(opts.tools?.length ? { tools: toAnthropicTools(opts.tools) } : {}),
    // A benign question the safety classifier flags by mistake is re-run on
    // another model server-side instead of coming back as a refusal.
    ...(takesFallbacks(opts.model)
      ? { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const }
      : {}),
  }

  try {
    if (opts.onText) {
      const onText = opts.onText
      // The stream's own snapshot restarts at every text block, and a reply
      // can hold several with a tool call between them, so the running text
      // is kept here.
      let soFar = ''
      const stream = client.beta.messages.stream(params)
      stream.on('text', (delta) => {
        soFar += delta
        onText(soFar)
      })
      return fromAnthropicReply(await stream.finalMessage())
    }
    return fromAnthropicReply(await client.beta.messages.create(params))
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      throw new Error(`anthropic request failed: ${e.status ?? ''} ${e.message}`.replace(/\s+/g, ' '))
    }
    throw e
  }
}
