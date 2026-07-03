// AudioFeederStream - Alimenta audio en tiempo real desde stream externo (WebSocket)
// Sin ffmpeg, recibe Float32Array directamente

export class AudioFeederStream {
    constructor({ onChunk }) {
        this.onChunk = onChunk
        this.queue = []
        this.chunksEmitted = 0
        this.underflowChunks = 0
        this.running = false
        this.scheduled = false
        this.targetInterval = 20 // 20ms = 50 chunks/second para 16kHz con 320 samples/chunk
        this.lastEmitTime = 0
    }

    start() {
        this.running = true
        this.lastEmitTime = performance.now()
        this.scheduleNext()
        console.log('[AudioFeederStream] Started - waiting for audio chunks from stream')
    }

    stop() {
        this.running = false
        this.queue = []
        console.log('[AudioFeederStream] Stopped')
    }

    // Método para alimentar chunks desde el stream externo
    feedChunk(chunk) {
        if (!this.running) return
        
        // chunk: Float32Array
        this.queue.push(chunk)
        
        // Si hay underflow y llegaron chunks, programar emisión inmediata
        if (this.underflowChunks > 0 && !this.scheduled) {
            this.scheduleNext()
        }
    }

    scheduleNext() {
        if (!this.running) return
        
        this.scheduled = true
        const now = performance.now()
        const timeSinceLastEmit = now - this.lastEmitTime
        const delay = Math.max(0, this.targetInterval - timeSinceLastEmit)
        
        setTimeout(() => {
            this.flushOne()
            this.scheduled = false
            
            if (this.running && this.queue.length > 0) {
                this.scheduleNext()
            } else if (this.running && this.queue.length === 0) {
                // Underflow - esperar más chunks
                this.underflowChunks++
                if (this.underflowChunks % 50 === 0) {
                    console.log(`[AudioFeederStream] Underflow: ${this.underflowChunks} times, waiting for chunks`)
                }
            }
        }, delay)
    }

    flushOne() {
        if (this.queue.length === 0) {
            this.underflowChunks++
            return
        }
        
        const chunk = this.queue.shift()
        this.underflowChunks = 0
        this.chunksEmitted++
        this.lastEmitTime = performance.now()
        
        if (this.onChunk) {
            this.onChunk(chunk)
        }
    }
}
