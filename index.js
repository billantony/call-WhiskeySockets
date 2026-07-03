/**
 * WhatsApp Calls Module
 * Módulo para llamadas de WhatsApp con micrófono en tiempo real
 * Compatible con Baileys
 * 
 * @module whatsapp-calls-module
 */

import { setAudioStreamBuffer, notifyNewChunk } from './caller/dist/audio-feeder-noffmpeg.mjs'
import fs from 'fs'
import path from 'path'
import ffmpegStatic from 'ffmpeg-static'
import { WebSocketServer } from 'ws'

// Configurar ffmpeg
if (ffmpegStatic) {
    process.env.FFMPEG_PATH = ffmpegStatic
    process.env.PATH = path.dirname(ffmpegStatic) + path.delimiter + process.env.PATH
}

// Aumentar umbral de ICE restart para evitar reconexiones
process.env.CALL_ICE_RESTART_IDLE_THRESHOLD_MS = '60000'

// Buffer en memoria para streaming de audio
const audioStreamBuffer = {
    chunks: [],
    silenceCount: 0,
    maxSilenceChunks: 50,
    addChunk(chunk) {
        let isSilence = true
        const threshold = 0.01
        for (let i = 0; i < chunk.length; i++) {
            if (Math.abs(chunk[i]) > threshold) {
                isSilence = false
                break
            }
        }
        
        if (isSilence) {
            this.silenceCount++
            if (this.silenceCount > this.maxSilenceChunks) {
                this.chunks = []
                this.silenceCount = 0
                console.log('[WhatsAppCalls] Silencio detectado, buffer limpiado')
            }
        } else {
            this.silenceCount = 0
            const chunkSize = 320
            for (let i = 0; i < chunk.length; i += chunkSize) {
                const smallChunk = chunk.slice(i, i + chunkSize)
                if (smallChunk.length < chunkSize) {
                    const paddedChunk = new Float32Array(chunkSize)
                    paddedChunk.set(smallChunk)
                    this.chunks.push(paddedChunk)
                } else {
                    this.chunks.push(smallChunk)
                }
            }
        }
        
        notifyNewChunk()
    },
    clear() {
        this.chunks = []
        this.silenceCount = 0
    }
}

class WhatsAppCalls {
    constructor() {
        this.activeCalls = new Map()
        this.wss = null
        this.baileysInstances = new Map()
        this.globalToken = null
        this.requireAuth = false
    }

    /**
     * Inicializa el módulo de llamadas
     * @param {Object|Map} baileysInstance - Instancia de Baileys o Map de instancias
     * @param {Object} httpServer - Servidor HTTP Express (opcional)
     * @param {Object} options - Opciones de configuración
     * @param {string} options.token - Token global de autenticación
     * @param {boolean} options.requireAuth - Requerir autenticación
     * @param {string} options.instanceKey - Key de la instancia (default: 'default')
     */
    async initialize(baileysInstance, httpServer = null, options = {}) {
        if (baileysInstance instanceof Map) {
            this.baileysInstances = baileysInstance
            console.log(`[WhatsAppCalls] Inicializado con ${baileysInstance.size} instancias`)
        } else {
            const instanceKey = options.instanceKey || 'default'
            this.baileysInstances.set(instanceKey, baileysInstance)
            console.log(`[WhatsAppCalls] Inicializado con instancia: ${instanceKey}`)
        }
        
        if (options.token) {
            this.globalToken = options.token
            this.requireAuth = options.requireAuth !== false
            console.log(`[WhatsAppCalls] Autenticación habilitada con token global`)
        } else if (process.env.TOKEN) {
            this.globalToken = process.env.TOKEN
            this.requireAuth = process.env.PROTECT_ROUTES === 'true'
            console.log(`[WhatsAppCalls] Autenticación habilitada con TOKEN de entorno`)
        }
        
        setAudioStreamBuffer(audioStreamBuffer)
        
        if (httpServer) {
            this.initializeWebSocket(httpServer)
        }
        
        console.log('[WhatsAppCalls] Módulo inicializado')
    }

    addInstance(instanceKey, baileysInstance) {
        this.baileysInstances.set(instanceKey, baileysInstance)
        console.log(`[WhatsAppCalls] Instancia agregada: ${instanceKey}`)
    }

    removeInstance(instanceKey) {
        this.baileysInstances.delete(instanceKey)
        console.log(`[WhatsAppCalls] Instancia removida: ${instanceKey}`)
    }

    getInstance(instanceKey) {
        return this.baileysInstances.get(instanceKey || 'default')
    }

    validateToken(token) {
        if (!this.requireAuth) return true
        return this.globalToken === token
    }

    setToken(token) {
        this.globalToken = token
        this.requireAuth = true
        console.log(`[WhatsAppCalls] Token global actualizado`)
    }

