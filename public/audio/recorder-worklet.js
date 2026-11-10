// Runs on the audio thread: copies each block of mono samples to the page, untouched (no compression or noise processing).
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) this.port.postMessage(input[0].slice(0));
    return true;
  }
}
registerProcessor("nw-recorder", RecorderProcessor);
