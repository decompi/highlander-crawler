export type PageRecord = {
    url: string,
    title: string,
    text: string,
    discoveredAt: string,
    source: "fetch" | "puppeteer"
}