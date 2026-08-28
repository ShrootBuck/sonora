export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type CompositionMode = "fill" | "fit";
export type MotionPreset = "none" | "breathe" | "drift" | "pulse";
export type MotionSpeed = "slow" | "normal" | "fast";

export type CompositionSettings = {
  mode: CompositionMode;
  zoom: number;
  panX: number;
  panY: number;
  blur: number;
  motionPreset: MotionPreset;
  motionStrength: number;
  motionSpeed: MotionSpeed;
  showGuides: boolean;
};

export type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoryVisual =
  | {
      kind: "composite";
      frame: Blob;
      motionPreset: MotionPreset;
      motionStrength: number;
      loopSeconds: number;
    }
  | {
      kind: "layers";
      background: Blob;
      foreground: Blob;
      motionPreset: Exclude<MotionPreset, "none">;
      motionStrength: number;
      loopSeconds: number;
    };

export const DEFAULT_COMPOSITION: CompositionSettings = {
  mode: "fill",
  zoom: 1,
  panX: 0,
  panY: 0,
  blur: 28,
  motionPreset: "breathe",
  motionStrength: 55,
  motionSpeed: "normal",
  showGuides: false,
};

export function motionLoopSeconds(speed: MotionSpeed) {
  if (speed === "slow") return 8;
  if (speed === "fast") return 4;
  return 6;
}

export function getImageRect(
  imageWidth: number,
  imageHeight: number,
  mode: CompositionMode,
  zoom: number,
  panX: number,
  panY: number,
): ImageRect {
  const baseScale =
    mode === "fill"
      ? Math.max(STORY_WIDTH / imageWidth, STORY_HEIGHT / imageHeight)
      : Math.min(STORY_WIDTH / imageWidth, STORY_HEIGHT / imageHeight);
  const scale = baseScale * zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (STORY_WIDTH - width) / 2 + panX,
    y: (STORY_HEIGHT - height) / 2 + panY,
    width,
    height,
  };
}

export function getBackgroundRect(
  imageWidth: number,
  imageHeight: number,
): ImageRect {
  const scale =
    Math.max(STORY_WIDTH / imageWidth, STORY_HEIGHT / imageHeight) * 1.08;
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (STORY_WIDTH - width) / 2,
    y: (STORY_HEIGHT - height) / 2,
    width,
    height,
  };
}

export function clampPan(
  imageWidth: number,
  imageHeight: number,
  mode: CompositionMode,
  zoom: number,
  panX: number,
  panY: number,
) {
  const rect = getImageRect(imageWidth, imageHeight, mode, zoom, 0, 0);

  if (mode === "fill") {
    const maxX = Math.max(0, (rect.width - STORY_WIDTH) / 2);
    const maxY = Math.max(0, (rect.height - STORY_HEIGHT) / 2);

    return {
      panX: Math.max(-maxX, Math.min(maxX, panX)),
      panY: Math.max(-maxY, Math.min(maxY, panY)),
    };
  }

  // Fit mode intentionally allows loose placement. Keep a small part of the
  // photo visible so it cannot disappear completely off-canvas.
  const visibleEdge = 72;
  const centeredX = (STORY_WIDTH - rect.width) / 2;
  const centeredY = (STORY_HEIGHT - rect.height) / 2;
  const minX = visibleEdge - rect.width - centeredX;
  const maxX = STORY_WIDTH - visibleEdge - centeredX;
  const minY = visibleEdge - rect.height - centeredY;
  const maxY = STORY_HEIGHT - visibleEdge - centeredY;

  return {
    panX: Math.max(minX, Math.min(maxX, panX)),
    panY: Math.max(minY, Math.min(maxY, panY)),
  };
}

export function resetForMode(
  current: CompositionSettings,
  mode: CompositionMode,
): CompositionSettings {
  return {
    ...current,
    mode,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}
