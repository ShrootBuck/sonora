"use client";

import type { StoryVisual } from "@/lib/media/composition";
import {
  cancelNativeVideoLoop,
  encodeNativeVideoLoop,
} from "@/lib/media/native-video-loop";

type FFmpegClass = import("@ffmpeg/ffmpeg").FFmpeg;

type ExportOptions = {
  visual: StoryVisual;
  audio: File;
  start: number;
  end: number;
  onStatus: (status: string) => void;
  onProgress: (progress: number) => void;
};

let ffmpeg: FFmpegClass | null = null;
let loadPromise: Promise<FFmpegClass> | null = null;
let progressListener: ((event: { progress: number }) => void) | null = null;
let loadingInstance: FFmpegClass | null = null;
let cancelEpoch = 0;

function sameOriginUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

async function createAndLoadFFmpeg(
  threaded: boolean,
  onStatus: (status: string) => void,
) {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const instance = new FFmpeg();
  loadingInstance = instance;
  const base = threaded ? "/ffmpeg/mt" : "/ffmpeg/st";

  onStatus(
    threaded
      ? "Loading the multithreaded encoder…"
      : "Loading the compatibility encoder…",
  );

  try {
    await instance.load({
      coreURL: sameOriginUrl(`${base}/ffmpeg-core.js`),
      wasmURL: sameOriginUrl(`${base}/ffmpeg-core.wasm`),
      ...(threaded
        ? { workerURL: sameOriginUrl(`${base}/ffmpeg-core.worker.js`) }
        : {}),
    });
    return instance;
  } catch (error) {
    instance.terminate();
    throw error;
  } finally {
    if (loadingInstance === instance) loadingInstance = null;
  }
}

async function getFFmpeg(onStatus: (status: string) => void) {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const canThread =
      window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";

    if (canThread) {
      try {
        return await createAndLoadFFmpeg(true, onStatus);
      } catch {
        onStatus("Multithreading is unavailable. Falling back safely…");
      }
    }

    return await createAndLoadFFmpeg(false, onStatus);
  })();

  try {
    ffmpeg = await loadPromise;
    return ffmpeg;
  } finally {
    loadPromise = null;
  }
}

function inputExtension(file: File) {
  const match = file.name.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? ".audio";
}

const VIDEO_ENCODER_ARGS = [
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-tune",
  "stillimage",
  "-crf",
  "14",
  "-profile:v",
  "high",
  "-level",
  "4.2",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "60",
  "-g",
  "120",
  "-keyint_min",
  "120",
  "-sc_threshold",
  "0",
  "-video_track_timescale",
  "60000",
  "-x264-params",
  "colorprim=bt709:transfer=bt709:colormatrix=bt709",
  "-color_range",
  "tv",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-movflags",
  "+faststart",
];

function zoompanFilter(
  preset: Exclude<StoryVisual["motionPreset"], "none">,
  strengthValue: number,
  frames: number,
) {
  const strength = Math.max(0, Math.min(1, strengthValue / 100));
  const phase = `(2*PI*on/${frames})`;

  if (preset === "drift") {
    const zoom = 1 + 0.055 * strength;
    return [
      `zoompan=z='${zoom.toFixed(5)}':`,
      `x='iw/2-(iw/zoom/2)+((iw-iw/zoom)/2)*0.68*sin${phase}':`,
      `y='ih/2-(ih/zoom/2)+((ih-ih/zoom)/2)*0.68*cos${phase}':`,
      `d=1:s=1080x1920:fps=60`,
    ].join("");
  }

  const zoomAmount = Math.max(0.001, 0.06 * strength);
  const cycles = preset === "pulse" ? 3 : 1;
  const zoomExpression =
    `1+${zoomAmount.toFixed(5)}*` + `(0.5-0.5*cos(${cycles}*${phase}))`;
  const driftScale = preset === "breathe" ? 0.16 : 0;

  return [
    `zoompan=z='${zoomExpression}':`,
    `x='iw/2-(iw/zoom/2)+((iw-iw/zoom)/2)*${driftScale}*sin${phase}':`,
    `y='ih/2-(ih/zoom/2)+((ih-ih/zoom)/2)*${driftScale}*sin(2*${phase})':`,
    `d=1:s=1080x1920:fps=60`,
  ].join("");
}

