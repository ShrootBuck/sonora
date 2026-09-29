import {
  type BackdropColors,
  type BackdropSettings,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "@/lib/media/composition";

export const BACKDROP_STYLES = [
  {
    value: "melt",
    label: "Photo melt",
    description:
      "Your photo's own colors and textures, stretched into flowing liquid.",
  },
  {
    value: "glow",
    label: "Glow",
    description: "Soft clouds of color, slowly drifting.",
  },
  {
    value: "liquid",
    label: "Liquid",
    description: "Flowing ribbons of color. A little liquid light show.",
  },
  {
    value: "swirl",
    label: "Swirl",
    description: "A twisting, psychedelic vortex. Turn it up.",
  },
  {
    value: "grain",
    label: "Haze",
    description: "Smoky gradients with a tactile film texture.",
  },
  {
    value: "solid",
    label: "Solid",
    description: "One quiet color. Let the photo do the talking.",
  },
  {
    value: "photo",
    label: "Photo blur",
    description: "The classic: a softened copy of your photo.",
  },
] as const;

export function extractPhotoField(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, 32, 32);
  return Array.from(context.getImageData(0, 0, 32, 32).data);
}

export const BACKDROP_PALETTES: {
  value: string;
  label: string;
  colors: BackdropColors;
}[] = [
  { value: "acid", label: "Acid", colors: ["#4011a6", "#ff5ba8", "#dfff70"] },
  {
    value: "aurora",
    label: "Aurora",
    colors: ["#11143d", "#9575ef", "#60ead3"],
  },
  { value: "ember", label: "Ember", colors: ["#29162c", "#eb6045", "#ffca78"] },
  { value: "ocean", label: "Ocean", colors: ["#09283f", "#258cba", "#99e4dc"] },
  { value: "dusk", label: "Dusk", colors: ["#2a2144", "#bc7a9c", "#f1c4ac"] },
];

