// The audio tap of the computer capture: hands each block of the mixed input to the page, which
// resamples and frames it with the hub's pipeline. Served as a file because the CSP allows no blob script.
class LenteTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("lente-tap", LenteTap);
