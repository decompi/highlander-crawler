
import "dotenv/config"

import { HighlanderCrawler } from "./crawl/crawler";

async function main() {
    console.log("Highlander Crawler starting...")
    const crawler = new HighlanderCrawler()
    await crawler.run()
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})