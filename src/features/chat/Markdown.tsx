import { useMemo, type ReactNode } from 'react'
import { parseMarkdown, type MdBlock, type MdInline } from '../../lib/markdown'

/**
 * Render coach text as Markdown inside a chat bubble.
 *
 * Sizing stays close to the plain-text bubble this replaces: headings step up in
 * weight rather than in size, because a full-size h1 in an 85%-wide bubble on a
 * phone reads as shouting. Everything else is spacing.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return <div className="flex flex-col gap-2">{blocks.map(renderBlock)}</div>
}

const HEADING_CLASS = [
  'text-base font-bold',
  'text-base font-bold',
  'text-sm font-bold',
  'text-sm font-semibold',
  'text-sm font-semibold',
  'text-sm font-semibold',
]

function renderBlock(block: MdBlock, key: number): ReactNode {
  switch (block.type) {
    case 'paragraph':
      // pre-line, so a single newline inside a paragraph still breaks the line —
      // the coach writes short stacked lines and means them.
      return (
        <p key={key} className="whitespace-pre-line break-words">
          {block.children.map(renderInline)}
        </p>
      )

    case 'heading':
      return (
        <p key={key} className={`${HEADING_CLASS[block.level - 1]} break-words`}>
          {block.children.map(renderInline)}
        </p>
      )

    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="[&>*+*]:mt-1">
          {item.map(renderBlock)}
        </li>
      ))
      return block.ordered ? (
        <ol key={key} start={block.start} className="flex list-decimal flex-col gap-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="flex list-disc flex-col gap-1 pl-5">
          {items}
        </ul>
      )
    }

    case 'code':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-xl bg-bg px-2.5 py-2 text-xs leading-relaxed text-neutral-200"
        >
          <code>{block.value}</code>
        </pre>
      )

    case 'quote':
      return (
        <blockquote
          key={key}
          className="flex flex-col gap-2 border-l-2 border-border pl-2.5 text-neutral-300"
        >
          {block.children.map(renderBlock)}
        </blockquote>
      )

    case 'rule':
      return <hr key={key} className="border-border" />
  }
}

function renderInline(node: MdInline, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value
    case 'code':
      return (
        <code key={key} className="rounded bg-bg px-1 py-0.5 text-[0.9em]">
          {node.value}
        </code>
      )
    case 'strong':
      return (
        <strong key={key} className="font-semibold">
          {node.children.map(renderInline)}
        </strong>
      )
    case 'em':
      return <em key={key}>{node.children.map(renderInline)}</em>
    case 'del':
      return (
        <del key={key} className="text-neutral-400">
          {node.children.map(renderInline)}
        </del>
      )
    case 'link':
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all text-accent-2 underline underline-offset-2"
        >
          {node.children.map(renderInline)}
        </a>
      )
  }
}
