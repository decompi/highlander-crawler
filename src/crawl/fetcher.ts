export async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
    try {
        const res = await fetch(url, {
            redirect:  "follow",
            headers: {
                "User-Agent": "HighlanderCrawler/1.0 (+https://github.com/decompi/highlander-crawler)",
            }
        })

        if(!res.ok || !res.headers.get("content-type")?.includes("text/html")) {
            return null
        }

        const html = await res.text()
        return {
            html,
            finalUrl: res.url
        }
    } catch(err) {
        console.error("fetchHRML error for ", url, err)
        return null
    }
}