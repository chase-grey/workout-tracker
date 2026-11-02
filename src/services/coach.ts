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
  const provider = providerOf(settings.aiProvider)
  const model = modelFor(settings)
  const apiKey = settings.openAiKey.trim()

  if (provider.wire === 'anthropic') {
    return anthropicCompleteRaw(apiKey, messages, { ...opts, model })
  }

  const baseUrl = baseUrlFor(settings)
  // A dev build with no key of its own goes through the dev server's proxy
  // (see chatCompleteRaw), which has a root of its own; a typed custom
  // provider with no URL yet has nowhere to go, and the fetch would only say
  // so less clearly.
  if (!baseUrl && !(import.meta.env.DEV && !apiKey)) {
    throw new Error('add the provider’s base url in settings.')
  }
  return chatCompleteRaw(apiKey, messages, { ...opts, model, baseUrl })
}
