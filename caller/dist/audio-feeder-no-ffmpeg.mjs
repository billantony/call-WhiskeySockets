import { decoder as mp3Decoder } from '@audio/decode-mp3';
import { decoder as wavDecoder } from '@audio/decode-wav';
import fs from 'fs';

const FrameSamples = 320; // 20ms @ 16kHz
const SampleRate = 16000;

/**
 * Resampling lineal simple (como meowcaller)
 * Convierte cualquier sample rate/canales a 16kHz mono
 */
class SimpleResampler {
    constructor(inRate, inChannels) {
        this.inRate = inRate;
        this.inChannels = inChannels;
        this.pos = 0; // posición fraccional
        this.lastSample = 0;
        this.havePrev = false;
    }

    process(mono) {
        if (this.inRate === SampleRate) {
            return mono;
        }

        const step = this.inRate / SampleRate;
        const out = [];
        
        // Construir buffer con sample previo para interpolación continua
        let src = mono;
        let base = 0;
        
        if (this.havePrev) {
            src = [this.lastSample, ...mono];
            base = 1;
        }
        
        while (true) {
            const idx = this.pos + base;
            const i = Math.floor(idx);
            
            if (i + 1 >= src.length) {
                break;
            }
            
            const frac = idx - i;
            const s = src[i] * (1 - frac) + src[i + 1] * frac;
            out.push(s);
            this.pos += step;
        }
        
        // Ajustar posición para el siguiente chunk
        this.pos -= mono.length;
        this.lastSample = mono[mono.length - 1];
        this.havePrev = true;
        
        return new Float32Array(out);
    }
}

/**
 * AudioFeeder sin ffmpeg - usa decoders JS/WASM
 * Inspirado en meowcaller/source.go
 */
class AudioFeederNoFFmpeg {
    constructor(sampleRate, channels, framesPerChunk, onChunk, source) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.framesPerChunk = framesPerChunk;
        this.onChunk = onChunk;
        this.source = source;
        
