import path from "node:path";
import { UrlQueue } from "./queue";
import { SEEDS, ALLOWED_DOMAINS, MAX_DEPTH, MAX_PAGES } from "../config/njit";
import { fetchHtml } from "./fetcher";
import { renderHtmlWithPuppeteer, closeBrowser } from "./renderer";
import { extractFromHtml } from "./extractor";
import { needsDynamicRendering } from "./classifier";
import { appendPage } from "../storage/fileStorage";
import type { PageRecord } from "../storage/types";


const NON_HTML_EXTS = [
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".css",
    ".js",
    ".zip",
    ".mp4",
    ".mp3",
]

function normalizeUrl(url: string): string | null {
    try {
        const u = new URL(url)

        if(!ALLOWED_DOMAINS.some((d) => {
            return u.hostname.endsWith(d)
        })) {
            return null
        }

        if(u.protocol !== "http:" && u.protocol !== "https:") {
            return null
        }

        u.hash = ""

        const ext = path.extname(u.pathname).toLowerCase()
        if(ext && NON_HTML_EXTS.includes(ext)) {
            return null
        }

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
        SEEDS.forEach((url) => {
            const norm = normalizeUrl(url)
            if(norm) {
                this.queue.enqueue({
                    url: norm,
                    depth: 0
                })
            }
        })
    }

    async run() {
        while(this.queue.hasNext() && this.processedCount < MAX_PAGES) {
            let item = this.queue.dequeue()
            if(!item) {
                break
            }

            const { url, depth} = item
            console.log(`[${this.processedCount}/${MAX_PAGES}] Visiting`, url, "depth", depth)

            const htmlResult = await fetchHtml(url)
            if(!htmlResult) {
                continue
            }

            let { html, finalUrl} = htmlResult

            let effectiveUrl = normalizeUrl(finalUrl) ?? finalUrl
            let extracted = extractFromHtml(html, effectiveUrl)

            if(extracted.canonicalUrl) {
                const canon = normalizeUrl(extracted.canonicalUrl)
                if(canon) {
                    effectiveUrl = canon
                }
            }

            let record: PageRecord | null = null;

            const shouldTryPuppeteer = 
                needsDynamicRendering(html, extracted.text) &&
                this.puppeteerUsed < HighlanderCrawler.MAX_PUPPETEER_PAGES

            if(shouldTryPuppeteer) {
                const rendered = await renderHtmlWithPuppeteer(effectiveUrl)
                if(rendered) {
                    this.puppeteerUsed += 1
                    html = rendered
                    extracted = extractFromHtml(html, effectiveUrl)
                    record = {
                        url: effectiveUrl,
                        title: extracted.title,
                        text: extracted.text,
                        discoveredAt: new Date().toISOString(),
                        source: "puppeteer"
                    }
                }
            }

            if(!extracted.text || extracted.text.length < 200) {
                continue
            }
            if(record == null) {
                record = {
                    url: effectiveUrl,
                    title: extracted.title,
                    text: extracted.text,
                    discoveredAt: new Date().toISOString(),
                    source: "fetch"
                }
            }
            
            appendPage(record)
            this.processedCount++

            if(depth + 1 <= MAX_DEPTH) {
                for(const link of extracted.links) {
                    const norm = normalizeUrl(link)
                    if(!norm || this.queue.hasVisitied(norm)) {
                        continue
                    }
                    this.queue.enqueue({
                        url: norm,
                        depth: depth + 1
                    })
                }
            }

            await new Promise((r) => {
                return setTimeout(r, 500)
            })
        }
        
        console.log("Crawl finished. Pages processed:", this.processedCount)
        await closeBrowser()
    }
}