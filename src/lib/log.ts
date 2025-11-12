import { DEBUG } from "../config/njit";

export function debugLog(...args: unknown[]) {
    if(!DEBUG) {
        return
    }

    console.log("[DEBUG]", ...args)
}