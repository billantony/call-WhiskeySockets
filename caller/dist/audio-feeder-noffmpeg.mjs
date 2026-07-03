import { EventEmitter } from 'events'

// Buffer global para streaming de audio en tiempo real
// Este buffer se llena desde el endpoint HTTP POST
let audioStreamBuffer = null
const audioEventEmitter = new EventEmitter()

export function setAudioStreamBuffer(buffer) {
    audioStreamBuffer = buffer
}

export function notifyNewChunk() {
    audioEventEmitter.emit('newChunk')
}

export class AudioFeederNoFFmpeg {
    constructor(sampleRate, channels, framesPerChunk, onChunk, audioSource) {
        this.sampleRate = sampleRate
        this.channels = channels
        this.framesPerChunk = framesPerChunk
        this.onChunk = onChunk
        this.audioSource = audioSource
        this.running = false
        this.chunkIndex = 0
    }

    start() {
        this.running = true
        this.chunkIndex = 0
        console.log('[AudioFeederNoFFmpeg] Started - reading from memory buffer')
        
        // Consumir chunks a tasa fija (50 chunks por segundo = 20ms por chunk)
        this.interval = setInterval(() => {
            if (!this.running) return
            
            if (audioStreamBuffer && audioStreamBuffer.chunks.length > 0) {
                // Consumir un chunk a la vez
                const chunk = audioStreamBuffer.chunks[0] // Tomar el primer chunk (FIFO)
                
                if (chunk && chunk.length >= this.framesPerChunk) {
                    const chunkToSend = chunk.slice(0, this.framesPerChunk)
                    this.onChunk(chunkToSend)
                    // Eliminar el chunk consumido
                    audioStreamBuffer.chunks.shift()
                }
            }
        }, 20) // 20ms = 50 chunks por segundo
    }

    stop() {
        this.running = false
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }
        audioEventEmitter.removeAllListeners('newChunk')
        console.log('[AudioFeederNoFFmpeg] Stopped')
    }
}
