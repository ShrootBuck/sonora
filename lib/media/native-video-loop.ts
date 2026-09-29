"use client";

import {
  type BackdropPainter,
  createBackdropPainter,
} from "@/lib/media/backdrop-painter";
import {
  getMotionTransform,
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryVisual,
} from "@/lib/media/composition";

export type LoadedDrawable = {
  source: CanvasImageSource;
  dispose: () => void;
};

let cancelActiveEncode: (() => void) | null = null;
let cancelEpoch = 0;

export async function loadDrawable(blob: Blob): Promise<LoadedDrawable> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      dispose: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  return {
    source: image,
    dispose: () => URL.revokeObjectURL(url),
  };
}

function drawTransformed(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  scale: number,
  x: number,
  y: number,
  rotation: number,
) {
  context.save();
  context.translate(STORY_WIDTH / 2 + x, STORY_HEIGHT / 2 + y);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.drawImage(
    source,
    -STORY_WIDTH / 2,
    -STORY_HEIGHT / 2,
    STORY_WIDTH,
    STORY_HEIGHT,
  );
  context.restore();
}

export async function encodeNativeVideoLoop(
  visual: StoryVisual,
  renderSeconds: number,
  onProgress: (progress: number) => void,
) {
  const encodeEpoch = cancelEpoch;
  const throwIfCancelled = () => {
    if (encodeEpoch !== cancelEpoch) {
      throw new DOMException("Export cancelled", "AbortError");
    }
  };
  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    Quality,
    canEncodeVideo,
  } = await import("mediabunny");
  throwIfCancelled();
  const frameCount = Math.max(1, Math.ceil(renderSeconds * 60));
  const quality = new Quality({
    quantizer: 14,
    bitrate: 20_000_000,
    bitrateMode: "variable",
  });
  const supported = await canEncodeVideo("avc", {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    quality,
    fullCodecString: "avc1.64002a",
    hardwareAcceleration: "no-preference",
    latencyMode: "quality",
  });
  throwIfCancelled();

  if (!supported) {
    throw new Error("This browser does not expose a native H.264 encoder.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser could not create a video canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const loaded =
    visual.kind === "backdrop"
      ? [await loadDrawable(visual.foreground)]
      : visual.kind === "composite"
        ? [await loadDrawable(visual.frame)]
        : await Promise.all([
            loadDrawable(visual.background),
            loadDrawable(visual.foreground),
          ]);
  if (encodeEpoch !== cancelEpoch) {
    for (const item of loaded) item.dispose();
    canvas.remove();
    throw new DOMException("Export cancelled", "AbortError");
  }
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: "avc",
    quality,
    fullCodecString: "avc1.64002a",
    hardwareAcceleration: "no-preference",
    latencyMode: "quality",
    keyFrameInterval: 2,
    alpha: "discard",
    contentHint: "detail",
  });
  output.addVideoTrack(source, { frameRate: 60 });

  let cancelled = false;
  const cancelEncode = () => {
    cancelled = true;
    void output.cancel();
  };
  cancelActiveEncode = cancelEncode;

  let painter: BackdropPainter | null = null;
  try {
    if (visual.kind === "backdrop")
      painter = await createBackdropPainter(visual.backdrop);
    throwIfCancelled();
    await output.start();

    for (let frame = 0; frame < frameCount; frame += 1) {
      if (cancelled || encodeEpoch !== cancelEpoch) {
        throw new DOMException("Export cancelled", "AbortError");
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#11100f";
      context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      if (visual.kind === "backdrop") {
        painter?.draw(context, visual.backdrop, frame / frameCount);
        context.drawImage(loaded[0].source, 0, 0, STORY_WIDTH, STORY_HEIGHT);
      } else {
        const transform = getMotionTransform(
          visual.motionPreset,
          visual.motionStrength,
          frame,
          frameCount,
        );

        drawTransformed(
          context,
          loaded[0].source,
          transform.scale,
          transform.x,
          transform.y,
          transform.rotation,
        );
        if (visual.kind === "layers") {
          context.drawImage(loaded[1].source, 0, 0, STORY_WIDTH, STORY_HEIGHT);
        }
      }

      await source.add(frame / 60, 1 / 60, {
        keyFrame: frame % 120 === 0,
      });
      onProgress((frame + 1) / frameCount);
    }

    await output.finalize();
    if (!target.buffer) {
      throw new Error("The native encoder returned an empty video.");
    }
    return new Uint8Array(target.buffer);
  } catch (error) {
    if (output.state !== "canceled" && output.state !== "finalized") {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    if (cancelActiveEncode === cancelEncode) cancelActiveEncode = null;
    painter?.dispose();
    for (const item of loaded) item.dispose();
    canvas.remove();
  }
}

export function cancelNativeVideoLoop() {
  cancelEpoch += 1;
  cancelActiveEncode?.();
}
