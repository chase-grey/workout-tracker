import { describe, expect, it } from 'vitest'
import {
  baseUrlFor,
  chatCompletionsUrl,
  modelChoices,
  modelFor,
  providerOf,
  trimBaseUrl,
} from './aiProvider'

describe('providerOf', () => {
  it('is anthropic for anything unset or unknown', () => {
    expect(providerOf(undefined).id).toBe('anthropic')
    expect(providerOf('gemini').id).toBe('anthropic')
    expect(providerOf('openai').id).toBe('openai')
  })

  it('keeps an unpicked device on openai when it already holds an openai key', () => {
    expect(providerOf(undefined, 'sk-proj-abc').id).toBe('openai')
    expect(providerOf(undefined, 'sk-ant-abc').id).toBe('anthropic')
    expect(providerOf(undefined, '').id).toBe('anthropic')
    expect(providerOf('anthropic', 'sk-proj-abc').id).toBe('anthropic')
  })
})

describe('baseUrlFor', () => {
  it('uses the preset root and ignores a stray typed one', () => {
    expect(baseUrlFor({ aiProvider: 'openrouter', aiBaseUrl: 'https://x' })).toBe(
      'https://openrouter.ai/api/v1',
    )
  })

  it('takes the typed root for a custom provider, trimmed, and is empty without one', () => {
    expect(baseUrlFor({ aiProvider: 'custom', aiBaseUrl: ' https://llm.local/v1/ ' })).toBe(
      'https://llm.local/v1',
    )
    expect(baseUrlFor({ aiProvider: 'custom' })).toBe('')
  })
})

describe('chatCompletionsUrl', () => {
  it('joins the path onto a root with or without a trailing slash', () => {
    expect(chatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(chatCompletionsUrl('https://api.openai.com/v1//')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
  })

  it('trimBaseUrl leaves a bare host alone', () => {
    expect(trimBaseUrl('https://host')).toBe('https://host')
  })
})

describe('modelFor', () => {
  it("doesn't ask Anthropic for the OpenAI model a fresh device starts with", () => {
    expect(modelFor({ openAiModel: 'gpt-4o-mini' })).toBe('claude-sonnet-5-5')
    expect(modelFor({ aiProvider: 'anthropic', openAiModel: 'gpt-4o-mini' })).toBe('claude-sonnet-5-5')
    expect(modelFor({ aiProvider: 'openai', openAiModel: 'gpt-4o-mini' })).toBe('gpt-4o-mini')
  })

  it('prefers the typed model and falls back to the provider default', () => {
    expect(modelFor({ aiProvider: 'anthropic', openAiModel: ' claude-haiku-5-5 ' })).toBe(
      'claude-haiku-5-5',
    )
    expect(modelFor({ aiProvider: 'anthropic', openAiModel: '' })).toBe('claude-sonnet-5-5')
    expect(modelFor({})).toBe('claude-sonnet-5-5')
    expect(modelFor({ openAiKey: 'sk-proj-abc' })).toBe('gpt-4o-mini')
  })

  it('moves a stored former default to the new one until a model is picked by hand', () => {
    const stored = { aiProvider: 'anthropic', openAiModel: 'claude-opus-5-5' }
    expect(modelFor(stored)).toBe('claude-sonnet-5-5')
    expect(modelFor({ ...stored, coachModelPicked: true })).toBe('claude-opus-5-5')
    // The same id under another provider was typed, not inherited.
    expect(modelFor({ aiProvider: 'custom', openAiModel: 'claude-opus-5-5' })).toBe(
      'claude-opus-5-5',
    )
  })

  it('never defaults to the dearest model a provider lists', () => {
    for (const id of ['anthropic', 'openai', 'openrouter']) {
      const p = providerOf(id)
      expect(p.models).toContain(p.defaultModel)
      expect(p.defaultModel).not.toMatch(/opus|fable|^gpt-5$|^gpt-4\.1$/)
    }
  })
})

describe('modelChoices', () => {
  it("is the provider's list, cheapest first", () => {
    expect(modelChoices({ aiProvider: 'anthropic' })).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
    ])
  })

  it('adds a hand-typed model the list does not hold', () => {
    expect(modelChoices({ aiProvider: 'openai', openAiModel: 'o4-mini' })).toContain('o4-mini')
    expect(modelChoices({ aiProvider: 'custom', openAiModel: 'llama3' })).toEqual(['llama3'])
  })

  it('is empty for a custom provider with no model typed', () => {
    expect(modelChoices({ aiProvider: 'custom' })).toEqual([])
  })
})
