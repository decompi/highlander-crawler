import puppeteer, { Browser } from "puppeteer"

let browser: Browser | null = null

async function getBrowser() {
    if (!browser) browser = await puppeteer.launch({ headless: "shell", args: ["--no-sandbox"] })
    return browser
}

export async function renderHtmlWithPuppeteer(url: string): Promise<string | null> {
    try {
        const brow = await getBrowser()
        const page = await brow.newPage()
        await page.setRequestInterception(true)
        page.on("request", req => {
            const r = req.resourceType()
            if (r === "image" || r === "media" || r === "font") req.abort()
            else req.continue()
        })
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })
        await autoScroll(page)
        const html = await page.content()
        await page.close()
        return html
    } catch (e) {
        console.error("puppeteer error for", url, e)
        return null
    }
}

export async function screenshotSelector(url: string, selector: string): Promise<Buffer | null> {
    try {
        const brow = await getBrowser()
        const page = await brow.newPage()
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })
        await autoScroll(page)
        await page.waitForSelector(selector, { timeout: 5000 })
        const el = await page.$(selector)
        const buf = el ? await el.screenshot({ type: "png" }) as Buffer : null
        await page.close()
        return buf
    } catch {
        return null
    }
}

async function autoScroll(page: any) {
    await page.evaluate(async () => {
        await new Promise<void>(resolve => {
            let total = 0
            const distance = 600
            const timer = setInterval(() => {
                window.scrollBy(0, distance)
                total += distance
                if (total >= document.body.scrollHeight) {
                    clearInterval(timer)
                    resolve()
                }
            }, 120)
        })
    })
}

export async function closeBrowser() {
    if (browser) await browser.close()
}