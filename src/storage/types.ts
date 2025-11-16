export type PageRecord = {
    url: string,
    title: string,
    text: string,
    html?: string,
    discoveredAt: string,
    source: "fetch" | "puppeteer" | "crawl"
}

export type ExtractedPage = {
    title: string,
    text: string,
    links: string[],
    canonicalUrl?: string
}