import Tesseract from "tesseract.js"

let workerInit: Promise<void> | null = null

async function ensureWarm() {
    if (!workerInit) {
        workerInit = (async () => {
            const w = await Tesseract.createWorker()
            await w.terminate()
        })()
    }
    await workerInit
}

export async function ocrImage(bytes: ArrayBuffer | Buffer): Promise<string> {
    await ensureWarm()
    const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(new Uint8Array(bytes as ArrayBuffer))
    const { data } = await Tesseract.recognize(b, "eng")
    return data.text || ""
}