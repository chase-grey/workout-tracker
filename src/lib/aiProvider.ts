/**
 * Where the coach's key goes.
 *
 * The coach spoke only to OpenAI for a long time, and the settings still say
 * so by name (`openAiKey`, `openAiModel`). A key is now for whichever service
 * is picked here: three presets that take browser calls, and a hand-typed base
 * URL for anything else that speaks OpenAI's chat-completions wire. Google's
 * compatible endpoint is deliberately not a preset — it refuses cross-origin
 * browser calls, and a preset that can't work from the installed app would be
 * a trap.
 */

export type ProviderId = 'openai' | 'anthropic' | 'openrouter' | 'custom'

/** Which request format a provider speaks. Anthropic has its own; the rest copy OpenAI's. */
export type Wire = 'openai' | 'anthropic'

export type Provider = {
  id: ProviderId
  label: string
  wire: Wire
  /** The API root, or null when the user types one (see Settings.aiBaseUrl). */
  baseUrl: string | null
  /** The model a fresh pick starts on: a cheap or middling one, never the dearest. */
  defaultModel: string
  /**
   * The models offered in the picker, cheapest first. Settings takes any other
   * id the service knows, typed by hand.
   */
  models: string[]
  /** What a key from this service looks like, as the field's placeholder. */
  keyHint: string
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'anthropic',
    label: 'anthropic',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    keyHint: 'sk-ant-…',
  },
  {
    id: 'openai',
    label: 'openai',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'],
    keyHint: 'sk-…',
  },
  {
    id: 'openrouter',
    label: 'openrouter',
    wire: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    keyHint: 'sk-or-…',
  },
  {
    id: 'custom',
    label: 'other (openai-compatible)',
    wire: 'openai',
    baseUrl: null,
    defaultModel: '',
    models: [],
    keyHint: 'api key',
  },
]

/** The part of Settings this module reads. */
export type ProviderSettings = {
  aiProvider?: string
  openAiKey?: string
  aiBaseUrl?: string
  openAiModel?: string
  coachModelPicked?: boolean
}

/**
 * The provider a settings value names. Unset or unknown means Anthropic —
 * except where an OpenAI key is already saved from before the default moved
 * (a plain `sk-` key with no provider ever picked), which keeps talking to
 * OpenAI rather than sending that key somewhere it was never for.
 */
export function providerOf(id: string | undefined, key?: string): Provider {
  const named = PROVIDERS.find((p) => p.id === id)
  if (named) return named
  const k = key?.trim() ?? ''
  if (k.startsWith('sk-') && !k.startsWith('sk-ant-')) return PROVIDERS.find((p) => p.id === 'openai')!
  return PROVIDERS[0]
}

/** `url` without trailing slashes, so a path can be joined onto it. */
export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * The API root for these settings: the preset's, or the typed one for
 * `custom`. Empty when a custom provider has no URL yet, which the caller
 * should refuse to send to rather than fetch from.
 */
export function baseUrlFor(s: ProviderSettings): string {
  const p = providerOf(s.aiProvider, s.openAiKey)
  return p.baseUrl ?? trimBaseUrl(s.aiBaseUrl ?? '')
}

/** The chat-completions endpoint under an OpenAI-compatible root. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/chat/completions`
}

/**
 * What Anthropic's default was before it moved to a cheaper model. Picking the
 * provider wrote the default into settings, so a device set up back then holds
 * this id without anyone having asked for it.
 */
const FORMER_ANTHROPIC_DEFAULT = 'claude-opus-5-5'

/**
 * The model a device's settings start with (storage's DEFAULT_SETTINGS), from
 * when the coach spoke only to OpenAI. A device that never picked a model still
 * holds it, and with no provider picked either it is now read as Anthropic's.
 */
const SHIPPED_MODEL = 'gpt-4o-mini'

/**
 * The model to ask for: the chosen one, else the provider's default.
 *
 * The former default counts as a choice only once a model has been picked by
 * hand (`coachModelPicked`); until then it is the old default sitting in
 * storage, and follows the default to where it is now.
 */
export function modelFor(s: ProviderSettings): string {
  const provider = providerOf(s.aiProvider, s.openAiKey)
  const stored = s.openAiModel?.trim()
  // Neither is a choice: one is the old default, the other the model every
  // device starts with, which Anthropic has never served.
  const inherited =
    provider.id === 'anthropic' &&
    (stored === FORMER_ANTHROPIC_DEFAULT || stored === SHIPPED_MODEL) &&
    !s.coachModelPicked
  return stored && !inherited ? stored : provider.defaultModel
}

/**
 * The models to offer in a picker: the provider's list, with the one in use
 * added when it is a hand-typed id the list doesn't hold. Empty for a custom
 * provider with nothing typed, where there is nothing to choose between.
 */
export function modelChoices(s: ProviderSettings): string[] {
  const { models } = providerOf(s.aiProvider, s.openAiKey)
  const current = modelFor(s)
  return !current || models.includes(current) ? models : [...models, current]
}
