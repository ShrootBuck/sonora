import {
  type BackdropSettings,
  DEFAULT_COMPOSITION,
  type MotionPreset,
} from "@/lib/media/composition";
import type { LoadedImage } from "@/lib/media/load-image";

export type Mode = "post" | "carousel" | "story";
export type Aspect = "portrait" | "tall" | "square" | "landscape" | "story";
export type Layout =
  | "single"
  | "diptych"
  | "triptych"
  | "contact"
  | "editorial"
  | "prints";
export type Treatment = "clean" | "border" | "film" | "color";
export type Variant = "main" | "teaser" | "cover";
export type Photo = LoadedImage & {
  id: string;
  name: string;
  colors: [string, string, string];
  field?: number[];
  fit: "fit" | "fill";
  scale: number;
  x: number;
  y: number;
  span: number;
  shift: number;
  rotation: number;
};
export type VariantSettings = { layout: Layout; scale: number; titleY: number };
export type Project = {
  mode: Mode;
  aspect: Aspect;
  layout: Layout;
  connected: boolean;
  treatment: Treatment;
  background: string;
  ink: string;
  gap: number;
  title: string;
  subtitle: string;
  typeface: "sans" | "serif" | "mono";
  titleSize: number;
  titleY: number;
  titleAcross: boolean;
  backdrop: BackdropSettings;
  atmospheric: boolean;
  motion: MotionPreset;
  motionStrength: number;
  transition: "cut" | "fade" | "slide";
  transitionSeconds: number;
  reveal: boolean;
  reactive: number;
  reaction: "bass" | "percussion" | "energy";
  duration: number;
  cuts: number[];
  teaser: VariantSettings;
  cover: VariantSettings;
};

export const INITIAL_PROJECT: Project = {
  mode: "carousel",
  aspect: "portrait",
  layout: "single",
  connected: false,
  treatment: "border",
  background: "#f2eee6",
  ink: "#262c25",
  gap: 48,
  title: "",
  subtitle: "",
  typeface: "sans",
  titleSize: 68,
  titleY: 0.85,
  titleAcross: false,
  backdrop: { ...DEFAULT_COMPOSITION.backdrop },
  atmospheric: false,
  motion: "none",
  motionStrength: 35,
  transition: "fade",
  transitionSeconds: 0.45,
  reveal: false,
  reactive: 0,
  reaction: "bass",
  duration: 12,
  cuts: [],
  teaser: { layout: "editorial", scale: 0.9, titleY: 0.82 },
  cover: { layout: "single", scale: 0.9, titleY: 0.82 },
};

export const LAYOUTS: { value: Layout; label: string; count: number }[] = [
  { value: "single", label: "Single", count: 1 },
  { value: "diptych", label: "Diptych", count: 2 },
  { value: "triptych", label: "Filmstrip", count: 3 },
  { value: "contact", label: "Contact sheet", count: 6 },
  { value: "editorial", label: "Editorial", count: 3 },
  { value: "prints", label: "Prints", count: 3 },
];
export const ASPECTS: { value: Aspect; label: string; height: number }[] = [
  { value: "portrait", label: "4:5", height: 1350 },
  { value: "tall", label: "3:4", height: 1440 },
  { value: "square", label: "1:1", height: 1080 },
  { value: "landscape", label: "16:9", height: 608 },
  { value: "story", label: "9:16", height: 1920 },
];
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const capacity = (layout: Layout) =>
  LAYOUTS.find((l) => l.value === layout)?.count ?? 1;
