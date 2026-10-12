"use client";

import { useEffect, useRef, useState } from "react";
import type { AudioAnalysis } from "@/lib/studio/audio";
import {
  dimensions,
  type Photo,
  type Project,
  type Variant,
} from "@/lib/studio/model";
import type { StudioRenderer } from "@/lib/studio/renderer";

type Props = {
  project: Project;
  photos: Photo[];
  variant: Variant;
  page: number;
  time: number;
  duration: number;
  analysis: AudioAnalysis | null;
  audioStart: number;
  animate: boolean;
  guides: boolean;
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, patch: Partial<Photo>) => void;
};
export function StudioPreview(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<StudioRenderer | null>(null);
  const live = useRef(props);
  const [error, setError] = useState("");
  useEffect(() => {
    live.current = props;
  });
  const { project, photos, variant, duration, analysis, audioStart } = props;
  useEffect(() => {
    const container = host.current;
    if (!container || !photos.length) return;
    let disposed = false,
      frame = 0;
    let current: StudioRenderer | null = null;
    // Each generation owns its DOM. A late asynchronous renderer cannot clear
    // the next generation's stage while React is changing photos or settings.
    const mount = document.createElement("div");
    container.appendChild(mount);
    setError("");
    const observer = new ResizeObserver(() =>
      current?.resize(container.clientWidth),
    );
    observer.observe(container);
    void import("@/lib/studio/renderer")
      .then(({ createStudioRenderer }) =>
        createStudioRenderer(mount, {
          project,
          photos,
          variant,
          duration,
          analysis,
          audioStart,
          width: container.clientWidth,
          onSelect: (id) => live.current.onSelect(id),
          onMove: (id, patch) => live.current.onMove(id, patch),
        }),
      )
      .then((next) => {
        if (disposed) {
          next.dispose();
          return;
        }
        current = next;
        renderer.current = next;
        const epoch = performance.now();
        let lastTime = -1,
          lastPage = -1;
        const tick = () => {
          if (disposed) return;
          const p = live.current;
          const seconds = p.animate
            ? ((performance.now() - epoch) / 1000 + p.time) %
              Math.max(0.01, p.duration)
            : p.time;
          try {
            if (seconds !== lastTime || p.page !== lastPage) {
              next.draw(seconds, p.page);
              lastTime = seconds;
              lastPage = p.page;
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Preview unavailable.");
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((e) => {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Preview unavailable.");
      });
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      current?.dispose();
      mount.remove();
      renderer.current = null;
    };
  }, [project, photos, variant, duration, analysis, audioStart]);
  const size = dimensions(project, variant);
  const isStory = size.height === 1920;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        className="studio-preview-frame relative w-full overflow-hidden rounded-[3px] bg-story-canvas"
        style={{
          maxWidth: `min(540px, calc(56svh * ${size.width / size.height}))`,
          aspectRatio: `${size.width} / ${size.height}`,
        }}
      >
        <div
          ref={host}
          className="w-full"
          style={{ pointerEvents: props.disabled ? "none" : "auto" }}
          role="img"
          aria-label="Composition preview. Drag a photo to adjust its framing."
        />
        {props.guides ? (
          <div
            className="pointer-events-none absolute inset-0 text-white"
            aria-hidden="true"
          >
            <div className="absolute inset-x-[5%] top-[13%] bottom-[18%] border border-dashed border-white/70" />
            {isStory ? (
              <>
                <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-black/25 px-[5%] py-[6%] text-[10px]">
                  <span className="size-5 rounded-full border border-white" />{" "}
                  your story <span className="ml-auto">•••</span>
                </div>
                <div className="absolute inset-x-[5%] bottom-[5%] rounded-full border border-white/60 px-4 py-2 text-[10px]">
                  Send message ♡
                </div>
              </>
            ) : (
              <div className="absolute inset-x-0 bottom-0 bg-black/25 p-[4%] text-xs">
                ♡　⌁　↗ <span className="float-right">▱</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
      {error ? (
        <p
          className="max-w-md text-center text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
