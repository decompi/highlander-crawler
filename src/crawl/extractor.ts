import * as cheerio from "cheerio"
import { Element } from "domhandler"
const clean = (s: string) => s.replace(/\s+/g, " ").trim()

function tableToText($: cheerio.CheerioAPI, table: Element) {
    const $t = $(table)
    const headerCells = $t.find("tr").first().find("th,td").toArray().map(c => clean($(c).text()))
    const rows: string[] = []
    $t.find("tr").slice(1).each((_, tr) => {
        const cells = $(tr).find("th,td").toArray().map(c => clean($(c).text()))
        if (!cells.join("").trim()) return
        const pairs = cells.map((v, i) => `${headerCells[i] || `col_${i + 1}`}: ${v}`)
        rows.push(pairs.join(", "))
    })
    return rows.join(" | ")
}

export function extractFromHtml(html: string, baseUrl: string) {
    const $ = cheerio.load(html)
    $("script,style,noscript,header,footer,nav").remove()

    const title = $("title").first().text().trim()

    let canonicalUrl: string | undefined
    const cand = $('link[rel="canonical"]').attr("href")
        || $('meta[property="og:url"]').attr("content")
        || $('meta[name="twitter:url"]').attr("content")
    if (cand) {
        try { canonicalUrl = new URL(cand, baseUrl).toString() } catch { }
    }

    const links: string[] = []
    $("a[href]").each((_, el) => {
        try { links.push(new URL($(el).attr("href")!, baseUrl).toString()) } catch { }
    })

    const tableText: string[] = []
    $("table").each((_, t) => {
        const txt = tableToText($, t)
        if (txt) tableText.push(txt)
    })

    const bodyText = clean($("body").text() + (tableText.length ? " " + tableText.join(" ") : ""))

    return {
        title,
        text: bodyText,
        links,
        sections: [] as any[],
        canonicalUrl,
    }
}
