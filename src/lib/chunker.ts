import * as cheerio from "cheerio"
import { anthropic } from "./claude"

export type RawPage = {
    url: string
    title: string
    html?: string
    text?: string
}

export type Chunk = {
    url: string
    title: string
    section: string
    anchor?: string
    content: string
    kind?: "text"
}

const TARGET_MIN = 900
const TARGET_MAX = 1600
const ABS_MAX = 2200
const INPUT_CHAR_CAP = 45000

function clean(s: string) {
    return s.replace(/\s+/g, " ").trim()
}

function stripChrome($: cheerio.CheerioAPI) {
    $("script,style,noscript,header,footer,nav").remove()
    // common boilerplate
    $("a,button").each((_, el) => {
        const t = clean($(el).text())
        if (/^skip to content$/i.test(t)) $(el).remove()
    })
}

type Block = { type: "heading" | "para"; text: string; anchor?: string }

function htmlToBlocks(html: string): Block[] {
    const $ = cheerio.load(html)
    stripChrome($)

    // Preserve headings and paragraphs/lists in reading order
    const blocks: Block[] = []
    $("h1, h2, h3, p, li").each((_, el) => {
        const tag = el.tagName.toLowerCase()
        const text = clean($(el).text())
        if (!text) return
        const id = $(el).attr("id") || $(el).attr("name") || undefined
        if (tag === "h1" || tag === "h2" || tag === "h3") {
            blocks.push({ type: "heading", text, anchor: id })
        } else {
            blocks.push({ type: "para", text })
        }
    })
    // fallback: if we somehow got nothing, use body text
    if (blocks.length === 0) {
        const body = clean($("body").text())
        for (const line of body.split(/(?:\n|\r)+/).map(clean).filter(Boolean)) {
            blocks.push({ type: "para", text: line })
        }
    }
    return blocks
}

function blocksToPromptSlice(blocks: Block[]) {
    // Keep within a char cap to control cost
    const out: Block[] = []
    let total = 0
    for (const b of blocks) {
        const plus = b.text.length + 16
        if (total + plus > INPUT_CHAR_CAP) break
        out.push(b)
        total += plus
    }
    return out
}

function buildLLMPrompt(pageTitle: string, url: string, blocks: Block[]) {
    const preview = blocks
        .map((b, i) => {
            const tag = b.type === "heading" ? "H" : "P"
            const pre = b.text.length > 400 ? b.text.slice(0, 400) + " …" : b.text
            return `${i + 1}. [${tag}] ${pre}`
        })
        .join("\n")

    // Strict, model-agnostic instructions. No NJIT-specific keywords.
    return `You will segment a webpage into semantically coherent chunks for retrieval.

Return STRICT JSON matching this schema:
{
  "chunks": [
    {
      "section": "string (short heading for this chunk; if none, infer a concise label)",
      "anchor": "string | null (fragment id like 'plan-of-study' if obviously present, else null)",
      "content": "string (contiguous text ≤ ${TARGET_MAX} characters, ≥ ${TARGET_MIN} when possible, formed by concatenating adjacent blocks; do not invent text)"
    }
  ]
}

Rules:
- Use only the text shown below (do not fabricate).
- Group adjacent blocks that belong together; avoid splitting mid-sentence.
- Prefer chunk sizes ${TARGET_MIN}–${TARGET_MAX} chars. If a logical section is longer, split into multiple chunks with the same section label plus “(Part 2)”, “(Part 3)”, etc.
- If there is a clear heading immediately above some paragraphs, use that heading as "section".
- If you see a semester/term/course list (or a table described in text), capture it as contiguous chunks but keep plain text formatting (no markdown tables).
- Keep "section" short (≤ 80 chars). "anchor" should match any obvious element id; otherwise null.

Page title: ${pageTitle}
URL: ${url}

Blocks (in order):
${preview}

Return ONLY the JSON.`
}

function safeParseJSON(s: string): any | null {
    try {
        return JSON.parse(s)
    } catch {
        const start = s.indexOf("{")
        const end = s.lastIndexOf("}")
        if (start >= 0 && end > start) {
            try { return JSON.parse(s.slice(start, end + 1)) } catch { }
        }
        return null
    }
}

function postProcess(url: string, title: string, raw: any): Chunk[] {
    if (!raw || !Array.isArray(raw.chunks)) return []
    const out: Chunk[] = []
    for (const c of raw.chunks) {
        if (!c || !c.content) continue
        let section = typeof c.section === "string" ? clean(c.section) : ""
        if (!section) section = title
        const content = clean(c.content).slice(0, ABS_MAX)
        const anchor = typeof c.anchor === "string" ? clean(c.anchor) : undefined
        if (content.length > 0) {
            out.push({ url, title, section, anchor, content, kind: "text" })
        }
    }
    const merged: Chunk[] = []
    for (const ch of out) {
        if (
            merged.length > 0 &&
            ch.content.length < 300 &&
            (merged[merged.length - 1].section === ch.section ||
                merged[merged.length - 1].section.includes(ch.section) ||
                ch.section.includes(merged[merged.length - 1].section))
        ) {
            merged[merged.length - 1].content =
                (merged[merged.length - 1].content + " " + ch.content).slice(0, ABS_MAX)
        } else {
            merged.push(ch)
        }
    }
    return merged
}

async function chunkWithLLM(p: RawPage, blocks: Block[]): Promise<Chunk[] | null> {
    const slice = blocksToPromptSlice(blocks)
    const prompt = buildLLMPrompt(p.title, p.url, slice)

    try {
        const resp = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1000,
            temperature: 0,
            system:
                "You segment webpages into retrieval chunks. Be precise and return strictly valid JSON.",
            messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        })
        const textPart = resp.content.find((c) => c.type === "text") as any
        const raw = safeParseJSON(textPart?.text ?? "")
        const chunks = postProcess(p.url, p.title, raw)
        if (chunks.length > 0) return chunks
    } catch (e) {
    }
    return null
}

function chunkDeterministic(p: RawPage, blocks: Block[]): Chunk[] {
    const chunks: Chunk[] = []
    let section = p.title
    let buf = ""

    const flush = () => {
        const content = clean(buf)
        if (content.length >= 300) {
            chunks.push({
                url: p.url,
                title: p.title,
                section,
                content,
                kind: "text",
            })
        }
        buf = ""
    }

    for (const b of blocks) {
        if (b.type === "heading") {
            if (buf) flush()
            section = b.text
        } else {
            const next = (buf ? buf + " " : "") + b.text
            if (next.length > TARGET_MAX) {
                flush()
                buf = b.text
            } else {
                buf = next
            }
        }
    }
    if (buf) flush()
    return chunks
}

export async function chunkPage(p: RawPage): Promise<Chunk[]> {
    const html =
        p.html ??
        `<body>${(p.text ?? "")
            .split("\n")
            .map((t) => `<p>${t}</p>`)
            .join("")}</body>`

    const blocks = htmlToBlocks(html)

    const llm = await chunkWithLLM(p, blocks)
    if (llm && llm.length) return llm

    return chunkDeterministic(p, blocks)
}
