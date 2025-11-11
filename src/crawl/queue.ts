export type QueueItem = {
    url: string,
    depth: number
}

export class UrlQueue {
    private queue: QueueItem[] = []
    private visited = new Set<string>()

    enqueue(item: QueueItem) {
        if(this.visited.has(item.url)) {
            return
        }
        this.queue.push(item)
    }

    dequeue(): QueueItem | undefined {
        const item = this.queue.shift()
        if(item) {
            this.visited.add(item.url)
        }
        return item
    }
    
    hasNext() {
        return this.queue.length > 0
    }

    hasVisitied(url: string) {
        return this.visited.has(url)
    }
}