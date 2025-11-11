import { UrlQueue, QueueItem } from "./queue";
import { SEEDS, ALLOWED_DOMAINS, MAX_DEPTH, MAX_PAGES } from "../config/njit";
import { fetchHtml } from "./fetcher";
import { renderHtmlWithPuppeteer } from "./renderer";
import { extractFromHtml } from "./extractor";
import { needsDynamicRendering } from "./classifier";
import { appendPage } from "../storage/fileStorage";
import type { PageRecord } from "../storage/types";
import { html } from "cheerio/dist/commonjs/static";
import { append } from "cheerio/dist/commonjs/api/manipulation";

function isAllowedUrl(url: string): boolean {
    try {
        const u = new URL(url)
        return ALLOWED_DOMAINS.some((d) => {
            return u.hostname.endsWith(d)
        })
    } catch {
        return false
    }
}

export class HighlanderCrawler {
    private queue = new UrlQueue
    private processedCount = 0

    constructor() {
        SEEDS.forEach((url) => {
            this.queue.enqueue({ url,
                depth: 0
            })
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

            let extracted = extractFromHtml(html, finalUrl)

            let record: PageRecord | null = null;
            if(needsDynamicRendering(html, extracted.text)) {
                const rendered = await renderHtmlWithPuppeteer(finalUrl)
                if(rendered) {
                    html = rendered
                    extracted = extractFromHtml(html, finalUrl)
                    record = {
                        url: finalUrl,
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
                    url: finalUrl,
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
                    if(!isAllowedUrl(link)) {
                        continue
                    }
                    this.queue.enqueue({
                        url: link,
                        depth: depth + 1
                    })
                }
            }

            await new Promise((r) => {
                return setTimeout(r, 500)
            })
        }
        
        console.log("Crawl finished. Pages processed:", this.processedCount)
    }
}