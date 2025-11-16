export function needsDynamicRendering(html: string, text: string): boolean {
    const lower = html.toLowerCase()
    const spaRoot =
        lower.includes('id="root"') ||
        lower.includes('id="app"') ||
        lower.includes('id="__next"') ||
        lower.includes('data-reactroot') ||
        lower.includes('ng-version')
    const hasHydrationHints =
        lower.includes('__next_f') ||
        lower.includes('__nuxt') ||
        lower.includes('window.__apollo') ||
        lower.includes('window.__data')
    const scriptWeight = (lower.match(/<script\b/g) || []).length
    const nodeCountApprox = (lower.match(/<\/\w+/g) || []).length
    const textLen = text.length
    const density = nodeCountApprox > 0 ? textLen / nodeCountApprox : textLen
    const veryLittleText = textLen < 400 || density < 3
    return (spaRoot || hasHydrationHints || scriptWeight > 20) && veryLittleText
}
