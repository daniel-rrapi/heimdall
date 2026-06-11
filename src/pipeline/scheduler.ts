export class Semaphore {
  private queue: Array<() => void> = []

  constructor(private permits: number) {}

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.permits > 0) {
          this.permits--
          resolve(() => {
            this.permits++
            const next = this.queue.shift()
            if (next) next()
          })
        } else {
          this.queue.push(tryAcquire)
        }
      }
      tryAcquire()
    })
  }
}
