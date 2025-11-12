import fs from "node:fs"
import path from "node:path"
import { PageRecord } from "./types"
import { supabase } from "./supbaseClient"


const dataDir = path.join(process.cwd(), "data")
const corpusFile = path.join(dataDir, "corpus.jsonl")

if(!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
        recursive: true
    })
}

const seenUrls = new Set<string>()

if(fs.existsSync(corpusFile)) {
    const lines = fs.readFileSync(corpusFile, "utf-8").split("\n")
    for(const line of lines) {
        if(!line.trim()) {
            continue
        }
        try {
            const rec = JSON.parse(line) as PageRecord
            if(rec.url) {
                seenUrls.add(rec.url)
            }
        } catch {

        }
    }
}

export async function savePageToSupabase(record: PageRecord) {
    const { error } = await supabase.from("njit_docs").upsert({
        url: record.url,
        title: record.title,
        text: record.text,
        discoveredAt: record.discoveredAt,
        source: record.source
    }, {
        onConflict: "url"
    })

    if(error) {
        console.error('Supabase error when saving page', error)
    }
}

export function appendPage(record: PageRecord) {
    if(seenUrls.has(record.url)) {
        return
    }
    const line = JSON.stringify(record)
    fs.appendFileSync(corpusFile, line + "\n", "utf-8")
    seenUrls.add(record.url)
}

export function hasPage(url: string): boolean {
    return seenUrls.has(url);
}