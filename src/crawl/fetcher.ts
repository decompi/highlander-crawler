const UA_POOL = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", weight: 60 },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15", weight: 20 },
    { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", weight: 15 },
    { ua: "HighlanderCrawler/1.0 (+https://github.com/decompi/highlander-crawler)", weight: 5 }
]

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

function pickWeightedUA(): string {
    const total = UA_POOL.reduce((s, p) => s + p.weight, 0)
    let r = Math.random() * total
    for (const p of UA_POOL) {
        r -= p.weight
        if (r <= 0) return p.ua
    }
    return UA_POOL[0].ua
}

export async function fetchResource(url: string): Promise<{ finalUrl: string, contentType: string, html?: string, bytes?: ArrayBuffer } | null> {
    const MAX_RETRIES = 3
    const BASE_BACKOFF_MS = 400
    const MAX_BACKOFF_MS = 10_000

    await sleep(200 + Math.floor(Math.random() * 800))

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const ua = pickWeightedUA()
        try {
            const headers: Record<string, string> = {
                "User-Agent": ua,
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9"
            }
            try {
                const u = new URL(url)
                headers["Referer"] = u.origin
            } catch { }

            const res = await fetch(url, { redirect: "follow", headers })
            if (res.status === 429 || (res.status >= 500 && res.status < 600)) throw new Error(`retryable ${res.status}`)
            if (!res.ok) return null

            const contentType = res.headers.get("content-type") || ""
            if (contentType.includes("text/html")) {
                const html = await res.text()
                return { finalUrl: res.url, contentType, html }
            } else {
                const bytes = await res.arrayBuffer()
                return { finalUrl: res.url, contentType, bytes }
            }
        } catch (err) {
            const isLast = attempt === MAX_RETRIES
            if (isLast) {
                console.error("fetchResource error for", url, err)
                return null
            }
            const backoff = Math.min(BASE_BACKOFF_MS * (2 ** attempt), MAX_BACKOFF_MS)
            const jitter = Math.floor(Math.random() * 300)
            await sleep(backoff + jitter)
        }
    }

    return null
}

export async function fetchHtml(url: string): Promise<{ html: string, finalUrl: string } | null> {
    const r = await fetchResource(url)
    if (!r) return null
    if (r.html && r.contentType.includes("text/html")) return { html: r.html, finalUrl: r.finalUrl }
    return null
}