import "dotenv/config"

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { createClient } from "@supabase/supabase-js"
import { chunkPage, type RawPage } from "../lib/chunker"

const SUPABASE_URL = process.env.SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY as string
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function insertBatch(rows: any[]) {
    if (rows.length === 0) return
    const { error } = await sb
        .from('njit_chunks')
        .upsert(rows, { onConflict: 'chunk_key' })
    if (error) console.error('insert error:', error)
}


async function processRecord(rec: any) {
    const page: RawPage = {
        url: rec.url,
        title: rec.title || rec.url,
        html: rec.html,
        text: rec.text,
    }

    const chunks = await chunkPage(page)
    return chunks.map(c => ({
        url: c.url,
        title: c.title,
        section: c.section,
        anchor: c.anchor ?? null,
        content: c.content
    }))
}

async function main() {
    const file = path.join(process.cwd(), "data", "corpus.jsonl")
    if (!fs.existsSync(file)) {
        throw new Error(`Missing file: ${file}`)
    }

    const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: "utf-8" }),
        crlfDelay: Infinity
    })

    const MAX_CONCURRENCY = 2
    let active = 0
    let pending: Promise<any>[] = []
    let buffer: any[] = []
    let totalChunks = 0
    let lines = 0

    const launch = async (obj: any) => {
        active++
        try {
            const rows = await processRecord(obj)
            buffer.push(...rows)
            totalChunks += rows.length
            // flush every 100 rows
            if (buffer.length >= 100) {
                const toWrite = buffer.splice(0, buffer.length)
                await insertBatch(toWrite)
            }
        } catch (e) {
            console.error("record failed:", e)
        } finally {
            active--
        }
    }

    for await (const line of rl) {
        if (!line.trim()) continue
        lines++
        let obj: any
        try {
            obj = JSON.parse(line)
        } catch {
            console.warn("skip bad JSON line", lines)
            continue
        }

        while (active >= MAX_CONCURRENCY) {
            await sleep(25)
        }
        const p = launch(obj)
        pending.push(p)
        if (pending.length > 100) {
            pending = pending.filter(pr => pr && typeof pr.then === "function")
        }
    }

    await Promise.allSettled(pending)
    if (buffer.length) {
        await insertBatch(buffer.splice(0, buffer.length))
    }

    console.log(`ingested ~${totalChunks} chunks from ${lines} lines`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
