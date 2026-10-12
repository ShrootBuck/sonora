import Konva from "konva";
import { resolveBackdrop } from "@/lib/media/backdrop";
import {
  type BackdropPainter,
  createBackdropPainter,
} from "@/lib/media/backdrop-painter";
import { getMotionTransform, motionLoopSeconds } from "@/lib/media/composition";
import { type AudioAnalysis, audioLevel } from "./audio";
import {
  capacity,
  clamp,
  dimensions,
  imageRect,
  layoutRects,
  type Photo,
  type Project,
  pageCount,
  type Rect,
  sceneAt,
  sceneCount,
  timelineCuts,
  type Variant,
} from "./model";
import { TYPEFACES } from "./options";

type Options = {
  project: Project;
  photos: Photo[];
  variant?: Variant;
  duration: number;
  analysis?: AudioAnalysis | null;
  audioStart?: number;
  width?: number;
  onSelect?: (id: string) => void;
  onMove?: (id: string, patch: Partial<Photo>) => void;
};
type Moving = {
  node: Konva.Node;
  base: Rect;
  kind: "photo" | "background";
  photo?: Photo;
  slot?: Rect;
  reveal: number;
  entersAt?: number;
  sceneDuration?: number;
};

/** One Konva scene graph drives the editor, image downloads, and every video frame. */
export async function createStudioRenderer(
  container: HTMLDivElement,
  options: Options,
) {
  const {
    project,
    photos,
    duration,
    analysis = null,
    audioStart = 0,
    variant = "main",
  } = options;
  const { width, height } = dimensions(project, variant);
  const displayWidth = options.width ?? width;
  const stage = new Konva.Stage({
    container,
    width: displayWidth,
    height: (displayWidth * height) / width,
  });
  stage.scale({ x: displayWidth / width, y: displayWidth / width });
  const layer = new Konva.Layer();
  // Exact logical pixels in exports, independent of the display's device pixel ratio.
  layer.getCanvas().setPixelRatio(1);
  stage.add(layer);
  let painter: BackdropPainter | null = null;
  try {
    if (project.atmospheric && project.backdrop.style !== "photo")
      painter = await createBackdropPainter({
        ...project.backdrop,
        photoField: photos[0]?.field,
      });
  } catch (error) {
    stage.destroy();
    throw error;
  }
  let disposed = false,
    key = "",
    time = 0,
    level = 0;
  let active: Konva.Group | null = null,
    upcoming: Konva.Group | null = null;
  let moving: Moving[] = [];
  let reactiveOverlays: Konva.Rect[] = [];
  const sceneTotal = sceneCount(project, photos);
  const connected =
    project.mode === "carousel" && project.connected && variant === "main";
  const animated = project.mode === "story" || variant === "teaser";
  const totalPages = pageCount(project, photos);
  const layout = variant === "main" ? project.layout : project[variant].layout;
  const typeface =
    TYPEFACES.find((t) => t.value === project.typeface)?.font ?? "Arial";

  function background(group: Konva.Group, photo: Photo | undefined, w = width) {
    group.add(
      new Konva.Rect({
        width: w,
        height,
        fill: project.treatment === "film" ? "#171916" : project.background,
        listening: false,
      }),
    );
    if (!project.atmospheric || !photo) return;
    if (project.backdrop.style === "photo") {
      const scale =
        Math.max(
          w / photo.image.naturalWidth,
          height / photo.image.naturalHeight,
        ) * 1.15;
      const rect = {
        x: (w - photo.image.naturalWidth * scale) / 2,
        y: (height - photo.image.naturalHeight * scale) / 2,
        width: photo.image.naturalWidth * scale,
        height: photo.image.naturalHeight * scale,
      };
      const node = new Konva.Image({
        image: photo.image,
        ...rect,
        listening: false,
        filters: [Konva.Filters.Blur],
        blurRadius: 32,
      });
      node.cache({ pixelRatio: 1 });
      group.add(node);
      moving.push({ node, base: rect, kind: "background", reveal: -1 });
      group.add(
        new Konva.Rect({
          width: w,
          height,
          fill: "black",
          opacity: (project.backdrop.dim / 100) * 0.8,
          listening: false,
        }),
      );
      const response = new Konva.Rect({
        width: w,
        height,
        fill: photo.colors[2],
        listening: false,
        opacity: 0,
      });
      group.add(response);
      reactiveOverlays.push(response);
    } else {
      const settings = {
        ...resolveBackdrop(project.backdrop, photo.colors),
        photoField: photo.field,
      };
      group.add(
        new Konva.Shape({
          listening: false,
          sceneFunc(ctx) {
            const native = ctx._context;
            native.save();
            native.scale(w / 1080, height / 1920);
            painter?.draw(
              native,
              {
                ...settings,
                intensity: Math.min(100, settings.intensity + level * 30),
                dim: Math.max(0, settings.dim - level * 20),
              },
              time / motionLoopSeconds(settings.speed),
            );
            if (level > 0) {
              native.fillStyle = settings.colors[2];
              native.globalAlpha = level * 0.17;
              native.fillRect(0, 0, 1080, 1920);
            }
            native.restore();
          },
        }),
      );
    }
  }

  function addPhoto(
    parent: Konva.Group,
    photo: Photo,
    slot: Rect,
    index: number,
  ) {
    const rotated = (slot.rotation ?? 0) + photo.rotation;
    const group = new Konva.Group({
      x: slot.x + slot.width / 2,
      y: slot.y + slot.height / 2,
      offsetX: slot.width / 2,
      offsetY: slot.height / 2,
      rotation: rotated,
    });
    parent.add(group);
    const print = layout === "prints" || project.treatment === "film";
    if (print)
      group.add(
        new Konva.Rect({
          x: -14,
          y: -14,
          width: slot.width + 28,
          height: slot.height + 46,
          fill: project.treatment === "film" ? "#262722" : "#faf7ef",
          shadowColor: "#000000",
          shadowBlur: 20,
          shadowOpacity: 0.16,
          shadowOffsetY: 8,
        }),
      );
    const clipping = new Konva.Group({
      clipX: 0,
      clipY: 0,
      clipWidth: slot.width,
      clipHeight: slot.height,
    });
    group.add(clipping);
    const rect = imageRect(
      photo.image.naturalWidth,
      photo.image.naturalHeight,
      slot,
      photo,
    );
    const node = new Konva.Image({
      image: photo.image,
      ...rect,
      draggable: Boolean(options.onMove),
    });
    const camera = new Konva.Group();
    clipping.add(camera);
    camera.add(node);
    node.on("click tap dragstart", () => options.onSelect?.(photo.id));
    node.on("dragmove", () => {
      node.x(
        clamp(
          node.x(),
          Math.min(0, slot.width - rect.width),
          Math.max(0, slot.width - rect.width),
        ),
      );
      node.y(
        clamp(
          node.y(),
          Math.min(0, slot.height - rect.height),
          Math.max(0, slot.height - rect.height),
        ),
      );
    });
    node.on("dragend", () =>
      options.onMove?.(photo.id, {
        x: clamp(
          (node.x() - (slot.width - rect.width) / 2) /
            (Math.abs(slot.width - rect.width) / 2 || 1),
          -1,
          1,
        ),
        y: clamp(
          (node.y() - (slot.height - rect.height) / 2) /
            (Math.abs(slot.height - rect.height) / 2 || 1),
          -1,
          1,
        ),
      }),
    );
    moving.push({
      node: camera,
      base: { x: 0, y: 0, width: slot.width, height: slot.height },
      kind: "photo",
      photo,
      slot,
      reveal: -1,
    });
    if (project.reveal && animated)
      moving.push({
        node: group,
        base: {
          x: group.x(),
          y: group.y(),
          width: slot.width,
          height: slot.height,
        },
        kind: "photo",
        reveal: index,
      });
    if (project.treatment === "film")
      group.add(
        new Konva.Text({
          x: 0,
          y: slot.height + 8,
          text: `SONORA  /  ${String(photos.indexOf(photo) + 1).padStart(2, "0")}`,
          fontFamily: "monospace",
          fontSize: 13,
          fill: "#f2eee6",
          listening: false,
        }),
      );
  }

  function typography(group: Konva.Group, w = width) {
    if (!project.title && !project.subtitle) return;
    const titleY =
      variant === "main" ? project.titleY : project[variant].titleY;
    const textWidth =
      connected && project.titleAcross
        ? Math.min(w - 96, width * 1.65)
        : width - 120;
    const x = connected && project.titleAcross ? width - textWidth / 2 : 60;
    const color = project.treatment === "film" ? "#f2eee6" : project.ink;
    const title = new Konva.Text({
      x,
      y: height * titleY,
      width: textWidth,
      text: project.title,
      fontFamily: typeface,
      fontSize: project.titleSize,
      fontStyle: "bold",
      fill: color,
      align: "center",
      lineHeight: 1.08,
      listening: false,
    });
    group.add(title);
    const subtitle = new Konva.Text({
      x,
      y: height * titleY + (project.title ? title.height() + 14 : 0),
      width: textWidth,
      text: project.subtitle,
      fontFamily: typeface,
      fontSize: Math.max(20, project.titleSize * 0.35),
      fill: color,
      align: "center",
      lineHeight: 1.2,
      listening: false,
    });
    group.add(subtitle);
    const totalTextHeight =
      (project.title ? title.height() + 14 : 0) +
      (project.subtitle ? subtitle.height() : 0);
    const textTop = clamp(
      height * titleY,
      24,
      Math.max(24, height - totalTextHeight - 24),
    );
    title.y(textTop);
    subtitle.y(textTop + (project.title ? title.height() + 14 : 0));
  }

  function buildScene(index: number) {
    const group = new Konva.Group();
    layer.add(group);
    const count = capacity(layout);
    const start = variant === "main" ? index * count : 0;
    background(group, photos[start] ?? photos[0]);
    const gap = project.treatment === "clean" ? 0 : project.gap;
    const titleRoom = Boolean(project.title || project.subtitle);
    const availableHeight = titleRoom ? height * 0.77 : height;
    const variantScale = variant === "main" ? 1 : project[variant].scale;
    const content = new Konva.Group({
      x: (width * (1 - variantScale)) / 2,
      y: (availableHeight * (1 - variantScale)) / 2,
      scaleX: variantScale,
      scaleY: variantScale,
    });
    group.add(content);
    const rects = layoutRects(layout, width, availableHeight, gap);
    const movingStart = moving.length;
    rects.forEach((rect, slot) => {
      const photo = photos[start + slot];
      if (photo) addPhoto(content, photo, rect, slot);
    });
    const cuts = timelineCuts(project, sceneTotal);
    const startsAt = variant === "main" ? (cuts[index] ?? 0) * duration : 0;
    const endsAt =
      variant === "main" ? (cuts[index + 1] ?? 1) * duration : duration;
    const overlap =
      index > 0 && variant === "main" && project.transition !== "cut"
        ? Math.min(
            project.transitionSeconds,
            ((cuts[index] - cuts[index - 1]) * duration) / 2,
          )
        : 0;
    for (let i = movingStart; i < moving.length; i++) {
      moving[i].entersAt = startsAt - overlap;
      moving[i].sceneDuration = endsAt - startsAt + overlap;
    }
    typography(group);
    return group;
  }

  function buildStrip(page: number) {
    const group = new Konva.Group({ x: -page * width });
    layer.add(group);
    background(group, photos[0], totalPages * width);
    let x = 0;
    photos.forEach((photo, i) => {
      const w = photo.span * width;
      if (x + w + width > page * width && x - width < (page + 1) * width) {
        const gap = project.treatment === "clean" ? 0 : project.gap;
        addPhoto(
          group,
          photo,
          {
            x: x + gap + photo.shift * width,
            y: gap,
            width: w - gap * 2,
            height:
              (project.title || project.subtitle ? height * 0.77 : height) -
              gap * 2,
          },
          i,
        );
      }
      x += w;
    });
    if (project.titleAcross) typography(group, totalPages * width);
    else
      for (
        let i = Math.max(0, Math.floor(page));
        i <= Math.min(totalPages - 1, Math.ceil(page));
        i++
      ) {
        const text = new Konva.Group({ x: i * width });
        group.add(text);
        typography(text);
      }
    return group;
  }

  function draw(seconds: number, page = 0) {
    if (disposed) return;
    time = seconds;
    level =
      (audioLevel(analysis, audioStart + time, project.reaction) *
        project.reactive) /
      100;
    const sequencing = project.mode === "story" && variant === "main";
    const scene = sequencing
      ? sceneAt(project, sceneTotal, time, duration)
      : { scene: page, start: 0, end: duration, mix: 0 };
    const nextKey = connected
      ? `strip-${Math.floor(page)}-${Math.ceil(page)}`
      : `${scene.scene}-${scene.mix > 0}`;
    if (key !== nextKey) {
      key = nextKey;
      layer.destroyChildren();
      moving = [];
      reactiveOverlays = [];
      active = connected ? buildStrip(page) : buildScene(scene.scene);
      upcoming = scene.mix > 0 ? buildScene(scene.scene + 1) : null;
    }
    if (connected) active?.x(-page * width);
    for (const overlay of reactiveOverlays) overlay.opacity(level * 0.17);
    if (upcoming) {
      upcoming.opacity(project.transition === "fade" ? scene.mix : 1);
      upcoming.x(project.transition === "slide" ? width * (1 - scene.mix) : 0);
      active?.x(project.transition === "slide" ? -width * scene.mix : 0);
    }
    for (const item of moving) {
      if (item.node.isDragging()) continue;
      if (item.reveal >= 0) {
        const step = Math.min(
          0.32,
          (item.sceneDuration ?? duration) / (capacity(layout) + 1),
        );
        const appearance = clamp(
          (time - (item.entersAt ?? 0) + step - item.reveal * step) /
            Math.max(0.01, step),
          0,
          1,
        );
        item.node.opacity(appearance);
        item.node.y(item.base.y + (1 - appearance) * 38);
        continue;
      }
      if (
        !animated ||
        project.motion === "none" ||
        (item.kind === "photo" && item.photo?.fit !== "fill")
      )
        continue;
      const continuous =
        project.motion === "zoomin" || project.motion === "zoomout";
      const frameCount = Math.max(
        2,
        Math.ceil(
          (continuous ? duration : motionLoopSeconds(project.backdrop.speed)) *
            60,
        ),
      );
      const frame = Math.floor(time * 60) % frameCount;
      const motion = getMotionTransform(
        project.motion,
        project.motionStrength,
        frame,
        frameCount,
      );
      const { node, base } = item;
      const mx = (motion.x * base.width) / 1080;
      const my = (motion.y * base.height) / 1920;
      const c = Math.cos(motion.rotation),
        s = Math.sin(motion.rotation);
      const cover = Math.max(
        Math.abs(c) +
          (base.height / base.width) * Math.abs(s) +
          (2 * Math.abs(c * mx + s * my)) / base.width,
        Math.abs(c) +
          (base.width / base.height) * Math.abs(s) +
          (2 * Math.abs(s * mx - c * my)) / base.height,
      );
      const scale = Math.max(motion.scale, 1 + Math.max(0, cover - 1) * 1.03);
      node.offset({ x: base.width / 2, y: base.height / 2 });
      node.position({
        x: base.x + base.width / 2 + mx,
        y: base.y + base.height / 2 + my,
      });
      node.scale({ x: scale, y: scale });
      node.rotation((motion.rotation * 180) / Math.PI);
    }
    layer.draw();
  }
  return {
    draw,
    width,
    height,
    canvas: () => layer.getNativeCanvasElement(),
    resize(nextWidth: number) {
      stage.size({ width: nextWidth, height: (nextWidth * height) / width });
      stage.scale({ x: nextWidth / width, y: nextWidth / width });
      layer.draw();
    },
    dispose() {
      disposed = true;
      painter?.dispose();
      stage.destroy();
    },
  };
}
export type StudioRenderer = Awaited<ReturnType<typeof createStudioRenderer>>;
