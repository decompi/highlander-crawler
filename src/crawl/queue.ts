export type QueueItem = {
    url: string,
    depth: number
}

function normalizeUrlForKey(url: string): string {
    try {
        let u = new URL(url)
        u.hash = ""
        return u.toString()
    } catch { 
        return url
    }
}

export class UrlQueue {
    private queue: QueueItem[] = []
    private visited = new Set<string>()
    private enqueued = new Set<string>()

    enqueue(item: QueueItem) {
        const key = normalizeUrlForKey(item.url)
        
        if(this.visited.has(key) || this.enqueued.has(key)) {
            return
        }

        this.queue.push({...item, url: key})
        this.enqueued.add(key)
    }

    dequeue(): QueueItem | undefined {
        const item = this.queue.shift()
        if(item) {
            const key = normalizeUrlForKey(item.url)
            this.visited.add(key)
        }
        return item
    }
    
    hasNext() {
        return this.queue.length > 0
    }

    hasVisitied(url: string) {
        return this.visited.has(normalizeUrlForKey(url))
    }
}