import { execFile } from "node:child_process"
import { writeFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ocrImage } from "./ocr"

function run(cmd: string, args: string[]) {
    return new Promise<{ stdout: string }>((resolve, reject) => {
        execFile(cmd, args, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout) => {
            if (err) reject(err)
            else resolve({ stdout })
        })
    })
}

async function hasBin(bin: string) {
    try {
        await run(bin, ["-v"])
        return true
    } catch {
        return false
    }
}

async function extractWithPdftotext(pdfPath: string) {
    const { stdout } = await run("pdftotext", ["-layout", "-q", pdfPath, "-"])
    return stdout.trim()
}

async function extractWithPdftoppmOcr(pdfPath: string, pages = 4) {
    const base = join(tmpdir(), `njit_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    await run("pdftoppm", ["-png", "-scale-to", "2000", "-r", "200", pdfPath, base])
    let out = ""
    for (let i = 1; i <= pages; i++) {
        const p = `${base}-${i}.png`
        try {
            const png = await import("node:fs/promises").then(m => m.readFile(p))
            const text = await ocrImage(png)
            if (text) out += text + "\n"
        } catch { }
        await import("node:fs/promises").then(m => m.unlink(p).catch(() => { }))
    }
    return out.trim()
}

export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
    const tmp = join(tmpdir(), `njit_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
    await writeFile(tmp, Buffer.from(bytes))
    try {
        let used = ""
        let txt = ""
        if (await hasBin("pdftotext")) {
            txt = await extractWithPdftotext(tmp)
            used = "pdftotext"
        } else if (await hasBin("pdftoppm")) {
            txt = await extractWithPdftoppmOcr(tmp, 4)
            used = "pdftoppm+ocr"
        } else {
            used = "none"
            txt = ""
        }
        return txt
    } finally {
        await unlink(tmp).catch(() => { })
    }
}
