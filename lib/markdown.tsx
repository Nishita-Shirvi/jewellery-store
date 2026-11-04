/**
 * A small, safe markdown renderer for editable pages and collection intros (Phase 24).
 *
 * Supports: # / ## / ### headings, paragraphs, - or * bullet lists, 1. numbered lists,
 * > quotes, **bold**, *italic*, [links](/path or https://…) and line breaks.
 *
 * It builds React elements — never HTML strings — so whatever staff type (including <script>)
 * is shown as text, not run. Links go through safeContentLink (no javascript:, no //evil.com).
 * No dependency, so nothing new to keep patched.
 */
import type { ReactNode } from "react";
import { safeContentLink } from "@/lib/merch";

type Block =
  | { type: "h"; level: 2 | 3 | 4; text: string }
  | { type: "p"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; lines: string[] };

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  /** Collects consecutive lines matching `re` (its first group), moving i past them. */
  const take = (re: RegExp) => {
    const out: string[] = [];
    while (i < lines.length && re.test(lines[i]!)) out.push(re.exec(lines[i++]!)![1]!);
    return out;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
    } else if (HEADING.test(line)) {
      const [, hashes, text] = HEADING.exec(line)!;
      // "#" on a page is an h2: the page title is already the h1.
      blocks.push({ type: "h", level: (hashes!.length + 1) as 2 | 3 | 4, text: text!.trim() });
      i++;
    } else if (BULLET.test(line)) {
      blocks.push({ type: "ul", items: take(BULLET) });
    } else if (NUMBERED.test(line)) {
      blocks.push({ type: "ol", items: take(NUMBERED) });
    } else if (QUOTE.test(line)) {
      blocks.push({ type: "quote", lines: take(QUOTE) });
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() &&
        ![HEADING, BULLET, NUMBERED, QUOTE].some((re) => re.test(lines[i]!))
      )
        para.push(lines[i++]!);
      blocks.push({ type: "p", lines: para });
    }
  }
  return blocks;
}

/** **bold**, *italic*, [text](href). Anything else is plain text. */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key}>{m[2]}</em>);
    else {
      const href = safeContentLink(m[4]);
      out.push(
        href ? (
          <a
            key={key}
            href={href}
            className="underline underline-offset-4"
            {...(href.startsWith("https://")
              ? { rel: "noopener noreferrer nofollow", target: "_blank" }
              : {})}
          >
            {m[3]}
          </a>
        ) : (
          m[3]
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Lines({ lines, k }: { lines: string[]; k: string }) {
  return lines.map((l, j) => (
    <span key={j}>
      {j > 0 && <br />}
      {renderInline(l, `${k}-${j}`)}
    </span>
  ));
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className ?? "space-y-4 leading-relaxed"}>
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") {
          const Tag = `h${b.level}` as "h2" | "h3" | "h4";
          const size = b.level === 2 ? "text-2xl" : b.level === 3 ? "text-xl" : "text-lg";
          return (
            <Tag key={k} className={`${size} pt-2`}>
              {renderInline(b.text, k)}
            </Tag>
          );
        }
        if (b.type === "ul" || b.type === "ol") {
          const List = b.type;
          return (
            <List
              key={k}
              className={`${b.type === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-6`}
            >
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item, `${k}-${j}`)}</li>
              ))}
            </List>
          );
        }
        if (b.type === "quote")
          return (
            <blockquote key={k} className="border-gold border-l-2 pl-4 italic">
              <Lines lines={b.lines} k={k} />
            </blockquote>
          );
        return (
          <p key={k}>
            <Lines lines={(b as { lines: string[] }).lines} k={k} />
          </p>
        );
      })}
    </div>
  );
}
