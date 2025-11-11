export function needsDynamicRendering(html: string, text: string): boolean {
    const lower = html.toLowerCase()

    const looksLikeSpaRoot = lower.includes("id=\"root\"") || lower.includes("id=\"app\"") || lower.includes("id=\"__next\"") 

    const veryLittleText = text.length < 400

    return looksLikeSpaRoot && veryLittleText
}