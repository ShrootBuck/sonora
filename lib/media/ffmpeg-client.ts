"use client";

import { motionRenderSeconds, type StoryVisual } from "@/lib/media/composition";
import {
  cancelNativeVideoLoop,
  encodeNativeVideoLoop,
} from "@/lib/media/native-video-loop";

type FFmpeg = import("@ffmpeg/ffmpeg").FFmpeg;
let encoder: FFmpeg | null = null;
let busy = false;
let legacyController: AbortController | null = null;

export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

export type MuxOptions = {
  video: Uint8Array;
  audio?: File;
  start: number;
  duration: number;
  repeat?: boolean;
  signal?: AbortSignal;
  onStatus: (status: string) => void;
  onProgress: (progress: number) => void;
};

/** FFmpeg owns audio conversion and muxing. The visual stream is already encoded. */
export async function muxVideo({
  video,
  audio,
  start,
  duration,
  repeat = false,
  signal,
  onStatus,
  onProgress,
}: MuxOptions) {
  checkAbort(signal);
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error("Choose a valid, non-empty audio range.");
  if (busy)
    throw new Error("Another export is finishing. Try again in a moment.");
  busy = true;
  let instance: FFmpeg | null = null;
  const id = crypto.randomUUID();
  const names = {
    video: `${id}.mp4`,
    audio: `${id}${audio?.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? ".audio"}`,
    output: `${id}-final.mp4`,
  };
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 12) logs.shift();
  };
  const progress = ({ time }: { time: number }) =>
    onProgress(Math.min(0.99, Math.max(0, time / 1_000_000 / duration)));
  const abort = () => {
    instance?.terminate();
    if (encoder === instance) encoder = null;
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (!encoder) {
      onStatus("Preparing your video…");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      checkAbort(signal);
      instance = new FFmpeg();
      const threaded =
        window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
      const base = new URL(
        threaded ? "/ffmpeg/mt/" : "/ffmpeg/st/",
        window.location.origin,
      );
      await instance.load({
        coreURL: new URL("ffmpeg-core.js", base).href,
        wasmURL: new URL("ffmpeg-core.wasm", base).href,
        ...(threaded
          ? { workerURL: new URL("ffmpeg-core.worker.js", base).href }
          : {}),
      });
      checkAbort(signal);
      encoder = instance;
    } else instance = encoder;
    instance.on("log", onLog);
    instance.on("progress", progress);
    checkAbort(signal);
    await instance.writeFile(names.video, video);
    if (audio)
      await instance.writeFile(
        names.audio,
        new Uint8Array(await audio.arrayBuffer()),
      );
    checkAbort(signal);
    onStatus(audio ? "Adding your selected audio…" : "Finishing your video…");
    const args = [
      ...(repeat ? ["-stream_loop", "-1"] : []),
      "-i",
      names.video,
      ...(audio
        ? [
            "-i",
            names.audio,
            "-filter_complex",
            `[1:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS[a]`,
          ]
        : []),
      "-map",
      "0:v:0",
      ...(audio
        ? [
            "-map",
            "[a]",
            "-c:a",
            "aac",
            "-b:a",
            "320k",
            "-ar",
            "48000",
            "-ac",
            "2",
          ]
        : ["-an"]),
      "-c:v",
      "copy",
      "-t",
      duration.toString(),
      "-movflags",
      "+faststart",
      names.output,
    ];
    const code = await instance.exec(args);
    checkAbort(signal);
    if (code !== 0)
      throw new Error(
        `Video assembly failed (${code}). ${logs.slice(-4).join(" ")}`,
      );
    const data = await instance.readFile(names.output);
    checkAbort(signal);
    if (typeof data === "string")
      throw new Error("The encoder returned an invalid video.");
    onProgress(1);
    return new Blob([new Uint8Array(data).slice().buffer], {
      type: "video/mp4",
    });
  } catch (error) {
    // A failed load/exec must not poison the next export's worker.
    instance?.terminate();
    if (encoder === instance) encoder = null;
    checkAbort(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    instance?.off("log", onLog);
    instance?.off("progress", progress);
    if (instance?.loaded) {
      for (const name of Object.values(names))
        await instance.deleteFile(name).catch(() => undefined);
    }
    busy = false;
  }
}

export async function exportSonoraVideo({
  visual,
  audio,
  start,
  end,
  onStatus,
  onProgress,
}: {
  visual: StoryVisual;
  audio: File;
  start: number;
  end: number;
  onStatus: (value: string) => void;
  onProgress: (value: number) => void;
}) {
  const controller = new AbortController();
  legacyController = controller;
  const duration = end - start;
  if (!(duration > 0))
    throw new Error("Choose an audio range longer than zero seconds.");
  try {
    onStatus("Rendering your story at 60 FPS…");
    const renderSeconds = motionRenderSeconds(visual, duration);
    const video = await encodeNativeVideoLoop(visual, renderSeconds, (p) =>
      onProgress(p * 0.85),
    );
    checkAbort(controller.signal);
    return await muxVideo({
      video,
      audio,
      start,
      duration,
      repeat: renderSeconds < duration,
      signal: controller.signal,
      onStatus,
      onProgress: (p) => onProgress(0.85 + p * 0.15),
    });
  } finally {
    if (legacyController === controller) legacyController = null;
  }
}

export function cancelSonoraExport() {
  legacyController?.abort();
  cancelNativeVideoLoop();
}
