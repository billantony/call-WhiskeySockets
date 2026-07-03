# WhatsApp Calls Module for Baileys

<div align="center">

**Módulo para llamadas de WhatsApp con micrófono en tiempo real**

Compatible con Baileys

[Instalación](#-instalación) • [Uso Rápido](#-uso-rápido) • [Documentación](#-documentación) • [Ejemplos](#-ejemplos)

</div>

## ✨ Características

- 🎤 Llamadas con micrófono en tiempo real
- 🔊 Audio entrante reproducido en el navegador
- 📱 Soporte para múltiples instancias de WhatsApp
- 🔐 Compatible con autenticación de Baileys
- 🌐 WebSocket para streaming de audio
- 🎯 Fácil integración en proyectos existentes

## 🚀 Instalación

```bash
npm install https://github.com/tu-usuario/whatsapp-calls-package.git
```

### Requisitos

- Node.js 18+
- Baileys (`@whiskeysockets/baileys`)

**Nota**: El paquete incluye automáticamente:
- `caller` (versión modificada de baileys-caller con AudioFeederNoFFmpeg)
- `ws` (WebSocket)
- `ffmpeg-static` (FFmpeg)

## 📖 Uso Rápido

### 1. Importar e inicializar

```javascript
import { WhatsAppCalls } from 'whatsapp-calls-module'

const calls = new WhatsAppCalls()
await calls.initialize(baileysInstance, expressServer)
```

### 2. Iniciar una llamada

```javascript
const callId = await calls.startCall('+1234567890', 'stream', 60000)
```

### 3. Terminar una llamada

```javascript
await calls.endCall(callId)
```

## 🎯 Ejemplo Completo

```javascript
import express from 'express'
import { makeWASocket } from '@whiskeysockets/baileys'
import { WhatsAppCalls } from 'whatsapp-calls-module'

const app = express()
app.use(express.json())
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }))

// Crear socket de Baileys
const sock = makeWASocket({
    printQRInTerminal: true,
    browser: ['Chrome', 'Linux', '3.0']
})

// Esperar conexión
sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
        // Inicializar módulo de llamadas
        const calls = new WhatsAppCalls()
        await calls.initialize(sock, app)
        
        // Hacer disponible globalmente
        global.whatsappCalls = calls
    }
})

// Endpoint para iniciar llamada
app.post('/call/start', async (req, res) => {
    const { phoneNumber, audioSource, durationMs } = req.body
    const callId = await global.whatsappCalls.startCall(phoneNumber, audioSource, durationMs)
    res.json({ error: false, callId })
})

// Endpoint para terminar llamada
app.post('/call/end', async (req, res) => {
    const { callId } = req.body
    await global.whatsappCalls.endCall(callId)
    res.json({ error: false, message: 'Llamada terminada' })
})

// Endpoint para audio del micrófono
app.post('/call/audio/:callId', async (req, res) => {
    global.whatsappCalls.processAudioChunk(req.params.callId, req.body)
    res.json({ error: false, message: 'Audio chunk recibido' })
})

app.listen(8080)
```

## 📱 Múltiples Instancias

Si tienes múltiples números de WhatsApp:

```javascript
const calls = new WhatsAppCalls()

// Crear mapa de instancias
const instances = new Map()
instances.set('instance1', baileysInstance1)
instances.set('instance2', baileysInstance2)

await calls.initialize(instances, expressServer)

// Hacer llamada desde una instancia específica
const callId = await calls.startCall('+1234567890', 'stream', 60000, 'instance1')
```

## 🔐 Autenticación

El módulo usa el middleware de autenticación de Baileys:

```javascript
import tokenVerification from './middlewares/tokenCheck.js'

app.post('/call/start', tokenVerification, async (req, res) => {
    // El token ya fue validado por el middleware
    const callId = await global.whatsappCalls.startCall(...)
})
```

## 📡 API

### `initialize(baileysInstance, httpServer, options)`

Inicializa el módulo.

- `baileysInstance`: Instancia de Baileys o Map de instancias
- `httpServer`: Servidor HTTP Express (opcional)
- `options.instanceKey`: Key de la instancia (default: 'default')

### `startCall(phoneNumber, audioSource, durationMs, instanceKey)`

Inicia una llamada.

- `phoneNumber`: Número de teléfono con código de país
- `audioSource`: 'stream', 'silence', o ruta de archivo
- `durationMs`: Duración máxima en ms (default: 60000)
- `instanceKey`: Key de la instancia (default: 'default')

### `endCall(callId)`

Termina una llamada.

- `callId`: ID de la llamada

### `processAudioChunk(callId, audioBuffer)`

Procesa un chunk de audio del micrófono.

- `callId`: ID de la llamada
- `audioBuffer`: Buffer de audio (Float32)

## 📚 Documentación

- [Ejemplo Completo](./example.js) - Código de ejemplo

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor abre un issue o pull request.

## 📄 Licencia

MIT License - ver archivo [LICENSE](./LICENSE)

## 👤 Autor

**bgrandez**

## 🙏 Agradecimientos

Basado en [baileys-caller](https://github.com/ShellTear/baileys-caller) de ShellTear

---

<div align="center">

**⭐ Si te gusta este proyecto, dale una estrella en GitHub!**

</div>
