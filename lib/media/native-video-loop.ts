"use client";

import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryVisual,
} from "@/lib/media/composition";

type LoadedDrawable = {
  source: CanvasImageSource;
  dispose: () => void;
};

let cancelActiveEncode: (() => void) | null = null;

async function loadDrawable(blob: Blob): Promise<LoadedDrawable> {
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

function getMotionTransform(
  visual: StoryVisual,
  frame: number,
  frameCount: number,
) {
  if (visual.motionPreset === "none") {
    return { scale: 1, x: 0, y: 0 };
  }

  const strength = Math.max(0, Math.min(1, visual.motionStrength / 100));
  const phase = (frame / frameCount) * Math.PI * 2;
  const pulse = (1 - Math.cos(phase)) / 2;

  if (visual.motionPreset === "drift") {
    return {
      scale: 1 + 0.055 * strength,
      x: Math.sin(phase) * 20 * strength,
      y: Math.cos(phase) * 28 * strength,
    };
  }

  if (visual.motionPreset === "pulse") {
    return {
      scale: 1 + 0.045 * strength * ((1 - Math.cos(phase * 3)) / 2),
      x: 0,
      y: 0,
    };
  }

  return {
    scale: 1 + 0.06 * strength * pulse,
    x: Math.sin(phase) * 7 * strength * pulse,
    y: Math.sin(phase * 2) * 9 * strength * pulse,
  };
}

function drawTransformed(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  scale: number,
  x: number,
  y: number,
) {
  context.save();
  context.translate(STORY_WIDTH / 2 + x, STORY_HEIGHT / 2 + y);
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
  onProgress: (progress: number) => void,
) {
  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    Quality,
    canEncodeVideo,
  } = await import("mediabunny");
  const loopSeconds = visual.motionPreset === "none" ? 1 : visual.loopSeconds;
  const frameCount = loopSeconds * 60;
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
    visual.kind === "composite"
      ? [await loadDrawable(visual.frame)]
      : await Promise.all([
          loadDrawable(visual.background),
          loadDrawable(visual.foreground),
        ]);
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
  cancelActiveEncode = () => {
    cancelled = true;
    void output.cancel();
  };

  try {
    await output.start();

    for (let frame = 0; frame < frameCount; frame += 1) {
      if (cancelled) throw new DOMException("Export cancelled", "AbortError");

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#11100f";
      context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      const transform = getMotionTransform(visual, frame, frameCount);

      drawTransformed(
        context,
        loaded[0].source,
        transform.scale,
        transform.x,
        transform.y,
      );
      if (visual.kind === "layers") {
        context.drawImage(loaded[1].source, 0, 0, STORY_WIDTH, STORY_HEIGHT);
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
    if (cancelActiveEncode) cancelActiveEncode = null;
    for (const item of loaded) item.dispose();
    canvas.remove();
  }
}

export function cancelNativeVideoLoop() {
  cancelActiveEncode?.();
}
