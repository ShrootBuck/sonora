import { checkAbort, muxVideo } from "@/lib/media/ffmpeg-client";
import type { AudioAnalysis } from "./audio";
import {
  dimensions,
  type Photo,
  type Project,
  pageCount,
  type Variant,
} from "./model";
import { createStudioRenderer, type StudioRenderer } from "./renderer";

export type ExportFile = { name: string; blob: Blob };
export type ExportRequest = {
  project: Project;
  photos: Photo[];
  variant: Variant;
  page: number;
  audio: File | null;
  analysis: AudioAnalysis | null;
  start: number;
  duration: number;
  signal: AbortSignal;
  onStatus: (value: string) => void;
  onProgress: (value: number) => void;
};
function imageBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed.")),
      "image/png",
    ),
  );
}
async function withRenderer<T>(
  request: ExportRequest,
  work: (renderer: StudioRenderer) => Promise<T>,
) {
  checkAbort(request.signal);
  await document.fonts.ready;
  const container = document.createElement("div");
  // Konva is kept off-screen; no editor guides ever enter this canvas.
  const renderer = await createStudioRenderer(container, {
    project: request.project,
    photos: request.photos,
    variant: request.variant,
    duration: request.duration,
    analysis: request.analysis,
    audioStart: request.start,
  });
  try {
    checkAbort(request.signal);
    return await work(renderer);
  } finally {
    renderer.dispose();
    container.remove();
  }
}
export async function exportImages(
  request: ExportRequest,
): Promise<ExportFile[]> {
  return withRenderer(request, async (renderer) => {
    const count =
      request.variant === "main"
        ? pageCount(request.project, request.photos)
        : 1;
    const results: ExportFile[] = [];
    for (let i = 0; i < count; i++) {
      checkAbort(request.signal);
      request.onStatus(`Rendering image ${i + 1} of ${count}…`);
      renderer.draw(0, request.project.mode === "post" ? request.page : i);
      const blob = await imageBlob(renderer.canvas());
      checkAbort(request.signal);
      results.push({
        name: `sonora-${request.variant === "main" ? "post" : request.variant}-${String(i + 1).padStart(2, "0")}.png`,
        blob,
      });
      request.onProgress((i + 1) / count);
    }
    return results;
  });
}
export async function exportVideo(request: ExportRequest): Promise<ExportFile> {
  if (!Number.isFinite(request.duration) || request.duration <= 0)
    throw new Error("Choose a duration longer than zero seconds.");
  const data = await withRenderer(request, async (renderer) => {
    const {
      BufferTarget,
      CanvasSource,
      Mp4OutputFormat,
      Output,
      Quality,
      canEncodeVideo,
    } = await import("mediabunny");
    checkAbort(request.signal);
    const quality = new Quality({
      quantizer: 14,
      bitrate: 20_000_000,
      bitrateMode: "variable",
    });
    const config = {
      width: renderer.width,
      height: renderer.height,
      quality,
      fullCodecString: "avc1.64002a",
      hardwareAcceleration: "no-preference" as const,
      latencyMode: "quality" as const,
    };
    if (!(await canEncodeVideo("avc", config)))
      throw new Error(
        "This browser cannot encode H.264 at this quality. Open Sonora in current Chrome or Safari and try again.",
      );
    checkAbort(request.signal);
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const source = new CanvasSource(renderer.canvas(), {
      codec: "avc",
      ...config,
      alpha: "discard",
      keyFrameInterval: 2,
      contentHint: "detail",
    });
    output.addVideoTrack(source, { frameRate: 60 });
    const cancel = () => {
      void output.cancel().catch(() => undefined);
    };
    request.signal.addEventListener("abort", cancel, { once: true });
    try {
      checkAbort(request.signal);
      await output.start();
      const frames = Math.ceil(request.duration * 60);
      request.onStatus("Rendering your story at 60 FPS…");
      for (let frame = 0; frame < frames; frame++) {
        checkAbort(request.signal);
        renderer.draw(frame / 60, request.page);
        await source.add(frame / 60, 1 / 60, { keyFrame: frame % 120 === 0 });
        if (frame % 6 === 0) request.onProgress((0.85 * (frame + 1)) / frames);
        if (frame % 30 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      source.close();
      await output.finalize();
      checkAbort(request.signal);
      if (!target.buffer)
        throw new Error("The browser returned an empty video.");
      return new Uint8Array(target.buffer);
    } catch (error) {
      if (output.state !== "canceled" && output.state !== "finalized")
        await output.cancel().catch(() => undefined);
      checkAbort(request.signal);
      throw error;
    } finally {
      request.signal.removeEventListener("abort", cancel);
    }
  });
  const blob = await muxVideo({
    video: data,
    audio: request.audio ?? undefined,
    start: request.start,
    duration: request.duration,
    signal: request.signal,
    onStatus: request.onStatus,
    onProgress: (p) => request.onProgress(0.85 + p * 0.15),
  });
  return { name: "sonora-story.mp4", blob };
}
export async function packageFiles(files: ExportFile[], signal: AbortSignal) {
  const { zip } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    checkAbort(signal);
    entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
  }
  return new Promise<Blob>((resolve, reject) => {
    checkAbort(signal);
    const terminate = zip(entries, { level: 0 }, (error, bytes) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else
        resolve(
          new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
        );
    });
    const abort = () => {
      terminate();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function exportMatchingSet(
  request: ExportRequest,
  animated: boolean,
) {
  const output: ExportFile[] = [];
  const main = { ...request.project, mode: "carousel" as const };
  output.push(
    ...(await exportImages({
      ...request,
      project: main,
      variant: "main",
      onProgress: (p) => request.onProgress(p * 0.25),
    })),
  );
  output.push(
    ...(await exportImages({
      ...request,
      project: main,
      variant: "cover",
      onProgress: (p) => request.onProgress(0.25 + p * 0.1),
    })),
  );
  const teaser = {
    ...request,
    project: { ...request.project, mode: "story" as const },
    variant: "teaser" as const,
    onProgress: (p: number) => request.onProgress(0.35 + p * 0.6),
  };
  if (animated) output.push(await exportVideo(teaser));
  else output.push(...(await exportImages(teaser)));
  const size = dimensions(main);
  output.push({
    name: "sonora-set.txt",
    blob: new Blob(
      [
        `Sonora posting set\n\nPost images: ${size.width} x ${size.height}, numbered in swipe order.\nCover: matching image, using your cover layout.\nStory: 1080 x 1920${animated ? ", 60 FPS H.264 video" : " PNG"}.\n\nInstagram overlays are approximate previews and are excluded from exports.\nCreated locally with sonora.party.\n`,
      ],
      { type: "text/plain" },
    ),
  });
  request.onStatus("Packing your matching set…");
  const blob = await packageFiles(output, request.signal);
  request.onProgress(1);
  return { name: "sonora-matching-set.zip", blob };
}
