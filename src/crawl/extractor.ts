import * as cheerio from "cheerio"
import { ExtractedPage } from "../storage/types"

export function extractFromHtml(html: string, baseUrl: string): ExtractedPage {
    const $ = cheerio.load(html)

    const title = $("title").first().text().trim()

    $("script, style, noscript, header, footer, nav").remove()

    const text = $("body").text().replace(/\s+/g, " ").trim()

    const links: string[] = []

    $("a[href]").each((_, el) => {
        const href = $(el).attr("href")
        if(!href) {
            return
        }
        links.push(new URL(href, baseUrl).toString())
    })

    return {
        title,
        text,
        links
    }
}