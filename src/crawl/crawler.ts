import path from "node:path"
import { UrlQueue } from "./queue"
import { SEEDS, ALLOWED_DOMAINS, MAX_DEPTH, MAX_PAGES, CRAWL_DELAY_MS } from "../config/njit"
import { fetchResource } from "./fetcher"
import { renderHtmlWithPuppeteer, screenshotSelector, closeBrowser } from "./renderer"
import { extractFromHtml } from "./extractor"
import { needsDynamicRendering } from "./classifier"
import { appendPage, hasPage, savePageToSupabase } from "../storage/fileStorage"
import type { PageRecord } from "../storage/types"
import { debugLog } from "../lib/log"

const SKIP_EXTS = [".css", ".js", ".zip", ".mp4", ".mp3", ".ico", ".svg"]

function normalizeUrl(url: string): string | null {
    try {
        const u = new URL(url)
        if (!ALLOWED_DOMAINS.some(d => u.hostname.endsWith(d))) return null
        if (u.protocol !== "http:" && u.protocol !== "https:") return null
        u.hash = ""
        const ext = path.extname(u.pathname).toLowerCase()
        if (ext && SKIP_EXTS.includes(ext)) return null
        return u.toString()
    } catch {
        return null
    }
}

export class HighlanderCrawler {
    private queue = new UrlQueue()
    private processedCount = 0
    private puppeteerUsed = 0
    private static MAX_PUPPETEER_PAGES = 50

    constructor() {
        SEEDS.forEach(url => {
            const norm = normalizeUrl(url)
            if (norm && !hasPage(norm)) {
                this.queue.enqueue({ url: norm, depth: 0 })
            }
        })
    }

    private async politeDelay() {
        const jitter = Math.floor(Math.random() * 500)
        const delay = CRAWL_DELAY_MS + jitter
        await new Promise(r => setTimeout(r, delay))
    }

    async run() {
        const start = Date.now()
        while (this.queue.hasNext() && this.processedCount < MAX_PAGES) {
            const item = this.queue.dequeue()
            if (!item) break

            const pageStart = Date.now()
            const { url, depth } = item
            debugLog("Dequeued", { url, depth })
            console.log(`[${this.processedCount}/${MAX_PAGES}] Visiting`, url, "depth", depth)

            const res = await fetchResource(url)
            if (!res) {
                debugLog("Fetch failed, skipping", url)
                await this.politeDelay()
                continue
            }

            let effectiveUrl = normalizeUrl(res.finalUrl) ?? res.finalUrl
            if (hasPage(effectiveUrl)) {
                debugLog("Already in corpus, skipping", effectiveUrl)
                await this.politeDelay()
                continue
            }

            let title = ""
            let text = ""
            let links: string[] = []
            let htmlToSave = ""

            if (res.contentType.includes("text/html") && res.html) {
                htmlToSave = res.html
                let ex = extractFromHtml(res.html, effectiveUrl)
                if (ex.canonicalUrl) {
                    const canon = normalizeUrl(ex.canonicalUrl)
                    if (canon) effectiveUrl = canon
                }
                title = ex.title
                text = ex.text
                links = ex.links

                const shouldTryPuppeteer = needsDynamicRendering(res.html, ex.text) && this.puppeteerUsed < HighlanderCrawler.MAX_PUPPETEER_PAGES
                if (shouldTryPuppeteer) {
                    const rendered = await renderHtmlWithPuppeteer(effectiveUrl)
                    if (rendered) {
                        this.puppeteerUsed += 1
                        htmlToSave = rendered
                        ex = extractFromHtml(rendered, effectiveUrl)
                        title = ex.title || title
                        text = ex.text || text
                        links = ex.links.length ? ex.links : links
                    }
                }

                if (text.length < 200) {
                    const shot = await screenshotSelector(effectiveUrl, "table, .table, #tuition, .tuition")
                    if (shot) {
                        const { ocrImage } = await import("./ocr")
                        const ocr = await ocrImage(shot)
                        if (ocr && ocr.length > 50) text = text + "\n" + ocr
                    }
                }
            } else if (res.bytes && res.contentType.includes("pdf")) {
                const { extractPdfText } = await import("./pdf")
                text = await extractPdfText(res.bytes)
                title = "PDF"
                links = []
            } else if (res.bytes && res.contentType.startsWith("image/")) {
                const { ocrImage } = await import("./ocr")
                text = await ocrImage(res.bytes)
                title = "Image"
                links = []
            } else {
                await this.politeDelay()
                continue
            }

            const isPdfType = res.contentType.includes("pdf")
            const minLen = isPdfType ? 30 : 120
            if (!text || text.length < minLen) {
                await this.politeDelay()
                continue
            }

            const record: PageRecord = {
                url: effectiveUrl,
                title: title || effectiveUrl,
                text,
                html: htmlToSave || undefined,
                discoveredAt: new Date().toISOString(),
                source: "crawl"
            }

            appendPage(record)
            await savePageToSupabase(record)
            debugLog("Saved Page", { url: record.url, title: record.title.slice(0, 89), textLen: record.text.length, source: record.source })
            this.processedCount++

            const pageMs = Date.now() - pageStart
            debugLog(`Page processed in ${pageMs}ms`)

            if (depth + 1 <= MAX_DEPTH) {
                for (const link of links) {
                    const norm = normalizeUrl(link)
                    if (!norm || this.queue.hasVisited(norm) || hasPage(norm)) continue
                    this.queue.enqueue({ url: norm, depth: depth + 1 })
                }
            }

            await this.politeDelay()
        }
        const totalMs = Date.now() - start
        console.log("Crawl finished. Pages processed:", this.processedCount)
        console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`)
        await closeBrowser()
    }
}
