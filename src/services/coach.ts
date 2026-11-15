/**
 * One call for a coach turn, whichever service the key is for.
 *
 * ChatTab builds the history and runs the tool loop; this picks the client
 * from Settings (see lib/aiProvider) and hands the rest through. Anthropic has
 * its own wire; everything else speaks OpenAI's and differs only in the root
 * URL and the key.
 */

import type { Settings } from './storage'
import { chatCompleteRaw, type AssistantTurn, type RawMessage, type Tool } from './openai'
import { anthropicCompleteRaw } from './anthropic'
import { baseUrlFor, modelFor, providerOf } from '../lib/aiProvider'

export async function coachTurn(
  settings: Settings,
  messages: RawMessage[],
  opts: { tools?: Tool[]; onText?: (textSoFar: string) => void },
): Promise<AssistantTurn> {
  const provider = providerOf(settings.aiProvider, settings.openAiKey)
  const model = modelFor(settings)
  const apiKey = settings.openAiKey.trim()

  // A dev build with no key of its own goes through the dev server's proxy
  // whatever the provider says: the proxy holds the only key, it speaks
  // OpenAI's wire, and it picks its own model unless one was typed.
  if (import.meta.env.DEV && !apiKey) {
    return chatCompleteRaw(apiKey, messages, { ...opts, model: settings.openAiModel?.trim() || undefined })
  }

  if (provider.wire === 'anthropic') {
    return anthropicCompleteRaw(apiKey, messages, { ...opts, model })
  }

  const baseUrl = baseUrlFor(settings)
  // A typed custom provider with no URL yet has nowhere to go, and the fetch
  // would only say so less clearly.
  if (!baseUrl) {
    throw new Error('add the provider’s base url in settings.')
  }
  return chatCompleteRaw(apiKey, messages, { ...opts, model, baseUrl })
}
