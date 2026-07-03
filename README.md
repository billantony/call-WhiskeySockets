# WhatsApp Calls Module for Baileys

<div align="center">

**Real-time WhatsApp calls with microphone support**

Compatible with Baileys

[Installation](#-installation) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Examples](#-examples)

</div>

## ✨ Features

- 🎤 Real-time calls with microphone
- 🔊 Incoming audio playback in browser
- 📱 Support for multiple WhatsApp instances
- 🔐 Compatible with Baileys authentication
- 🌐 WebSocket for audio streaming
- 🎯 Easy integration into existing projects

## 🚀 Installation

```bash
npm install https://github.com/tu-usuario/whatsapp-calls-package.git
```

### Requirements

- Node.js 18+
- Baileys (`@whiskeysockets/baileys`)

**Note**: The package automatically includes:
- `caller` (modified version of baileys-caller with AudioFeederNoFFmpeg)
- `ws` (WebSocket)
- `ffmpeg-static` (FFmpeg)

## 📖 Quick Start

### 1. Import and initialize

```javascript
import { WhatsAppCalls } from 'whatsapp-calls-module'

const calls = new WhatsAppCalls()
await calls.initialize(baileysInstance, expressServer)
```

### 2. Start a call

```javascript
const callId = await calls.startCall('+1234567890', 'stream', 60000)
```

### 3. End a call

```javascript
await calls.endCall(callId)
```

## 🎯 Complete Example

```javascript
import express from 'express'
import { makeWASocket } from '@whiskeysockets/baileys'
import { WhatsAppCalls } from 'whatsapp-calls-module'

const app = express()
app.use(express.json())
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }))

// Create Baileys socket
const sock = makeWASocket({
    printQRInTerminal: true,
    browser: ['Chrome', 'Linux', '3.0']
})

// Wait for connection
sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
        // Initialize calls module
        const calls = new WhatsAppCalls()
        await calls.initialize(sock, app)
        
        // Make available globally
        global.whatsappCalls = calls
    }
})

// Endpoint to start call
app.post('/call/start', async (req, res) => {
    const { phoneNumber, audioSource, durationMs } = req.body
    const callId = await global.whatsappCalls.startCall(phoneNumber, audioSource, durationMs)
    res.json({ error: false, callId })
})

// Endpoint to end call
app.post('/call/end', async (req, res) => {
    const { callId } = req.body
    await global.whatsappCalls.endCall(callId)
    res.json({ error: false, message: 'Call ended' })
})

// Endpoint for microphone audio
app.post('/call/audio/:callId', async (req, res) => {
    global.whatsappCalls.processAudioChunk(req.params.callId, req.body)
    res.json({ error: false, message: 'Audio chunk received' })
})

app.listen(8080)
```

## 📱 Multiple Instances

If you have multiple WhatsApp numbers:

```javascript
const calls = new WhatsAppCalls()

// Create instances map
const instances = new Map()
instances.set('instance1', baileysInstance1)
instances.set('instance2', baileysInstance2)

await calls.initialize(instances, expressServer)

// Make call from specific instance
const callId = await calls.startCall('+1234567890', 'stream', 60000, 'instance1')
```

## 🔐 Authentication

The module uses Baileys authentication middleware:

```javascript
import tokenVerification from './middlewares/tokenCheck.js'

app.post('/call/start', tokenVerification, async (req, res) => {
    // Token already validated by middleware
    const callId = await global.whatsappCalls.startCall(...)
})
```

## 📡 API

### `initialize(baileysInstance, httpServer, options)`

Initialize the module.

- `baileysInstance`: Baileys instance or Map of instances
- `httpServer`: Express HTTP server (optional)
- `options.instanceKey`: Instance key (default: 'default')

### `startCall(phoneNumber, audioSource, durationMs, instanceKey)`

Start a call.

- `phoneNumber`: Phone number with country code
- `audioSource`: 'stream', 'silence', or file path
- `durationMs`: Max duration in ms (default: 60000)
- `instanceKey`: Instance key (default: 'default')

### `endCall(callId)`

End a call.

- `callId`: Call ID

### `processAudioChunk(callId, audioBuffer)`

Process a microphone audio chunk.

- `callId`: Call ID
- `audioBuffer`: Audio buffer (Float32)

## 📚 Documentation

- [Complete Example](./example.js) - Example code

## 🤝 Contributing

Contributions are welcome. Please open an issue or pull request.

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

## 👤 Author

**bgrandez**

## 🙏 Acknowledgments

Based on [baileys-caller](https://github.com/ShellTear/baileys-caller) by ShellTear

---

<div align="center">

**⭐ If you like this project, give it a star on GitHub!**

</div>
