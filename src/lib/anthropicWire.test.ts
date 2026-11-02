import { describe, expect, it } from 'vitest'
import {
  fromAnthropicReply,
  takesFallbacks,
  toAnthropicMessages,
  toAnthropicTools,
} from './anthropicWire'
import type { RawMessage, Tool } from '../services/openai'

describe('toAnthropicMessages', () => {
  it('lifts every system message out and keeps the rest in order', () => {
    const { system, messages } = toAnthropicMessages([
      { role: 'system', content: 'you are a coach' },
      { role: 'system', content: 'plan: squats' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', tool_calls: undefined },
      { role: 'user', content: 'how was my week' },
    ])
    expect(system).toBe('you are a coach\n\nplan: squats')
    expect(messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      { role: 'user', content: 'how was my week' },
    ])
  })

  it('turns a tool call and its results into tool_use and one shared tool_result message', () => {
    const history: RawMessage[] = [
      { role: 'user', content: 'bump my squat' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'toolu_1', type: 'function', function: { name: 'update_plan', arguments: '{"edits":[]}' } },
          { id: 'toolu_2', type: 'function', function: { name: 'flag', arguments: 'not json' } },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: 'ok' },
      { role: 'tool', tool_call_id: 'toolu_2', content: 'noted' },
    ]
    const { messages } = toAnthropicMessages(history)
    expect(messages).toEqual([
      { role: 'user', content: 'bump my squat' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'update_plan', input: { edits: [] } },
          { type: 'tool_use', id: 'toolu_2', name: 'flag', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
          { type: 'tool_result', tool_use_id: 'toolu_2', content: 'noted' },
        ],
      },
    ])
  })

  it('drops empty text rather than sending a block the api rejects', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: '  ' },
      { role: 'assistant', content: '', tool_calls: [] },
      { role: 'user', content: 'real' },
    ])
    expect(messages).toEqual([{ role: 'user', content: 'real' }])
  })
})

describe('toAnthropicTools', () => {
  it('moves the schema under input_schema', () => {
    const tool: Tool = {
      type: 'function',
      function: {
        name: 'update_plan',
        description: 'edit the plan',
        parameters: { type: 'object', properties: { edits: { type: 'array' } }, required: ['edits'] },
      },
    }
    expect(toAnthropicTools([tool])).toEqual([
      {
        name: 'update_plan',
        description: 'edit the plan',
        input_schema: { type: 'object', properties: { edits: { type: 'array' } }, required: ['edits'] },
      },
    ])
  })
})

describe('fromAnthropicReply', () => {
  it('reads text and tool_use blocks back into the coach shape', () => {
    const turn = fromAnthropicReply({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'on it. ' },
        { type: 'tool_use', id: 'toolu_9', name: 'update_plan', input: { edits: [1] } },
      ],
    })
    expect(turn.content).toBe('on it. ')
    expect(turn.toolCalls).toEqual([{ id: 'toolu_9', name: 'update_plan', arguments: '{"edits":[1]}' }])
    expect(turn.message).toEqual({
      role: 'assistant',
      content: 'on it. ',
      tool_calls: [
        { id: 'toolu_9', type: 'function', function: { name: 'update_plan', arguments: '{"edits":[1]}' } },
      ],
    })
  })

  it('leaves tool_calls off a plain reply and nulls empty content', () => {
    const turn = fromAnthropicReply({ stop_reason: 'end_turn', content: [] })
    expect(turn.message).toEqual({ role: 'assistant', content: null })
    expect(turn.toolCalls).toEqual([])
  })

  it('surfaces a refusal as the error the thread shows', () => {
    expect(() =>
      fromAnthropicReply({
        stop_reason: 'refusal',
        stop_details: { category: 'bio', explanation: 'this touches on x' },
        content: [],
      }),
    ).toThrow('the model declined: this touches on x')
    expect(() => fromAnthropicReply({ stop_reason: 'refusal', content: [] })).toThrow(
      'the model declined to answer.',
    )
  })
})

describe('takesFallbacks', () => {
  it('is on for the models that can decline and off for the rest', () => {
    expect(takesFallbacks('claude-opus-5-5')).toBe(true)
    expect(takesFallbacks('claude-opus-5')).toBe(true)
    expect(takesFallbacks('claude-sonnet-5-5')).toBe(true)
    expect(takesFallbacks('claude-fable-5-1')).toBe(true)
    expect(takesFallbacks('claude-sonnet-5')).toBe(false)
    expect(takesFallbacks('claude-haiku-5-5')).toBe(false)
    expect(takesFallbacks('claude-sonnet-4-6')).toBe(false)
  })
})
