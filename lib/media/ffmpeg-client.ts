"use client";

import {
  type BackdropPainter,
  createBackdropPainter,
} from "@/lib/media/backdrop-painter";
import {
  motionRenderSeconds,
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryVisual,
} from "@/lib/media/composition";
import {
  cancelNativeVideoLoop,
  encodeNativeVideoLoop,
  loadDrawable,
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
let loadingInstance: FFmpegClass | null = null;
let cancelEpoch = 0;

function sameOriginUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

async function createAndLoadFFmpeg(
  threaded: boolean,
  onStatus: (status: string) => void,
  exportEpoch: number,
) {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  if (exportEpoch !== cancelEpoch) {
    throw new DOMException("Export cancelled", "AbortError");
  }
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

async function getFFmpeg(
  onStatus: (status: string) => void,
  exportEpoch: number,
) {
  const ensureCurrentExport = () => {
    if (exportEpoch !== cancelEpoch) {
      throw new DOMException("Export cancelled", "AbortError");
    }
  };

  ensureCurrentExport();
  if (ffmpeg) return ffmpeg;
  if (loadPromise) {
    const instance = await loadPromise;
    ensureCurrentExport();
    return instance;
  }

  const currentLoadPromise = (async () => {
    const canThread =
      window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";

    if (canThread) {
      try {
        const instance = await createAndLoadFFmpeg(true, onStatus, exportEpoch);
        if (exportEpoch !== cancelEpoch) {
          instance.terminate();
          throw new DOMException("Export cancelled", "AbortError");
        }
        return instance;
      } catch (error) {
        if (exportEpoch !== cancelEpoch) throw error;
        onStatus("Multithreading is unavailable. Falling back safely…");
      }
    }

    const instance = await createAndLoadFFmpeg(false, onStatus, exportEpoch);
    if (exportEpoch !== cancelEpoch) {
      instance.terminate();
      throw new DOMException("Export cancelled", "AbortError");
    }
    return instance;
  })();
  loadPromise = currentLoadPromise;

  try {
    ffmpeg = await currentLoadPromise;
    ensureCurrentExport();
    return ffmpeg;
  } finally {
    if (loadPromise === currentLoadPromise) loadPromise = null;
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
  // Bound WASM thread memory for both camera filters and procedural frames.
  "-threads",
  "2",
  "-filter_complex_threads",
  "1",
  "-preset",
  "veryfast",
  "-tune",
  "stillimage",
  "-crf",
  "14",
  // Keep DTS equal to PTS so the final stream-copy trim cannot include
  // reordered frames beyond the exact audio endpoint. CRF stays unchanged.
  "-bf",
  "0",
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
  const outputPhase = `(2*PI*on/${frames})`;
  const inputPhase = `(2*PI*n/${frames})`;
  const centerX = "iw/2-(iw/zoom/2)";
  const centerY = "ih/2-(ih/zoom/2)";
  let zoom = "1";
  let x = centerX;
  let y = centerY;
  let rotation = "0";
  const transformCoverZoom = (angle: string, xMotion = "0", yMotion = "0") => {
    const horizontalCover = `(abs(cos(${angle}))+${(
      STORY_HEIGHT / STORY_WIDTH
    ).toFixed(
      8,
    )}*abs(sin(${angle}))+${(2 / STORY_WIDTH).toFixed(8)}*abs(cos(${angle})*(${xMotion})+sin(${angle})*(${yMotion})))`;
    const verticalCover = `(abs(cos(${angle}))+${(
      STORY_WIDTH / STORY_HEIGHT
    ).toFixed(
      8,
    )}*abs(sin(${angle}))+${(2 / STORY_HEIGHT).toFixed(8)}*abs(sin(${angle})*(${xMotion})-cos(${angle})*(${yMotion})))`;
    return `1+max(0,max(${horizontalCover},${verticalCover})-1)*1.03`;
  };

  if (preset === "zoomin" || preset === "zoomout") {
    const amount = (0.28 * strength).toFixed(6);
    const progress =
      preset === "zoomin" ? `(on/${frames - 1})` : `(1-on/${frames - 1})`;
    zoom = `1+${amount}*${progress}`;
    x = `${centerX}-((iw-iw/zoom)/2)*0.32*${progress}/zoom`;
    y = `${centerY}+((ih-ih/zoom)/2)*0.20*${progress}/zoom`;
  } else if (preset === "breathe") {
    const wave = `sin(${outputPhase}-PI/2)`;
    const breath = `(sgn(${wave})*pow(abs(${wave}),1.45)+1)/2`;
    zoom = `1+${(0.085 * strength).toFixed(6)}*${breath}`;
    x = `${centerX}-((iw-iw/zoom)/2)*0.28*sin${outputPhase}/zoom`;
    y = `${centerY}+((ih-ih/zoom)/2)*0.22*${breath}/zoom`;
  } else if (preset === "drift") {
    const baseZoom = 1 + 0.11 * strength;
    const angle = `${(0.5 * strength * (Math.PI / 180)).toFixed(8)}*sin${outputPhase}`;
    const xMotion = `${((1 - 1 / baseZoom) * (STORY_WIDTH / 2) * 0.82).toFixed(
      6,
    )}*sin${outputPhase}`;
    const yMotion = `${((1 - 1 / baseZoom) * (STORY_HEIGHT / 2) * 0.58).toFixed(
      6,
    )}*sin(2*${outputPhase}+PI/2)`;
    const transformCover = transformCoverZoom(angle, xMotion, yMotion);
    zoom = `max(${baseZoom.toFixed(6)},${transformCover})`;
    x = `${centerX}-${xMotion}/zoom`;
    y = `${centerY}-${yMotion}/zoom`;
    rotation = `${(0.5 * strength * (Math.PI / 180)).toFixed(8)}*sin${inputPhase}`;
  } else if (preset === "pulse") {
    const outputThump = `pow(max(0,0.5-0.5*cos(3*${outputPhase})),0.72)`;
    const inputThump = `pow(max(0,0.5-0.5*cos(3*${inputPhase})),0.72)`;
    const angle = `${(0.22 * strength * (Math.PI / 180)).toFixed(8)}*sin(3*${outputPhase})*${outputThump}`;
    const transformCover = transformCoverZoom(angle);
    zoom = `max(1+${(0.065 * strength).toFixed(6)}*${outputThump},${transformCover})`;
    rotation = `${(0.22 * strength * (Math.PI / 180)).toFixed(8)}*sin(3*${inputPhase})*${inputThump}`;
  } else if (preset === "sway") {
    const outputAngle = `${(2.2 * strength * (Math.PI / 180)).toFixed(8)}*sin${outputPhase}`;
    const xMotion = `${(STORY_WIDTH * 0.006 * strength).toFixed(5)}*sin${outputPhase}`;
    zoom = transformCoverZoom(outputAngle, xMotion);
    x = `${centerX}-${xMotion}/zoom`;
    rotation = `${(2.2 * strength * (Math.PI / 180)).toFixed(8)}*sin${inputPhase}`;
  }

  const rotate =
    rotation === "0"
      ? ""
      : `rotate=a='${rotation}':ow=iw:oh=ih:fillcolor=0x11100f,`;

  return [
    rotate,
    `zoompan=z='${zoom}':`,
    `x='${x}':`,
    `y='${y}':`,
    `d=1:s=${STORY_WIDTH}x${STORY_HEIGHT}:fps=60`,
  ].join("");
}

/** Bound PNG memory to half a second, regardless of the effect duration.
 * Each chunk keeps the full-resolution, lossless artwork until H.264 encoding.
 */
async function encodeBackdropLoop(
  instance: FFmpegClass,
  visual: Extract<StoryVisual, { kind: "backdrop" }>,
  outputName: string,
  renderSeconds: number,
  exportEpoch: number,
  onProgress: (progress: number) => void,
  onStatus: (status: string) => void,
) {
  const ensureCurrent = () => {
    if (exportEpoch !== cancelEpoch)
      throw new DOMException("Export cancelled", "AbortError");
  };
  const foreground = await loadDrawable(visual.foreground);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const files = new Set<string>();
  const chunks: string[] = [];
  const frameCount = Math.ceil(renderSeconds * 60);
  const chunkSize = 30;
  let painter: BackdropPainter | null = null;
  try {
    painter = await createBackdropPainter(visual.backdrop);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw new Error("The browser could not create a video canvas.");
    for (let start = 0; start < frameCount; start += chunkSize) {
      ensureCurrent();
      const count = Math.min(chunkSize, frameCount - start);
      const frames: string[] = [];
      onStatus(
        `Drawing backdrop frames ${start + 1}–${start + count} of ${frameCount}…`,
      );
      for (let offset = 0; offset < count; offset++) {
        ensureCurrent();
        painter.draw(context, visual.backdrop, (start + offset) / frameCount);
        context.drawImage(foreground.source, 0, 0, STORY_WIDTH, STORY_HEIGHT);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Could not render backdrop frame.")),
            "image/png",
          ),
        );
        ensureCurrent();
        const name = `${outputName}-frame-${offset.toString().padStart(3, "0")}.png`;
        files.add(name);
        frames.push(name);
        await instance.writeFile(
          name,
          new Uint8Array(await blob.arrayBuffer()),
        );
        onProgress((start + (offset + 1) * 0.35) / frameCount);
      }
      const chunk = `${outputName}-chunk-${chunks.length}.mp4`;
      files.add(chunk);
      onStatus(
        `Encoding backdrop frames ${start + 1}–${start + count} of ${frameCount}…`,
      );
      const code = await instance.exec([
        "-threads",
        "1",
        "-framerate",
        "60",
        "-i",
        `${outputName}-frame-%03d.png`,
        "-frames:v",
        count.toString(),
        ...VIDEO_ENCODER_ARGS,
        chunk,
      ]);
      ensureCurrent();
      if (code !== 0)
        throw new Error(`Backdrop encoding stopped with exit code ${code}.`);
      chunks.push(chunk);
      await Promise.all(
        frames.map(async (name) => {
          await instance.deleteFile(name);
          files.delete(name);
        }),
      );
      onProgress((start + count) / frameCount);
    }
    const manifest = `${outputName}-concat.txt`;
    files.add(manifest);
    await instance.writeFile(
      manifest,
      new TextEncoder().encode(
        chunks.map((name) => `file '${name}'`).join("\n"),
      ),
    );
    ensureCurrent();
    return await instance.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      manifest,
      "-c:v",
      "copy",
      "-an",
      "-movflags",
      "+faststart",
      outputName,
    ]);
  } finally {
    painter?.dispose();
    foreground.dispose();
    canvas.width = canvas.height = 0;
    await Promise.allSettled(
      [...files].map((name) => instance.deleteFile(name)),
    );
  }
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
  renderSeconds: number,
  exportEpoch: number,
  onProgress: (progress: number) => void,
  onStatus: (status: string) => void,
) {
  if (visual.kind === "backdrop") {
    return encodeBackdropLoop(
      instance,
      visual,
      names.loop,
      renderSeconds,
      exportEpoch,
      onProgress,
      onStatus,
    );
  }
  if (visual.kind === "composite") {
    await instance.writeFile(
      names.frame,
      new Uint8Array(await visual.frame.arrayBuffer()),
    );

    if (visual.motionPreset !== "none") {
      const frames = Math.max(2, Math.ceil(renderSeconds * 60));
      const filter = `[0:v]${zoompanFilter(
        visual.motionPreset,
        visual.motionStrength,
        frames,
      )}[v]`;
      return await instance.exec([
        "-threads",
        "1",
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
        renderSeconds.toString(),
        ...VIDEO_ENCODER_ARGS,
        names.loop,
      ]);
    }

    return await instance.exec([
      "-threads",
      "1",
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
  const frames = Math.max(2, Math.ceil(renderSeconds * 60));
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
    "-threads",
    "1",
    "-loop",
    "1",
    "-framerate",
    "60",
    "-i",
    names.background,
    "-threads",
    "1",
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
    renderSeconds.toString(),
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
  let progressListener: ((event: { progress: number }) => void) | null = null;

  if (!(duration > 0)) {
    throw new Error("Choose an audio range longer than zero seconds.");
  }
  const renderSeconds = motionRenderSeconds(visual, duration);

  try {
    onStatus(
      "Rendering 60 FPS motion with your browser’s native H.264 encoder…",
    );
    try {
      nativeLoop = await encodeNativeVideoLoop(
        visual,
        renderSeconds,
        (progress) => onProgress(progress * 0.7),
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

    instance = await getFFmpeg(onStatus, exportEpoch);
    progressListener = ({ progress }) => {
      if (progressShare === 0 || !Number.isFinite(progress)) return;
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
      if (visual.kind === "backdrop") progressShare = 0;
      onStatus(
        visual.kind === "backdrop"
          ? "Rendering your backdrop at 60 FPS…"
          : visual.motionPreset === "none"
            ? "Encoding one reusable second at 60 FPS…"
            : "Encoding the 60 FPS camera effect…",
      );
      const loopExitCode = await encodeVisualLoop(
        instance,
        visual,
        names,
        renderSeconds,
        exportEpoch,
        (progress) => onProgress(progress * 0.7),
        onStatus,
      );
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
}
