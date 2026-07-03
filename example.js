/**
 * Ejemplo completo de uso de whatsapp-calls-module
 * 
 * Este archivo muestra cómo integrar el módulo en un proyecto Baileys existente
 */

import express from 'express'
import { makeWASocket, DisconnectReason } from '@whiskeysockets/baileys'
import pino from 'pino'
import { WhatsAppCalls } from './index.js'

const app = express()
const PORT = 8080

// Middleware
app.use(express.json())
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }))
app.use(express.static('public'))

// Inicializar Baileys
async function startBaileys() {
    const logger = pino({ level: 'info' })
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        logger,
        browser: ['Chrome', 'Linux', '3.0']
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        
        if (qr) {
            console.log('QR Code:', qr)
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Conexión cerrada, reconectando...', shouldReconnect)
            if (shouldReconnect) {
                startBaileys()
            }
        } else if (connection === 'open') {
            console.log('Conexión abierta')
            
            // Inicializar módulo de llamadas cuando Baileys esté conectado
            const calls = new WhatsAppCalls()
            
            // Usar token de entorno y configuración de Baileys automáticamente
            calls.initialize(sock, app, {
                token: process.env.TOKEN,
                instanceKey: 'default'
            }).then(() => {
                // Hacer calls disponible globalmente para los endpoints
                global.whatsappCalls = calls
                console.log('[WhatsAppCalls] Módulo inicializado y listo para usar')
            }).catch(err => {
                console.error('Error inicializando módulo de llamadas:', err)
            })
        }
    })

    return sock
}

// Inicializar servidor
const server = app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`)
    startBaileys()
})

// ==================== ENDPOINTS PARA LLAMADAS ====================

/**
 * Iniciar una llamada
 * POST /call/start
 * Body: { phoneNumber: string, audioSource: string, durationMs: number, instanceKey: string }
 */
app.post('/call/start', async (req, res) => {
    try {
        const { phoneNumber, audioSource = 'stream', durationMs = 60000, instanceKey = 'default' } = req.body
        
        if (!global.whatsappCalls) {
            return res.status(503).json({ error: true, message: 'Módulo de llamadas no inicializado' })
        }

        const callId = await global.whatsappCalls.startCall(phoneNumber, audioSource, durationMs, instanceKey)
        
        res.json({ error: false, callId })
    } catch (err) {
        res.status(500).json({ error: true, message: err.message })
    }
})

/**
 * Terminar una llamada
 * POST /call/end
 * Body: { callId: string }
 */
app.post('/call/end', async (req, res) => {
    try {
        const { callId } = req.body
        
        if (!global.whatsappCalls) {
            return res.status(503).json({ error: true, message: 'Módulo de llamadas no inicializado' })
        }

        await global.whatsappCalls.endCall(callId)
        
        res.json({ error: false, message: 'Llamada terminada' })
    } catch (err) {
        res.status(500).json({ error: true, message: err.message })
    }
})

/**
 * Recibir chunk de audio del micrófono
 * POST /call/audio/:callId
 * Headers: { Authorization: Bearer {token} } (manejado por middleware de Baileys)
 * Body: Float32Array (binary)
 */
app.post('/call/audio/:callId', async (req, res) => {
    try {
        const { callId } = req.params
        
        if (!global.whatsappCalls) {
            return res.status(503).json({ error: true, message: 'Módulo de llamadas no inicializado' })
        }

        global.whatsappCalls.processAudioChunk(callId, req.body)
        
        res.json({ error: false, message: 'Audio chunk recibido' })
    } catch (err) {
        res.status(500).json({ error: true, message: err.message })
    }
})

/**
 * Obtener estado de una llamada
 * GET /call/status/:callId
 */
app.get('/call/status/:callId', (req, res) => {
    try {
        const { callId } = req.params
        
        if (!global.whatsappCalls) {
            return res.status(503).json({ error: true, message: 'Módulo de llamadas no inicializado' })
        }

        const status = global.whatsappCalls.getCallStatus(callId)
        
        if (!status) {
            return res.status(404).json({ error: true, message: 'Llamada no encontrada' })
        }
        
        res.json({ error: false, status })
    } catch (err) {
        res.status(500).json({ error: true, message: err.message })
    }
})

/**
 * Obtener todas las llamadas activas
 * GET /call/active
 */
app.get('/call/active', (req, res) => {
    try {
        if (!global.whatsappCalls) {
            return res.status(503).json({ error: true, message: 'Módulo de llamadas no inicializado' })
        }

        const calls = global.whatsappCalls.getActiveCalls()
        
        res.json({ error: false, calls })
    } catch (err) {
        res.status(500).json({ error: true, message: err.message })
    }
})

export default app