export function dimensions(project: Project, variant: Variant = "main") {
  const aspect =
    variant === "teaser" || (project.mode === "story" && variant === "main")
      ? "story"
      : project.aspect;
  return {
    width: 1080,
    height: ASPECTS.find((a) => a.value === aspect)?.height ?? 1350,
  };
}
export function sceneCount(project: Project, photos: Pick<Photo, "span">[]) {
  return Math.max(1, Math.ceil(photos.length / capacity(project.layout)));
}
export function pageCount(project: Project, photos: Pick<Photo, "span">[]) {
  if (project.mode !== "carousel") return 1;
  return project.connected
    ? Math.max(
        1,
        photos.reduce((sum, p) => sum + p.span, 0),
      )
    : sceneCount(project, photos);
}
/** Cut positions are normalized, so changing the audio selection preserves the edit. */
export function timelineCuts(project: Project, count: number): number[] {
  if (count <= 1) return [0, 1];
  if (
    project.cuts.length === count - 1 &&
    project.cuts.every(
      (v, i, a) => Number.isFinite(v) && v > (a[i - 1] ?? 0) && v < 1,
    )
  ) {
    return [0, ...project.cuts, 1];
  }
  return Array.from({ length: count + 1 }, (_, i) => i / count);
}
export function sceneAt(
  project: Project,
  count: number,
  time: number,
  duration: number,
) {
  const cuts = timelineCuts(project, count);
  const progress = clamp(time / Math.max(duration, 0.001), 0, 1);
  const index = Math.max(
    0,
    cuts.findIndex((end, i) => i > 0 && progress < end) - 1,
  );
  const scene = progress >= 1 ? count - 1 : index;
  const start = cuts[scene] * duration;
  const end = cuts[scene + 1] * duration;
  const transition = Math.min(project.transitionSeconds, (end - start) / 2);
  const mix =
    project.transition === "cut" || scene === count - 1 || transition <= 0
      ? 0
      : clamp((time - (end - transition)) / transition, 0, 1);
  return { scene, start, end, mix };
}
export function updateCut(
  project: Project,
  count: number,
  index: number,
  seconds: number,
  duration: number,
) {
  if (duration <= 0 || index <= 0 || index >= count) return project.cuts;
  const cuts = timelineCuts(project, count);
  // One output frame on each side keeps scenes ordered and individually visible.
  const margin = Math.min(1 / 60 / duration, 0.25 / count);
  cuts[index] = clamp(
    seconds / duration,
    cuts[index - 1] + margin,
    cuts[index + 1] - margin,
  );
  return cuts.slice(1, -1);
}
export function snapCutsToBeats(
  project: Project,
  count: number,
  beats: number[],
  start: number,
  duration: number,
) {
  if (duration <= 0) return project.cuts;
  const cuts = timelineCuts(project, count);
  const eligible = beats
    .map((b) => (b - start) / duration)
    .filter((b) => b > 0 && b < 1);
  for (let i = 1; i < count; i++) {
    const candidates = eligible.filter(
      (b) =>
        b > cuts[i - 1] + 1 / 60 / duration &&
        b < cuts[i + 1] - 1 / 60 / duration,
    );
    if (candidates.length)
      cuts[i] = candidates.reduce((a, b) =>
        Math.abs(a - cuts[i]) < Math.abs(b - cuts[i]) ? a : b,
      );
  }
  return cuts.slice(1, -1);
}
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};
export function layoutRects(
  layout: Layout,
  w: number,
  h: number,
  gap: number,
): Rect[] {
  const g = Math.min(gap, Math.min(w, h) / 8);
  const inner = { x: g, y: g, width: w - 2 * g, height: h - 2 * g };
  if (layout === "single") return [inner];
  if (layout === "diptych")
    return [0, 1].map((i) => ({
      x: g + (i * (w - g)) / 2,
      y: g,
      width: (w - 3 * g) / 2,
      height: h - 2 * g,
    }));
  if (layout === "triptych")
    return [0, 1, 2].map((i) => ({
      x: g,
      y: g + (i * (h - g)) / 3,
      width: w - 2 * g,
      height: (h - 4 * g) / 3,
    }));
  if (layout === "contact")
    return Array.from({ length: 6 }, (_, i) => ({
      x: g + ((i % 2) * (w - g)) / 2,
      y: g + (Math.floor(i / 2) * (h - g)) / 3,
      width: (w - 3 * g) / 2,
      height: (h - 4 * g) / 3,
    }));
  if (layout === "editorial")
    return [
      { x: g, y: g, width: w - 2 * g, height: h * 0.57 - g },
      {
        x: g,
        y: h * 0.57 + g,
        width: (w - 3 * g) / 2,
        height: h * 0.43 - 2 * g,
      },
      {
        x: (w + g) / 2,
        y: h * 0.57 + g,
        width: (w - 3 * g) / 2,
        height: h * 0.43 - 2 * g,
      },
    ];
  return [
    { x: w * 0.09, y: h * 0.1, width: w * 0.64, height: h * 0.4, rotation: -7 },
    { x: w * 0.32, y: h * 0.33, width: w * 0.6, height: h * 0.4, rotation: 8 },
    {
      x: w * 0.12,
      y: h * 0.57,
      width: w * 0.59,
      height: h * 0.34,
      rotation: -4,
    },
  ];
}
/** Fit always retains every edge; Fill always covers its slot without gaps. */
export function imageRect(
  iw: number,
  ih: number,
  slot: Rect,
  photo: Pick<Photo, "fit" | "scale" | "x" | "y">,
): Rect {
  const ratio =
    photo.fit === "fit"
      ? Math.min(slot.width / iw, slot.height / ih) * clamp(photo.scale, 0.3, 1)
      : Math.max(slot.width / iw, slot.height / ih) * clamp(photo.scale, 1, 3);
  const width = iw * ratio,
    height = ih * ratio;
  return {
    x:
      (slot.width - width) / 2 +
      (clamp(photo.x, -1, 1) * Math.abs(slot.width - width)) / 2,
    y:
      (slot.height - height) / 2 +
      (clamp(photo.y, -1, 1) * Math.abs(slot.height - height)) / 2,
    width,
    height,
  };
}