        this.pending = []; // Float32Array de samples pendientes
        this.originalAudio = null; // Audio original para loop infinito
        this.decoder = null;
        this.resampler = null;
        this.fileHandle = null;
        this.running = false;
        this.chunksEmitted = 0;
        this.underflowChunks = 0;
    }

    async start() {
        console.log(`[AudioFeederNoFFmpeg] Starting with source: ${this.source}`);
        
        if (this.source === "silence") {
            this.startSilence();
            return;
        }

        try {
            // Detectar formato por extensión
            const ext = this.source.toLowerCase().split('.').pop();
            
            if (ext === 'mp3') {
                await this.startMP3();
            } else if (ext === 'wav') {
                await this.startWAV();
            } else {
                throw new Error(`Unsupported format: ${ext}`);
            }
            
            this.running = true;
            this.scheduleNext();
            console.log(`[AudioFeederNoFFmpeg] Started successfully`);
        } catch (err) {
            console.error(`[AudioFeederNoFFmpeg] Start failed:`, err);
            throw err;
        }
    }

    async startMP3() {
        console.log(`[AudioFeederNoFFmpeg] Starting MP3 decoder`);
        
        // Leer archivo completo (para streaming usar fs.createReadStream)
        const buffer = fs.readFileSync(this.source);
        
        // Inicializar decoder MP3
        this.decoder = await mp3Decoder();
        
        // Decodificar archivo completo
        const decoded = this.decoder.decode(buffer);
        this.decoder.free();
        
        console.log(`[AudioFeederNoFFmpeg] MP3 decoded: ${decoded.channelData.length} channels, ${decoded.sampleRate} Hz, ${decoded.channelData[0].length} samples`);
        
        // Configurar resampler
        const inputChannels = decoded.channelData.length;
        const inputRate = decoded.sampleRate;
        
        this.resampler = new SimpleResampler(inputRate, inputChannels);
        
        // Downmix a mono y resample
        const mono = this.downmix(decoded.channelData);
        const resampled = this.resampler.process(mono);
        
        // Log para verificar rango de valores
        const minVal = Math.min(...resampled);
        const maxVal = Math.max(...resampled);
        console.log(`[AudioFeederNoFFmpeg] Audio range: min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}`);
        
        this.pending = Array.from(resampled);
        this.originalAudio = Array.from(resampled); // Guardar para loop infinito
        console.log(`[AudioFeederNoFFmpeg] Resampled to ${this.pending.length} samples @ ${SampleRate}Hz mono (loop enabled)`);
    }

    async startWAV() {
        console.log(`[AudioFeederNoFFmpeg] Starting WAV decoder`);
        
        // Leer archivo completo
        const buffer = fs.readFileSync(this.source);
        
        // Inicializar decoder WAV
        this.decoder = await wavDecoder();
        
        // Decodificar archivo completo
        const decoded = this.decoder.decode(buffer);
        this.decoder.free();
        
        console.log(`[AudioFeederNoFFmpeg] WAV decoded: ${decoded.channelData.length} channels, ${decoded.sampleRate} Hz, ${decoded.channelData[0].length} samples`);
        
        // Configurar resampler
        const inputChannels = decoded.channelData.length;
        const inputRate = decoded.sampleRate;
        
        this.resampler = new SimpleResampler(inputRate, inputChannels);
        
        // Downmix a mono y resample
        const mono = this.downmix(decoded.channelData);
        const resampled = this.resampler.process(mono);
        
        // Log para verificar rango de valores
        const minVal = Math.min(...resampled);
        const maxVal = Math.max(...resampled);
        console.log(`[AudioFeederNoFFmpeg] Audio range: min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}`);
        
        this.pending = Array.from(resampled);
        this.originalAudio = Array.from(resampled); // Guardar para loop infinito
        console.log(`[AudioFeederNoFFmpeg] Resampled to ${this.pending.length} samples @ ${SampleRate}Hz mono (loop enabled)`);
    }

    startSilence() {
        console.log(`[AudioFeederNoFFmpeg] Starting silence generator`);
        // Generar silencio infinito
        this.running = true;
        this.scheduleNext();
    }

    downmix(channelData) {
        if (channelData.length === 1) {
            return channelData[0];
        }
        
        // Promediar canales
        const samples = channelData[0].length;
        const mono = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let ch = 0; ch < channelData.length; ch++) {
                sum += channelData[ch][i];
            }
            mono[i] = sum / channelData.length;
        }
        
        return mono;
    }

    scheduleNext() {
        if (!this.running) return;
        
        const chunkIntervalMs = 20; // 20ms por chunk @ 16kHz
        setTimeout(() => this.flushOne(), chunkIntervalMs);
    }

    flushOne() {
        if (!this.running) return;
        
        // Extraer frame de tamaño FrameSamples
        if (this.pending.length >= FrameSamples) {
            const frame = this.pending.splice(0, FrameSamples);
            this.emitChunk(new Float32Array(frame));
        } else if (this.source === "silence") {
            // Generar silencio
            const frame = new Float32Array(FrameSamples).fill(0);
            this.emitChunk(frame);
        } else {
            // Loop infinito del audio (como -stream_loop -1 en ffmpeg)
            if (this.originalAudio && this.originalAudio.length > 0) {
                // Reciclar samples restantes y agregar del inicio
                const remaining = this.pending;
                this.pending = [...this.originalAudio, ...remaining];
                console.log(`[AudioFeederNoFFmpeg] Looping audio - recycling ${remaining.length} samples`);
                
                // Extraer frame
                const frame = this.pending.splice(0, FrameSamples);
                this.emitChunk(new Float32Array(frame));
            } else {
                // Audio terminado, generar silencio
                const frame = new Float32Array(FrameSamples).fill(0);
                this.emitChunk(frame);
                this.underflowChunks++;
            }
        }
        
        this.scheduleNext();
    }

    emitChunk(chunk) {
        this.chunksEmitted++;
        console.log(`[AudioFeederNoFFmpeg] Emitting chunk ${this.chunksEmitted} (queue: ${this.pending.length}, underflow: ${this.underflowChunks})`);
        this.onChunk(chunk);
    }

    stop() {
        console.log(`[AudioFeederNoFFmpeg] Stopping`);
        this.running = false;
        
        if (this.decoder) {
            try {
                this.decoder.free();
            } catch (e) {
                // Ignorar errores al liberar
            }
            this.decoder = null;
        }
        
        this.pending = [];
    }
}

export { AudioFeederNoFFmpeg };
