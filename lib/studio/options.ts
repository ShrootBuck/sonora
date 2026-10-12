import type { MotionPreset } from "@/lib/media/composition";
import type {
  Mode,
  Photo,
  Project,
  Treatment,
  Variant,
} from "@/lib/studio/model";

/** Every choice in the studio carries a plain-language explanation. */
export type StudioOption<T extends string> = {
  value: T;
  label: string;
  /** Longer name for explanations when the button label is abbreviated. */
  title?: string;
  description: string;
};

export const MODES: StudioOption<Mode>[] = [
  {
    value: "post",
    label: "Post",
    description:
      "One feed image. Use a collage layout to fit several photos in it.",
  },
  {
    value: "carousel",
    label: "Carousel",
    description: "Slides people swipe through, exported as numbered images.",
  },
  {
    value: "story",
    label: "Story",
    description: "A full-screen 9:16 video with motion, timed to your music.",
  },
];

export const VARIANTS: StudioOption<Variant>[] = [
  {
    value: "main",
    label: "Composition",
    description: "Your main post, carousel, or story.",
  },
  {
    value: "teaser",
    label: "Story teaser",
    description: "A matching 9:16 story that points people to your post.",
  },
  {
    value: "cover",
    label: "Cover",
    description:
      "A single matching still in your post shape, for a first slide or grid cover.",
  },
];

export const CAROUSEL_MODES: StudioOption<"individual" | "connected">[] = [
  {
    value: "individual",
    label: "Individual slides",
    description: "Every slide is its own frame, using the layout below.",
  },
  {
    value: "connected",
    label: "Connected strip",
    description:
      "One long canvas cut into slides. Photos can cross into the next slide, so the swipe feels seamless.",
  },
];

export const TREATMENTS: StudioOption<Treatment>[] = [
  {
    value: "clean",
    label: "Full bleed",
    description:
      "Photos run edge to edge with no borders. Every photo switches to Fill so there are no gaps.",
  },
  {
    value: "border",
    label: "Paper",
    description: "Photos sit on a cream paper mat with even borders.",
  },
  {
    value: "film",
    label: "Film",
    description:
      "A dark darkroom mat with print borders and numbered captions.",
  },
  {
    value: "color",
    label: "Color",
    description:
      "A colored mat pulled from your selected photo. Fine-tune it with Background.",
  },
];

/** The mat colors that Paper restores when it is chosen. */
export const PAPER_COLORS = { background: "#f2eee6", ink: "#262c25" };

export const TYPEFACES: (StudioOption<Project["typeface"]> & {
  font: string;
})[] = [
  {
    value: "sans",
    label: "Modern",
    font: "Arial",
    description: "Clean and bold, like a poster.",
  },
  {
    value: "serif",
    label: "Editorial",
    font: "Georgia",
    description: "A classic serif, like a magazine headline.",
  },
  {
    value: "mono",
    label: "Typewriter",
    font: "monospace",
    description: "Evenly spaced letters, like a typed caption.",
  },
];

export const FRAMINGS: StudioOption<Photo["fit"]>[] = [
  {
    value: "fit",
    label: "Fit",
    title: "Fit, whole photo",
    description:
      "Shows the entire photo. Nothing gets cropped, and spare space shows the background.",
  },
  {
    value: "fill",
    label: "Fill",
    title: "Fill, crop",
    description:
      "Covers the whole slot. Some edges get cropped, so drag to choose what stays in.",
  },
];

export const PLACEMENTS: StudioOption<"upper" | "center" | "lower">[] = [
  {
    value: "upper",
    label: "Upper",
    description: "Pushes the photo to the top of its slot.",
  },
  {
    value: "center",
    label: "Center",
    description: "Centers the photo in its slot.",
  },
  {
    value: "lower",
    label: "Lower",
    description: "Pushes the photo to the bottom of its slot.",
  },
];

export const SPANS: StudioOption<"1" | "2" | "3">[] = [
  {
    value: "1",
    label: "1 slide",
    description: "The photo fits on a single slide.",
  },
  {
    value: "2",
    label: "2 slides",
    description:
      "The photo stretches across two slides and unrolls as people swipe.",
  },
  {
    value: "3",
    label: "3 slides",
    description: "The photo stretches across three slides. Made for panoramas.",
  },
];

export const TRANSITIONS: StudioOption<Project["transition"]>[] = [
  {
    value: "cut",
    label: "Cut",
    description: "Jumps straight to the next photos. Punchy on the beat.",
  },
  {
    value: "fade",
    label: "Dissolve",
    description: "The next photos fade in over the last ones.",
  },
  {
    value: "slide",
    label: "Slide",
    description: "The next photos push the last ones off to the left.",
  },
];

export const MOTIONS: StudioOption<MotionPreset>[] = [
  { value: "none", label: "Still", description: "No camera movement." },
  {
    value: "zoomin",
    label: "Zoom in",
    description: "Slowly pushes in closer over the whole story.",
  },
  {
    value: "zoomout",
    label: "Zoom out",
    description: "Starts close and slowly pulls back over the whole story.",
  },
  {
    value: "breathe",
    label: "Breathe",
    description: "A gentle push in and out on a loop, like slow breathing.",
  },
  {
    value: "drift",
    label: "Drift",
    description: "Floats around the frame in a loop with a slight tilt.",
  },
  {
    value: "pulse",
    label: "Pulse",
    description: "Quick little bumps of zoom, like a heartbeat.",
  },
  {
    value: "sway",
    label: "Sway",
    description: "Rocks gently side to side, like a handheld camera.",
  },
];

export const REACTIONS: StudioOption<Project["reaction"]>[] = [
  {
    value: "bass",
    label: "Bass",
    description: "Follows the low end: kicks, 808s, and bass lines.",
  },
  {
    value: "percussion",
    label: "Percussion",
    description: "Jumps on sharp hits like snares, claps, and hi-hats.",
  },
  {
    value: "energy",
    label: "Energy",
    description: "Follows the overall loudness of the song.",
  },
];

export const TEASER_FORMATS: StudioOption<"video" | "image">[] = [
  {
    value: "video",
    label: "Animated video",
    description: "A 9:16 MP4 with your motion and any music you added.",
  },
  {
    value: "image",
    label: "Still image",
    description: "A single 9:16 PNG.",
  },
];

export const BACKDROP_ANIMATIONS: StudioOption<"still" | "flow">[] = [
  {
    value: "still",
    label: "Still",
    description: "The backdrop stays frozen.",
  },
  {
    value: "flow",
    label: "Flow",
    description: "The backdrop moves in a seamless loop.",
  },
];

export const BACKDROP_PACES: StudioOption<"slow" | "normal" | "fast">[] = [
  { value: "slow", label: "Slow", description: "Loops every 8 seconds." },
  { value: "normal", label: "Normal", description: "Loops every 6 seconds." },
  { value: "fast", label: "Fast", description: "Loops every 4 seconds." },
];
