export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type CompositionMode = "fill" | "fit";
export type MotionPreset =
  | "none"
  | "zoomin"
  | "zoomout"
  | "breathe"
  | "drift"
  | "pulse"
  | "sway";
export type MotionSpeed = "slow" | "normal" | "fast";

export type MotionTransform = {
  scale: number;
  x: number;
  y: number;
  /** Radians, clockwise. */
  rotation: number;
};

/** Presets that render across the full audio range instead of a short loop. */
export const FULL_DURATION_PRESETS: ReadonlySet<MotionPreset> = new Set([
  "zoomin",
  "zoomout",
] as MotionPreset[]);

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

export function motionRenderSeconds(
  visual: StoryVisual,
  durationSeconds: number,
) {
  if (visual.motionPreset === "none") return 1;
  if (FULL_DURATION_PRESETS.has(visual.motionPreset)) {
    return durationSeconds;
  }
  return visual.loopSeconds;
}

export function getMotionTransform(
  preset: MotionPreset,
  strengthValue: number,
  frame: number,
  frameCount: number,
): MotionTransform {
  if (preset === "none" || frameCount <= 0) {
    return { scale: 1, x: 0, y: 0, rotation: 0 };
  }

  const strength = Math.max(0, Math.min(1, strengthValue / 100));
  const progress = Math.max(
    0,
    Math.min(1, frame / Math.max(1, frameCount - 1)),
  );
  const phase = (frame / frameCount) * Math.PI * 2;
  let scale = 1;
  let x = 0;
  let y = 0;
  let rotation = 0;

  if (preset === "zoomin" || preset === "zoomout") {
    const zoomProgress = preset === "zoomin" ? progress : 1 - progress;
    scale = 1 + 0.28 * strength * zoomProgress;
    const horizontalRoom = (1 - 1 / scale) * (STORY_WIDTH / 2);
    const verticalRoom = (1 - 1 / scale) * (STORY_HEIGHT / 2);
    x = horizontalRoom * 0.32 * zoomProgress;
    y = -verticalRoom * 0.2 * zoomProgress;
  } else if (preset === "breathe") {
    const wave = Math.sin(phase - Math.PI / 2);
    const shapedWave = Math.sign(wave) * Math.abs(wave) ** 1.45;
    const breath = (shapedWave + 1) / 2;
    scale = 1 + 0.085 * strength * breath;
    const horizontalRoom = (1 - 1 / scale) * (STORY_WIDTH / 2);
    const verticalRoom = (1 - 1 / scale) * (STORY_HEIGHT / 2);
    x = Math.sin(phase) * horizontalRoom * 0.28;
    y = -breath * verticalRoom * 0.22;
  } else if (preset === "drift") {
    scale = 1 + 0.11 * strength;
    const horizontalRoom = (1 - 1 / scale) * (STORY_WIDTH / 2);
    const verticalRoom = (1 - 1 / scale) * (STORY_HEIGHT / 2);
    x = Math.sin(phase) * horizontalRoom * 0.82;
    y = Math.sin(phase * 2 + Math.PI / 2) * verticalRoom * 0.58;
    rotation = Math.sin(phase) * 0.5 * strength * (Math.PI / 180);
  } else if (preset === "pulse") {
    const thump = Math.max(0, 0.5 - 0.5 * Math.cos(phase * 3)) ** 0.72;
    scale = 1 + 0.065 * strength * thump;
    rotation = Math.sin(phase * 3) * thump * 0.22 * strength * (Math.PI / 180);
  } else if (preset === "sway") {
    rotation = Math.sin(phase) * 2.2 * strength * (Math.PI / 180);
    x = Math.sin(phase) * STORY_WIDTH * 0.006 * strength;
  }

  // Find the exact scale needed to cover the frame after both rotation and
  // translation. Rotation-only guards can still leak a corner during Sway.
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const halfWidth = STORY_WIDTH / 2;
  const halfHeight = STORY_HEIGHT / 2;
  const horizontalCover =
    (Math.abs(cosine) * halfWidth +
      Math.abs(sine) * halfHeight +
      Math.abs(cosine * x + sine * y)) /
    halfWidth;
  const verticalCover =
    (Math.abs(sine) * halfWidth +
      Math.abs(cosine) * halfHeight +
      Math.abs(sine * x - cosine * y)) /
    halfHeight;
  const transformCoverScale = Math.max(horizontalCover, verticalCover);
  const safeCoverScale = 1 + Math.max(0, transformCoverScale - 1) * 1.03;
  scale = Math.max(scale, safeCoverScale);

  const maxX = (1 - 1 / scale) * (STORY_WIDTH / 2);
  const maxY = (1 - 1 / scale) * (STORY_HEIGHT / 2);

  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
    rotation,
  };
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
