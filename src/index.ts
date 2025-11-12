import { close } from "fs";
import { HighlanderCrawler } from "./crawl/crawler";
import { closeBrowser } from "./crawl/renderer";

async function main() {
    console.log("Highlander Crawler starting...")
    const crawler = new HighlanderCrawler()
    await crawler.run()
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})