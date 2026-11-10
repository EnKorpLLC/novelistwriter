"use client";

import { concat } from "@/lib/audio/wav";

/**
 * The microphone with every browser "enhancement" off. Echo cancelling, noise suppression, and automatic
 * volume all damage narration and get audiobooks rejected for sounding processed.
 */
export async function openMicrophone(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't record audio. Use Chrome or Edge on a computer.");
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
}

export async function listMicrophones() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput").map((d) => ({ id: d.deviceId, label: d.label || "Microphone" }));
}

/** Captures raw samples from a stream (a microphone, or a test tone in checks) and reports live levels. */
export class Recorder {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private sink: GainNode;
  private chunks: Float32Array[] = [];
  private recording = false;
  onLevel: ((peakDb: number) => void) | null = null;

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(stream);
    // Keep the graph running without playing the microphone back through the speakers
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);
  }

  get sampleRate() {
    return this.ctx.sampleRate;
  }

  static async create(stream: MediaStream): Promise<Recorder> {
    const ctx = new AudioContext();
    const r = new Recorder(ctx, stream);
    let flowing: () => void = () => {};
    const firstBlock = new Promise<void>((resolve) => (flowing = resolve));
    const onBlock = (block: Float32Array) => {
      flowing();
      let peak = 0;
      for (let i = 0; i < block.length; i++) peak = Math.max(peak, Math.abs(block[i]));
      r.onLevel?.(peak > 0 ? 20 * Math.log10(peak) : -120);
      if (r.recording) r.chunks.push(block);
    };
    try {
      await ctx.audioWorklet.addModule("/audio/recorder-worklet.js");
      const node = new AudioWorkletNode(ctx, "nw-recorder", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data);
      r.node = node;
    } catch {
      // Older browsers: the deprecated processor still records faithfully
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
      r.node = node;
    }
    r.source.connect(r.node);
    r.node.connect(r.sink);
    if (ctx.state === "suspended") await ctx.resume();
    // Audio takes a moment to start flowing; returning before it does would cut off the narrator's first words
    await Promise.race([firstBlock, new Promise((res) => setTimeout(res, 1500))]);
    return r;
  }

  start() {
    this.chunks = [];
    this.recording = true;
  }

  /** Stop and hand back everything recorded since start(). */
  stop(): { samples: Float32Array; sampleRate: number } {
    this.recording = false;
    const samples = concat(this.chunks);
    this.chunks = [];
    return { samples, sampleRate: this.ctx.sampleRate };
  }

  /** Record for a fixed time: room checks and room tone. */
  async recordFor(ms: number) {
    this.start();
    await new Promise((r) => setTimeout(r, ms));
    return this.stop();
  }

  async close() {
    this.recording = false;
    try {
      this.source.disconnect();
      this.node?.disconnect();
    } catch {
      /* already disconnected */
    }
    await this.ctx.close().catch(() => null);
  }
}
