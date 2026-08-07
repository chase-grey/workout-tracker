import { describe, it, expect, afterEach, vi } from 'vitest'
import { chatCompleteRaw } from './openai'

/** An SSE response whose bytes arrive in the given pieces — chunk boundaries
 *  fall wherever the caller puts them, which is the point of most of these. */
function sseResponse(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of pieces) controller.enqueue(encoder.encode(p))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })
}

function event(delta: unknown): string {
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`
}

const stubFetch = (res: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))

afterEach(() => vi.unstubAllGlobals())

describe('chatCompleteRaw streaming', () => {
  it('accumulates content and reports it as it arrives', async () => {
    stubFetch(
      sseResponse([
        event({ role: 'assistant', content: '' }),
        event({ content: 'good ' }),
        event({ content: 'session' }),
        'data: [DONE]\n\n',
      ]),
    )
    const seen: string[] = []
    const turn = await chatCompleteRaw('', [{ role: 'user', content: 'hi' }], {
      onText: (t) => seen.push(t),
    })

    expect(seen).toEqual(['good ', 'good session'])
    expect(turn.content).toBe('good session')
    expect(turn.toolCalls).toEqual([])
  })

  it('reassembles a tool call split across events', async () => {
    stubFetch(
      sseResponse([
        event({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'update_plan', arguments: '' } }] }),
        event({ tool_calls: [{ index: 0, function: { arguments: '{"edits":' } }] }),
        event({ tool_calls: [{ index: 0, function: { arguments: '[]}' } }] }),
        'data: [DONE]\n\n',
      ]),
    )
    const turn = await chatCompleteRaw('', [{ role: 'user', content: 'hi' }], { onText: () => {} })

    expect(turn.toolCalls).toEqual([
      { id: 'call_1', name: 'update_plan', arguments: '{"edits":[]}' },
    ])
    // The raw message goes back into the history for the next round, so it has
    // to carry the tool call in the shape the API sent it.
    expect(turn.message).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'update_plan' } }],
    })
  })

  it('handles an event split across network chunks', async () => {
    const whole = event({ content: 'hal' }) + event({ content: 'ves' })
    const at = whole.indexOf('ves') - 4 // mid-JSON, mid-event
    stubFetch(sseResponse([whole.slice(0, at), whole.slice(at)]))

    const turn = await chatCompleteRaw('', [{ role: 'user', content: 'hi' }], { onText: () => {} })
    expect(turn.content).toBe('halves')
  })

  it('tolerates CRLF line endings', async () => {
    stubFetch(sseResponse([event({ content: 'ok' }).replace(/\n/g, '\r\n')]))
    const turn = await chatCompleteRaw('', [{ role: 'user', content: 'hi' }], { onText: () => {} })
    expect(turn.content).toBe('ok')
  })

  it('falls back to a whole JSON body when the server does not stream', async () => {
    // An older coach proxy on the laptop ignores the stream flag entirely.
    stubFetch(
      new Response(JSON.stringify({ choices: [{ message: { content: 'all at once' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const turn = await chatCompleteRaw('', [{ role: 'user', content: 'hi' }], { onText: () => {} })
    expect(turn.content).toBe('all at once')
  })
})
