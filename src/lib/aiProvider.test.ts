import { describe, expect, it } from 'vitest'
import { baseUrlFor, chatCompletionsUrl, modelFor, providerOf, trimBaseUrl } from './aiProvider'

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
  it('prefers the typed model and falls back to the provider default', () => {
    expect(modelFor({ aiProvider: 'anthropic', openAiModel: ' claude-sonnet-5-5 ' })).toBe(
      'claude-sonnet-5-5',
    )
    expect(modelFor({ aiProvider: 'anthropic', openAiModel: '' })).toBe('claude-opus-5-5')
    expect(modelFor({})).toBe('claude-opus-5-5')
    expect(modelFor({ openAiKey: 'sk-proj-abc' })).toBe('gpt-4o-mini')
  })
})
