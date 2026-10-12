import type { ReactNode } from "react";
import type { MotionPreset } from "@/lib/media/composition";
import {
  type Layout,
  layoutRects,
  type Project,
  type Rect,
  type Treatment,
} from "@/lib/studio/model";
import { PAPER_COLORS, TYPEFACES } from "@/lib/studio/options";

/** Small, decorative diagrams for studio choices. They mirror the renderer's
 * geometry where it matters (layouts, framing) and are hidden from assistive
 * technology because every choice also has a written explanation. */

function sized(ratio: number, maxWidth: number, maxHeight: number) {
  return ratio > maxWidth / maxHeight
    ? { width: maxWidth, height: maxWidth / ratio }
    : { width: maxHeight * ratio, height: maxHeight };
}

function Art({
  viewBox,
  width,
  height,
  children,
}: {
  viewBox: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      className="studio-art"
      style={{ width, height }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PhotoGlyph({ x, y, width, height, rotation }: Rect) {
  const r = Math.min(width, height);
  const ground = `M${x} ${y + height}L${x + width * 0.36} ${y + height * 0.56}L${x + width * 0.56} ${y + height * 0.76}L${x + width * 0.76} ${y + height * 0.5}L${x + width} ${y + height}Z`;
  return (
    <g
      transform={
        rotation
          ? `rotate(${rotation} ${x + width / 2} ${y + height / 2})`
          : undefined
      }
    >
      <rect x={x} y={y} width={width} height={height} className="art-sky" />
      <circle
        cx={x + width * 0.3}
        cy={y + height * 0.32}
        r={r * 0.11}
        className="art-sun"
      />
      <path d={ground} className="art-land" />
    </g>
  );
}

function Frame({
  width,
  height,
  x = 0,
  fill,
}: {
  width: number;
  height: number;
  x?: number;
  fill?: string;
}) {
  return (
    <rect
      x={x}
      width={width}
      height={height}
      rx={Math.min(width, height) * 0.04}
      className="art-frame"
      style={fill ? { fill } : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function LayoutArt({
  layout,
  height,
}: {
  layout: Layout;
  height: number;
}) {
  const size = sized(1080 / height, 64, 52);
  const prints = layout === "prints";
  return (
    <Art viewBox={`0 0 1080 ${height}`} {...size}>
      <Frame width={1080} height={height} />
      {layoutRects(layout, 1080, height, 64).map((slot) => (
        <g key={`${slot.x}-${slot.y}`}>
          {prints ? (
            <rect
              x={slot.x - 26}
              y={slot.y - 26}
              width={slot.width + 52}
              height={slot.height + 84}
              className="art-print"
              transform={`rotate(${slot.rotation ?? 0} ${slot.x + slot.width / 2} ${slot.y + slot.height / 2})`}
            />
          ) : null}
          <PhotoGlyph {...slot} />
        </g>
      ))}
    </Art>
  );
}

export function AspectArt({ height }: { height: number }) {
  const size = sized(1080 / height, 40, 34);
  return (
    <Art viewBox={`0 0 1080 ${height}`} {...size}>
      <PhotoGlyph x={0} y={0} width={1080} height={height} />
      <Frame width={1080} height={height} fill="transparent" />
    </Art>
  );
}

export function TreatmentArt({
  treatment,
  color,
}: {
  treatment: Treatment;
  color: string;
}) {
  const inset = 100;
  const photo = {
    x: inset,
    y: inset,
    width: 1080 - inset * 2,
    height: 1350 - inset * 2 - (treatment === "film" ? 110 : 0),
  };
  return (
    <Art viewBox="0 0 1080 1350" width={36} height={45}>
      {treatment === "clean" ? (
        <PhotoGlyph x={0} y={0} width={1080} height={1350} />
      ) : (
        <>
          <Frame
            width={1080}
            height={1350}
            fill={
              treatment === "film"
                ? "#171916"
                : treatment === "color"
                  ? color
                  : PAPER_COLORS.background
            }
          />
          {treatment === "film" ? (
            <>
              <rect
                x={photo.x - 34}
                y={photo.y - 34}
                width={photo.width + 68}
                height={photo.height + 120}
                fill="#262722"
              />
              <rect
                x={photo.x}
                y={photo.y + photo.height + 34}
                width={360}
                height={30}
                fill="#f2eee6"
                opacity={0.8}
              />
            </>
          ) : null}
          <PhotoGlyph {...photo} />
        </>
      )}
      {treatment === "clean" ? (
        <Frame width={1080} height={1350} fill="transparent" />
      ) : null}
    </Art>
  );
}

const SLIDE = { width: 400, height: 500 };

export function CarouselArt({ connected }: { connected: boolean }) {
  if (!connected)
    return (
      <Art viewBox="0 0 1260 500" width={86} height={34}>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Frame x={i * 430} {...SLIDE} />
            <PhotoGlyph x={i * 430 + 50} y={50} width={300} height={400} />
          </g>
        ))}
      </Art>
    );
  return (
    <Art viewBox="0 0 1200 500" width={86} height={36}>
      <Frame width={1200} height={500} />
      <PhotoGlyph x={60} y={50} width={680} height={400} />
      <PhotoGlyph x={850} y={50} width={290} height={400} />
      {[400, 800].map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={0}
          y2={500}
          className="art-seam"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </Art>
  );
}

export function SpanArt({ span }: { span: number }) {
  return (
    <Art viewBox="0 0 1200 500" width={72} height={30}>
      <Frame width={1200} height={500} />
      <PhotoGlyph x={50} y={50} width={span * 400 - 100} height={400} />
      {[400, 800].map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={0}
          y2={500}
          className="art-seam"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </Art>
  );
}

export function FramingArt({ fit }: { fit: "fit" | "fill" }) {
  // A 3:2 photo in a 4:5 slot, matching imageRect at 100% size.
  const slot = { x: 0, y: 0, width: 800, height: 1000 };
  const photo =
    fit === "fit"
      ? { x: 0, y: (1000 - 533) / 2, width: 800, height: 533 }
      : { x: -350, y: 0, width: 1500, height: 1000 };
  return (
    <Art viewBox="-380 -30 1560 1060" width={70} height={48}>
      <Frame width={slot.width} height={slot.height} />
      {fit === "fill" ? (
        <g className="art-ghost">
          <PhotoGlyph {...photo} />
        </g>
      ) : null}
      <svg
        {...slot}
        viewBox={`0 0 ${slot.width} ${slot.height}`}
        aria-hidden="true"
      >
        <PhotoGlyph {...photo} />
      </svg>
      <rect
        {...slot}
        className="art-outline"
        vectorEffect="non-scaling-stroke"
      />
    </Art>
  );
}

export function TypeArt({ typeface }: { typeface: Project["typeface"] }) {
  return (
    <span
      className="studio-art-type"
      style={{ fontFamily: TYPEFACES.find((t) => t.value === typeface)?.font }}
      aria-hidden="true"
    >
      Aa
    </span>
  );
}

export function TransitionArt({
  transition,
}: {
  transition: Project["transition"];
}) {
  return (
    <span
      className="studio-art-clip"
      data-transition={transition}
      aria-hidden="true"
    >
      <span className="art-scene art-scene-a" />
      <span className="art-scene art-scene-b" />
    </span>
  );
}

const MOTION_MARKS: Record<MotionPreset, string> = {
  none: "",
  zoomin:
    "M4 4l6 6m-3 0h3V7M32 4l-6 6m3 0h-3V7M4 40l6-6m-3 0h3v3M32 40l-6-6m3 0h-3v3",
  zoomout:
    "M10 10L4 4m3 0H4v3M26 10l6-6m-3 0h3v3M10 34l-6 6m3 0H4v-3M26 34l6 6m-3 0h3v-3",
  breathe: "M7 8h22v28H7zM12 14h12v16H12z",
  drift: "M8 22c0-7 10-7 10 0s10 7 10 0-10-7-10 0-10 7-10 0z",
  pulse: "M3 24h8l3-8 4 16 3-8h12",
  sway: "M9 13q9-7 18 0m-18 0l1-4m-1 4l4 0m14 0l-1-4m1 4l-4 0",
};

export function MotionArt({ motion }: { motion: MotionPreset }) {
  return (
    <span className="studio-art-clip" data-motion={motion} aria-hidden="true">
      <span className="art-scene art-scene-a art-camera" />
      {MOTION_MARKS[motion] ? (
        <svg viewBox="0 0 36 44" className="art-marks" aria-hidden="true">
          <path d={MOTION_MARKS[motion]} />
        </svg>
      ) : null}
    </span>
  );
}

const REACTION_LINES: Record<Project["reaction"], string> = {
  bass: "M0 14C6 2 14 2 18 14s12 12 16 0 12-12 16 0 10 10 14 6",
  percussion: "M0 22h8l2-18 2 18h12l2-16 2 16h12l2-18 2 18h12l2-14 2 14h4",
  energy: "M0 24C8 22 12 12 20 11s12 8 18 1 12-6 16 0 6 8 10 9",
};

export function ReactionArt({ reaction }: { reaction: Project["reaction"] }) {
  return (
    <svg
      viewBox="0 0 64 26"
      className="studio-art art-line"
      style={{ width: 54, height: 22 }}
      aria-hidden="true"
    >
      <path d={REACTION_LINES[reaction]} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