function rgb(hex: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

function hex(channels: number[]) {
  return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

/** Small local sample; favor distinct, saturated accents over many similar grays. */
export function extractPhotoColors(image: HTMLImageElement): BackdropColors {
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 80;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return ["#102739", "#3888ac", "#eeae75"];
  context.drawImage(image, 0, 0, 80, 80);
  const pixels = context.getImageData(0, 0, 80, 80).data;
  const bins = new Map<string, { sum: number[]; count: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const channels = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = channels.map((value) => value >> 5).join(",");
    const bin = bins.get(key) ?? { sum: [0, 0, 0], count: 0 };
    bin.count++;
    channels.forEach((value, index) => {
      bin.sum[index] += value;
    });
    bins.set(key, bin);
  }
  const candidates = [...bins.values()]
    .map(({ sum, count }) => {
      const color = sum.map((value) => value / count);
      const saturation = (Math.max(...color) - Math.min(...color)) / 255;
      return { color, score: Math.sqrt(count) * (0.3 + saturation) };
    })
    .sort((a, b) => b.score - a.score);
  const main = candidates[0]?.color ?? [56, 136, 172];
  const accent =
    candidates.find(
      ({ color }) =>
        Math.max(...color) > 150 &&
        color.reduce(
          (distance, value, i) => distance + (value - main[i]) ** 2,
          0,
        ) > 12000,
    )?.color ?? main.map((value) => value * 0.6 + 102);
  return [hex(main.map((value) => value * 0.23)), hex(main), hex(accent)];
}

export function resolveBackdrop(
  settings: BackdropSettings,
  photoColors: BackdropColors,
): BackdropSettings {
  const colors =
    settings.palette === "photo"
      ? photoColors
      : (BACKDROP_PALETTES.find((palette) => palette.value === settings.palette)
          ?.colors ?? settings.colors);
  return { ...settings, colors };
}

function paletteColor(colors: BackdropColors, position: number) {
  const wrapped = ((position % 3) + 3) % 3;
  const index = Math.floor(wrapped);
  const blend = wrapped - index;
  const a = rgb(colors[index]);
  const b = rgb(colors[(index + 1) % 3]);
  return hex(a.map((value, channel) => value + (b[channel] - value) * blend));
}

let grainTile: HTMLCanvasElement | null = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 192;
  const context = tile.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(192, 192);
  let state = 89123;
  for (let i = 0; i < pixels.data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = state >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  grainTile = tile;
  return tile;
}

/** Artwork shared by Konva, native H.264, and the FFmpeg fallback.
 * All time-dependent terms are periodic, so the last frame flows into the first.
 * Coordinates are always the full 1080 x 1920 composition, including thumbnails.
 */
export function drawBackdrop(
  context: CanvasRenderingContext2D,
  settings: BackdropSettings,
  progress: number,
) {
  const w = STORY_WIDTH;
  const h = STORY_HEIGHT;
  const { colors } = settings;
  const phase = settings.animated
    ? (((progress % 1) + 1) % 1) * Math.PI * 2
    : 0;
  const strength = settings.intensity / 100;
  const detail = settings.detail / 100;
  const seed = settings.seed * 2.399963;
  context.save();
  context.beginPath();
  context.rect(0, 0, w, h);
  context.clip();
  context.fillStyle = colors[0];
  context.fillRect(0, 0, w, h);

  if (
    settings.style === "glow" ||
    settings.style === "grain" ||
    settings.style === "melt"
  ) {
    const base = context.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, colors[0]);
    base.addColorStop(0.55, colors[1]);
    base.addColorStop(1, colors[0]);
    context.fillStyle = base;
    context.fillRect(0, 0, w, h);
    const count = 4 + Math.round(detail * 6);
    for (let i = 0; i < count; i++) {
      const offset = seed + i * 2.4;
      const x =
        w *
        (0.5 +
          0.45 * Math.sin(offset) +
          0.24 * strength * Math.cos(phase + offset));
      const y =
        h * ((i + 0.5) / count + 0.12 * strength * Math.sin(phase + offset));
      const radius = w * (0.65 + 0.22 * Math.sin(offset + phase));
      const color = colors[1 + (i % 2)];
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `${color}e0`);
      gradient.addColorStop(0.45, `${color}80`);
      gradient.addColorStop(1, `${color}00`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, h);
    }
  } else if (settings.style === "liquid") {
    const bands = 7 + Math.round(detail * 15);
    const bandWidth = w / bands;
    const displacement = w * (0.1 + strength * 0.24);
    const edge = (band: number, y: number) => {
      const v = y / h;
      return (
        band * bandWidth +
        displacement *
          (Math.sin(v * 7 + phase + seed) +
            0.48 * Math.sin(v * 13 - phase + band * 0.3 + seed) +
            0.22 * Math.cos(v * 21 + phase * 2 + band * 0.18))
      );
    };
    for (let band = -12; band < bands + 12; band++) {
      const gradient = context.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, paletteColor(colors, band * 0.39 + seed));
      gradient.addColorStop(
        0.5,
        paletteColor(colors, band * 0.39 + seed + 0.7),
      );
      gradient.addColorStop(1, paletteColor(colors, band * 0.39 + seed + 1.3));
      context.fillStyle = gradient;
      context.beginPath();
      for (let step = 0; step <= 96; step++) {
        const y = (step / 96) * h;
        const x = edge(band, y);
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      for (let step = 96; step >= 0; step--) {
        const y = (step / 96) * h;
        context.lineTo(edge(band + 1, y) + 1, y);
      }
      context.closePath();
      context.fill();
    }
  } else if (settings.style === "swirl") {
    const bands = 10 + Math.round(detail * 18);
    const cx =
      w * (0.5 + 0.24 * Math.sin(seed) + 0.12 * strength * Math.sin(phase));
    const cy =
      h * (0.28 + 0.08 * Math.cos(seed) + 0.08 * strength * Math.cos(phase));
    const radius = Math.hypot(w, h) * 1.4;
    const angle = (band: number, r: number) =>
      (band / bands) * Math.PI * 2 +
      phase +
      seed +
      (r / w) * (2 + strength * 4) +
      strength * 0.4 * Math.sin(r / 170 - phase * 2 + seed);
    for (let band = 0; band < bands; band++) {
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, paletteColor(colors, (band * 3) / bands));
      gradient.addColorStop(
        0.45,
        paletteColor(colors, (band * 3) / bands + 0.6),
      );
      gradient.addColorStop(1, paletteColor(colors, (band * 3) / bands + 1.2));
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(cx, cy);
      for (let step = 1; step <= 120; step++) {
        const r = (step / 120) * radius;
        const a = angle(band, r);
        context.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      for (let step = 120; step >= 0; step--) {
        const r = (step / 120) * radius;
        const a = angle(band + 1, r) + 0.002;
        context.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      context.closePath();
      context.fill();
    }
  }

  if (settings.grain > 0) {
    const tile = getGrainTile();
    const pattern = tile && context.createPattern(tile, "repeat");
    if (pattern) {
      context.globalAlpha = (settings.grain / 100) * 0.38;
      context.globalCompositeOperation = "soft-light";
      context.fillStyle = pattern;
      context.fillRect(0, 0, w, h);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    }
  }
  if (settings.dim > 0) {
    context.fillStyle = `rgba(0,0,0,${settings.dim / 100})`;
    context.fillRect(0, 0, w, h);
  }
  context.restore();
}
