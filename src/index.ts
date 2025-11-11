import { SEEDS } from "./config/njit"

async function main() {
    console.log("Highlander Crawler starting...")
    console.log("Seeds: ", SEEDS)

}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})