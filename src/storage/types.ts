export type PageRecord = {
    url: string,
    title: string,
    text: string,
    discoveredAt: string,
    source: "fetch" | "puppeteer"
}

export type ExtractedPage = {
    title: string,
    text: string,
    links: string[],
    canonicalUrl?: string
}