async function encodeVisualLoop(
  instance: FFmpegClass,
  visual: StoryVisual,
  names: {
    frame: string;
    background: string;
    foreground: string;
    loop: string;
  },
) {
  if (visual.kind === "composite") {
    await instance.writeFile(
      names.frame,
      new Uint8Array(await visual.frame.arrayBuffer()),
    );

    if (visual.motionPreset !== "none") {
      const frames = visual.loopSeconds * 60;
      const filter = `[0:v]${zoompanFilter(
        visual.motionPreset,
        visual.motionStrength,
        frames,
      )}[v]`;
      return await instance.exec([
        "-loop",
        "1",
        "-framerate",
        "60",
        "-i",
        names.frame,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-t",
        visual.loopSeconds.toString(),
        ...VIDEO_ENCODER_ARGS,
        names.loop,
      ]);
    }

    return await instance.exec([
      "-loop",
      "1",
      "-framerate",
      "60",
      "-i",
      names.frame,
      "-t",
      "1",
      ...VIDEO_ENCODER_ARGS,
      names.loop,
    ]);
  }

  await Promise.all([
    instance.writeFile(
      names.background,
      new Uint8Array(await visual.background.arrayBuffer()),
    ),
    instance.writeFile(
      names.foreground,
      new Uint8Array(await visual.foreground.arrayBuffer()),
    ),
  ]);

  // The blurred layer is already rendered. FFmpeg only moves that bitmap and
  // overlays the sharp photo, which is much cheaper than blurring every frame.
  const frames = visual.loopSeconds * 60;
  const motionFilter = [
    `[0:v]${zoompanFilter(
      visual.motionPreset,
      visual.motionStrength,
      frames,
    )}[bg];`,
    "[1:v]format=rgba[fg];",
    "[bg][fg]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]",
  ].join("");

  return await instance.exec([
    "-loop",
    "1",
    "-framerate",
    "60",
    "-i",
    names.background,
    "-loop",
    "1",
    "-framerate",
    "60",
    "-i",
    names.foreground,
    "-filter_complex",
    motionFilter,
    "-map",
    "[v]",
    "-t",
    visual.loopSeconds.toString(),
    ...VIDEO_ENCODER_ARGS,
    names.loop,
  ]);
}

export async function exportSonoraVideo({
  visual,
  audio,
  start,
  end,
  onStatus,
  onProgress,
}: ExportOptions) {
  const exportEpoch = cancelEpoch;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const names = {
    frame: `sonora-frame-${nonce}.png`,
    background: `sonora-background-${nonce}.png`,
    foreground: `sonora-foreground-${nonce}.png`,
    audio: `sonora-audio-${nonce}${inputExtension(audio)}`,
    loop: `sonora-loop-${nonce}.mp4`,
    output: `sonora-${nonce}.mp4`,
  };
  const duration = end - start;
  let progressStart = 0;
  let progressShare = 0.7;
  let instance: FFmpegClass | null = null;
  let nativeLoop: Uint8Array | null = null;

  if (!(duration > 0)) {
    throw new Error("Choose an audio range longer than zero seconds.");
  }

  try {
    onStatus(
      "Encoding the 60 FPS loop with your browser’s native H.264 encoder…",
    );
    try {
      nativeLoop = await encodeNativeVideoLoop(visual, (progress) =>
        onProgress(progress * 0.7),
      );
    } catch (error) {
      if (exportEpoch !== cancelEpoch) throw error;
      onProgress(0);
      onStatus(
        "Native H.264 is unavailable. Using the slower FFmpeg compatibility encoder…",
      );
    }

    if (exportEpoch !== cancelEpoch) {
      throw new DOMException("Export cancelled", "AbortError");
    }

    instance = await getFFmpeg(onStatus);
    progressListener = ({ progress }) => {
      if (!Number.isFinite(progress)) return;
      const normalized = Math.max(0, Math.min(1, progress));
      onProgress(
        Math.max(0, Math.min(1, progressStart + normalized * progressShare)),
      );
    };
    instance.on("progress", progressListener);

    onStatus("Preparing local media…");
    await instance.writeFile(
      names.audio,
      new Uint8Array(await audio.arrayBuffer()),
    );

    if (nativeLoop) {
      await instance.writeFile(names.loop, nativeLoop);
    } else {
      onStatus(
        visual.motionPreset === "none"
          ? "Encoding one reusable second at 60 FPS…"
          : "Encoding one seamless 60 FPS effect loop…",
      );
      const loopExitCode = await encodeVisualLoop(instance, visual, names);
      if (loopExitCode !== 0) {
        throw new Error(`FFmpeg stopped with exit code ${loopExitCode}.`);
      }
    }

    progressStart = 0.7;
    progressShare = 0.3;
    onProgress(0.7);
    onStatus("Looping the compressed video and adding audio…");
    const outputExitCode = await instance.exec([
      "-fflags",
      "+genpts",
      "-stream_loop",
      "-1",
      "-i",
      names.loop,
      "-i",
      names.audio,
      "-filter_complex",
      `[1:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a]`,
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-t",
      duration.toFixed(3),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "320k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      names.output,
    ]);
    if (outputExitCode !== 0) {
      throw new Error(`FFmpeg stopped with exit code ${outputExitCode}.`);
    }

    onStatus("Finalizing your MP4…");
    const data = await instance.readFile(names.output);
    if (typeof data === "string") {
      throw new Error("FFmpeg returned an unexpected text output.");
    }
    const bytes = new Uint8Array(data).slice();
    return new Blob([bytes.buffer], { type: "video/mp4" });
  } finally {
    if (progressListener && instance) {
      instance.off("progress", progressListener);
      progressListener = null;
    }
    if (instance) {
      const cleanupInstance = instance;
      await Promise.allSettled(
        Object.values(names).map((name) => cleanupInstance.deleteFile(name)),
      );
    }
  }
}

export function cancelSonoraExport() {
  cancelEpoch += 1;
  cancelNativeVideoLoop();
  loadingInstance?.terminate();
  loadingInstance = null;
  ffmpeg?.terminate();
  ffmpeg = null;
  loadPromise = null;
  progressListener = null;
}
