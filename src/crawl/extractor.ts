import * as cheerio from "cheerio"
import { ExtractedPage } from "../storage/types"

export function extractFromHtml(html: string, baseUrl: string): ExtractedPage {
    const $ = cheerio.load(html)

    const title = $("title").first().text().trim()

    const canonicalHref = $('link[rel="canonical"]').attr("href")
    let canonicalUrl: string | undefined;
    if(canonicalHref) {
        try {
            canonicalUrl = new URL(canonicalHref, baseUrl).toString()
        } catch {

        }
    }

    $("script, style, noscript, header, footer, nav").remove()

    const text = $("body").text().replace(/\s+/g, " ").trim()

    const links: string[] = []
    $("a[href]").each((_, el) => {
        const href = $(el).attr("href")
        if(!href) {
            return
        }

        try {
            const url = new URL(href, baseUrl).toString()
            links.push(url)
        } catch {

        }
    })

    return {
        title,
        text,
        links,
        canonicalUrl
    }
}