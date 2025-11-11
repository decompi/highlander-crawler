import fs from "node:fs"
import path from "node:path"
import { PageRecord } from "./types"

const dataDir = path.join(process.cwd(), "data")
const corpusFile = path.join(dataDir, "corpus.jsonl")

if(!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
        recursive: true
    })
}

export function appendPage(record: PageRecord) {
    const line = JSON.stringify(record)
    fs.appendFileSync(corpusFile, line + "\n", "utf-8")
}