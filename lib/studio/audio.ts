export type AudioAnalysis = {
  duration: number;
  rate: number;
  energy: Float32Array;
  bass: Float32Array;
  percussion: Float32Array;
  beats: number[];
  waveform: number[];
};

/** Analyze real samples locally; the same envelope drives preview and export. */
export async function analyzeAudio(file: File): Promise<AudioAnalysis> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const rate = 60;
    const count = Math.ceil(buffer.duration * rate);
    const energy = new Float32Array(count),
      bass = new Float32Array(count),
      percussion = new Float32Array(count);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const low = new Float32Array(channels.length);
    const alpha = 1 - Math.exp((-2 * Math.PI * 180) / buffer.sampleRate);
    let prior = 0;
    for (let block = 0; block < count; block++) {
      const start = Math.floor((block * buffer.sampleRate) / rate),
        end = Math.min(
          buffer.length,
          Math.floor(((block + 1) * buffer.sampleRate) / rate),
        );
      let sum = 0,
        lowSum = 0,
        highSum = 0;
      for (let c = 0; c < channels.length; c++) {
        const channel = channels[c];
        for (let i = start; i < end; i++) {
          const sample = channel[i];
          low[c] += alpha * (sample - low[c]);
          sum += sample * sample;
          lowSum += low[c] * low[c];
          highSum += (sample - low[c]) ** 2;
        }
      }
      const n = Math.max(1, (end - start) * channels.length);
      energy[block] = Math.sqrt(sum / n);
      bass[block] = Math.sqrt(lowSum / n);
      const high = Math.sqrt(highSum / n);
      percussion[block] = Math.max(0, high - prior * 0.92);
      prior = high;
      if (block % 600 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (const values of [energy, bass, percussion]) {
      let max = 0.000001;
      for (const v of values) max = Math.max(max, v);
      let smooth = 0;
      for (let i = 0; i < values.length; i++) {
        smooth = Math.max(values[i] / max, smooth * 0.83);
        values[i] = smooth;
      }
    }
    const beats: number[] = [];
    for (let i = 2; i < count - 2; i++) {
      if (
        percussion[i] > 0.25 &&
        percussion[i] > percussion[i - 1] &&
        percussion[i] >= percussion[i + 1] &&
        i / rate - (beats.at(-1) ?? -1) > 0.23
      )
        beats.push(i / rate);
    }
    const waveform = Array.from({ length: 144 }, (_, i) => {
      const start = Math.floor((i * count) / 144),
        end = Math.min(count, Math.ceil(((i + 1) * count) / 144));
      let peak = 0;
      for (let j = start; j < end; j++) peak = Math.max(peak, energy[j]);
      return Math.max(0.03, peak);
    });
    return {
      duration: buffer.duration,
      rate,
      energy,
      bass,
      percussion,
      beats,
      waveform,
    };
  } finally {
    await context.close();
  }
}

export function audioLevel(
  analysis: AudioAnalysis | null,
  time: number,
  kind: "bass" | "percussion" | "energy",
) {
  if (!analysis || time < 0 || time >= analysis.duration) return 0;
  const position = time * analysis.rate,
    i = Math.floor(position),
    mix = position - i;
  const values = analysis[kind];
  return (values[i] ?? 0) * (1 - mix) + (values[i + 1] ?? values[i] ?? 0) * mix;
}
