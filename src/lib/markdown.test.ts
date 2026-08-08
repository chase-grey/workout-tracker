import { describe, it, expect } from 'vitest'
import { inlineText, parseInline, parseMarkdown, type MdBlock } from './markdown'

/** The one block a case is about, so each assertion reads as the shape it checks. */
function only(src: string): MdBlock {
  const blocks = parseMarkdown(src)
  expect(blocks).toHaveLength(1)
  return blocks[0]
}

/** The rendered text of a paragraph or heading block. */
function textOf(block: MdBlock): string {
  if (block.type !== 'paragraph' && block.type !== 'heading') {
    throw new Error(`expected text content, got ${block.type}`)
  }
  return inlineText(block.children)
}

function asList(block: MdBlock) {
  if (block.type !== 'list') throw new Error(`expected a list, got ${block.type}`)
  return block
}

describe('parseInline', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('add 5 lbs next week')).toEqual([
      { type: 'text', value: 'add 5 lbs next week' },
    ])
  })

  it('reads bold, italic and both together', () => {
    expect(parseInline('**hard**')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'hard' }] },
    ])
    expect(parseInline('*easy*')).toEqual([
      { type: 'em', children: [{ type: 'text', value: 'easy' }] },
    ])
    expect(parseInline('__hard__')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'hard' }] },
    ])
    expect(parseInline('***both***')).toEqual([
      { type: 'strong', children: [{ type: 'em', children: [{ type: 'text', value: 'both' }] }] },
    ])
  })

  it('keeps text around and inside emphasis', () => {
    expect(parseInline('go **all in** today')).toEqual([
      { type: 'text', value: 'go ' },
      { type: 'strong', children: [{ type: 'text', value: 'all in' }] },
      { type: 'text', value: ' today' },
    ])
    expect(parseInline('**bold with `code`**')).toEqual([
      {
        type: 'strong',
        children: [
          { type: 'text', value: 'bold with ' },
          { type: 'code', value: 'code' },
        ],
      },
    ])
  })

  it('does not turn arithmetic or snake_case into emphasis', () => {
    expect(parseInline('3 * 4 * 5')).toEqual([{ type: 'text', value: '3 * 4 * 5' }])
    expect(parseInline('incline_bench_press')).toEqual([
      { type: 'text', value: 'incline_bench_press' },
    ])
  })

  it('leaves an unclosed marker as literal text', () => {
    expect(parseInline('**not closed')).toEqual([{ type: 'text', value: '**not closed' }])
    expect(parseInline('*also not closed')).toEqual([{ type: 'text', value: '*also not closed' }])
    expect(parseInline('a ` b')).toEqual([{ type: 'text', value: 'a ` b' }])
  })

  it('honours backslash escapes', () => {
    expect(parseInline('5 \\* 3 is \\*not\\* bold')).toEqual([
      { type: 'text', value: '5 * 3 is *not* bold' },
    ])
  })

  it('reads inline code and strikethrough', () => {
    expect(parseInline('run `npm test`')).toEqual([
      { type: 'text', value: 'run ' },
      { type: 'code', value: 'npm test' },
    ])
    expect(parseInline('~~skip~~')).toEqual([
      { type: 'del', children: [{ type: 'text', value: 'skip' }] },
    ])
  })

  it('reads links and autolinks bare urls', () => {
    expect(parseInline('see [issue 12](https://example.com/12).')).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'link',
        href: 'https://example.com/12',
        children: [{ type: 'text', value: 'issue 12' }],
      },
      { type: 'text', value: '.' },
    ])
    expect(parseInline('filed at https://example.com/12, take a look')).toEqual([
      { type: 'text', value: 'filed at ' },
      {
        type: 'link',
        href: 'https://example.com/12',
        children: [{ type: 'text', value: 'https://example.com/12' }],
      },
      { type: 'text', value: ', take a look' },
    ])
  })

  it('refuses a link scheme that could run code', () => {
    const nodes = parseInline('[tap](javascript:alert(1))')
    expect(nodes.some((n) => n.type === 'link')).toBe(false)
    expect(inlineText(nodes)).toContain('tap')
  })
})

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and keeps soft breaks', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree')
    expect(blocks).toHaveLength(2)
    expect(textOf(blocks[0])).toBe('one\ntwo')
    expect(textOf(blocks[1])).toBe('three')
  })

  it('reads headings by level', () => {
    const block = only('## Week plan')
    expect(block).toMatchObject({ type: 'heading', level: 2 })
    expect(textOf(block)).toBe('Week plan')
  })

  it('reads a bullet list', () => {
    const list = asList(only('- squat\n- bench\n- row'))
    expect(list.ordered).toBe(false)
    expect(list.items.map((item) => textOf(item[0]))).toEqual(['squat', 'bench', 'row'])
  })

  it('reads a numbered list and keeps its starting number', () => {
    const list = asList(only('3. warm up\n4. work sets'))
    expect(list.ordered).toBe(true)
    expect(list.start).toBe(3)
    expect(list.items).toHaveLength(2)
  })

  it('nests an indented list inside its item', () => {
    const list = asList(only('- push day\n  - bench\n  - dips\n- pull day'))
    expect(list.items).toHaveLength(2)
    const [first, second] = list.items
    expect(textOf(first[0])).toBe('push day')
    expect(asList(first[1]).items.map((item) => textOf(item[0]))).toEqual(['bench', 'dips'])
    expect(second).toHaveLength(1)
  })

  it('ends a list at the paragraph after it', () => {
    const blocks = parseMarkdown('- one\n- two\n\nThat is the week.')
    expect(blocks.map((b) => b.type)).toEqual(['list', 'paragraph'])
  })

  it('keeps a list that follows an intro line out of the paragraph', () => {
    const blocks = parseMarkdown('Try this:\n- one\n- two')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list'])
    expect(textOf(blocks[0])).toBe('Try this:')
  })

  it('reads a fenced code block with its language', () => {
    expect(only('```js\nconst a = 1\n```')).toEqual({
      type: 'code',
      lang: 'js',
      value: 'const a = 1',
    })
  })

  it('runs an unclosed fence to the end, as a half-streamed reply arrives', () => {
    expect(only('```\nstill typing')).toEqual({ type: 'code', lang: '', value: 'still typing' })
  })

  it('leaves markdown inside a code block unparsed', () => {
    expect(only('```\n- **not** a list\n```')).toEqual({
      type: 'code',
      lang: '',
      value: '- **not** a list',
    })
  })

  it('reads block quotes and rules', () => {
    expect(only('> keep the bar over midfoot')).toMatchObject({ type: 'quote' })
    expect(only('---')).toEqual({ type: 'rule' })
  })

  it('returns nothing for empty or blank text', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n  \n')).toEqual([])
  })

  it('keeps every character of a plain reply', () => {
    const text = 'Nice session — 3x8 at 135 is a PR.\nRest 90s next time.'
    expect(textOf(only(text))).toBe(text)
  })
})