    initializeWebSocket(httpServer) {
        this.wss = new WebSocketServer({ server: httpServer, path: '/ws/audio' })
        
        this.wss.on('connection', (ws, req) => {
            const url = new URL(req.url, `http://${req.headers.host}`)
            const callId = url.searchParams.get('callId')
            console.log(`[WhatsAppCalls WS] Cliente conectado para llamada: ${callId}`)
            
            ws.on('close', () => {
                console.log(`[WhatsAppCalls WS] Cliente desconectado de llamada: ${callId}`)
            })
        })
        
        console.log('[WhatsAppCalls] Servidor WebSocket iniciado en /ws/audio')
    }

    sendIncomingAudio(callId, audioData) {
        if (!this.wss) return
        
        this.wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({ callId, audio: Array.from(audioData) }))
            }
        })
    }

    async startCall(phoneNumber, audioSource = 'stream', durationMs = 60000, instanceKey = 'default') {
        const client = this.getInstance(instanceKey)
        if (!client) {
            throw new Error(`Instancia no encontrada: ${instanceKey}`)
        }

        audioStreamBuffer.clear()

        let source
        if (audioSource === 'stream') {
            source = 'stream'
            console.log('[WhatsAppCalls] Fuente de audio: streaming desde micrófono')
        } else if (audioSource === 'silence') {
            source = 'silence'
            console.log('[WhatsAppCalls] Fuente de audio: silencio')
        } else if (fs.existsSync(audioSource)) {
            source = audioSource
            console.log(`[WhatsAppCalls] Fuente de audio: archivo ${audioSource}`)
        } else {
            source = 'silence'
            console.log('[WhatsAppCalls] Fuente de audio no encontrada, usando silencio')
        }

        try {
            const call = await client.call(phoneNumber, { 
                audioSource: source,
                finalDurationMs: durationMs
            })

            const callId = call.callId
            console.log(`[WhatsAppCalls] Llamada iniciada: ${callId} (instancia: ${instanceKey})`)

            this.setupAudioMonitoring(call, callId, instanceKey)

            this.activeCalls.set(callId, {
                call,
                instanceKey,
                phoneNumber,
                startedAt: new Date(),
                isStream: audioSource === 'stream'
            })

            return callId
        } catch (err) {
            console.error('[WhatsAppCalls] Error iniciando llamada:', err)
            throw err
        }
    }

    setupAudioMonitoring(call, callId, instanceKey = 'default') {
        const audioStats = {
            incomingChunks: 0,
            incomingSamples: 0,
            outgoingChunks: 0,
            outgoingSamples: 0
        }

        call.on('audio', (pcm) => {
            audioStats.incomingChunks++
            audioStats.incomingSamples += pcm.length
            
            this.sendIncomingAudio(callId, pcm)
            
            if (audioStats.incomingChunks === 1) {
                console.log(`[WhatsAppCalls] Primer chunk de audio entrante recibido: ${pcm.length} samples`)
            }
        })

        call.on('audioOut', (pcm) => {
            audioStats.outgoingChunks++
            audioStats.outgoingSamples += pcm.length
        })

        call.on('ended', (reason) => {
            console.log(`[WhatsAppCalls] Llamada ${callId} terminada: ${reason}`)
            console.log(`[WhatsAppCalls] Estadísticas: entrante=${audioStats.incomingChunks} chunks, saliente=${audioStats.outgoingChunks} chunks`)
            this.activeCalls.delete(callId)
            audioStreamBuffer.clear()
        })

        call.on('error', (err) => {
            console.error(`[WhatsAppCalls] Error en llamada ${callId}:`, err)
            this.activeCalls.delete(callId)
            audioStreamBuffer.clear()
        })
    }

    async endCall(callId) {
        const active = this.activeCalls.get(callId)
        if (!active) {
            throw new Error('Llamada no encontrada')
        }

        try {
            await active.call.end()
            console.log(`[WhatsAppCalls] Llamada ${callId} terminada`)
            audioStreamBuffer.clear()
        } catch (err) {
            console.error('[WhatsAppCalls] Error terminando llamada:', err)
            throw err
        }
    }

    processAudioChunk(callId, audioBuffer) {
        const active = this.activeCalls.get(callId)
        if (!active) {
            throw new Error('Llamada no encontrada')
        }

        const audioChunk = new Float32Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 4)
        audioStreamBuffer.addChunk(audioChunk)
        
        return { success: true }
    }

    getCallStatus(callId) {
        const active = this.activeCalls.get(callId)
        if (!active) return null

        return {
            callId,
            phoneNumber: active.phoneNumber,
            startedAt: active.startedAt,
            isStream: active.isStream,
            duration: Date.now() - active.startedAt.getTime()
        }
    }

    getActiveCalls() {
        return Array.from(this.activeCalls.entries()).map(([callId, data]) => ({
            callId,
            phoneNumber: data.phoneNumber,
            startedAt: data.startedAt,
            isStream: data.isStream,
            duration: Date.now() - data.startedAt.getTime()
        }))
    }
}

export { WhatsAppCalls, audioStreamBuffer }
