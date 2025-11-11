import puppeteer, { Browser } from "puppeteer";

let browser: Browser | null = null

async function getBrowser() {
    if(!browser) {
        browser = await puppeteer.launch({
            headless: "shell"
        })
    }
    return browser
}

export async function renderHtmlWithPuppeteer(url: string): Promise<string | null> {
    try {
        let brow = await getBrowser()
        let page = await brow.newPage()
        await page.goto(url, {
            waitUntil: "networkidle0",
            timeout: 30_000
        })
        let html = await page.content()
        await page.close()
        return html
    } catch(err) {
        console.error("puppeteer error for", url, err)
        return null
    }
}

export async function closeBrowser() {
    if(browser) await browser.close()
}