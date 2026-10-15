"use client";

import { useRef, useState } from "react";
import { formatTime } from "@/lib/media/time";
import type { AudioAnalysis } from "@/lib/studio/audio";
import type { LyricLine, LyricWord } from "@/lib/studio/lyrics";
import { cn } from "@/lib/utils";

type Props = {
  line: LyricLine;
  wordIndex: number;
  time: number;
  range: [number, number];
  analysis: AudioAnalysis | null;
  disabled: boolean;
  onSelect: (index: number) => void;
  onSeek: (time: number) => void;
  onEdit: (index: number, patch: { start: number; end: number }) => void;
};
type Drag = {
  index: number;
  edge: "start" | "end" | "move";
  x: number;
  start: number;
  end: number;
  span: number;
  width: number;
};

export function LyricTimeline({
  line,
  wordIndex,
  time,
  range,
  analysis,
  disabled,
  onSelect,
  onSeek,
  onEdit,
}: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{
    index: number;
    start: number;
    end: number;
  } | null>(null);
  const intersects = line.end > range[0] && line.start < range[1];
  const start = intersects ? Math.max(range[0], line.start - 0.6) : range[0];
  const end = intersects ? Math.min(range[1], line.end + 0.6) : range[1];
  const span = Math.max(0.01, end - start);
  const pct = (n: number) => ((n - start) / span) * 100;
  const peaks = Array.from({ length: 100 }, (_, i) => {
    if (!analysis) return 0.05;
    const at = Math.floor((start + (i / 100) * span) * analysis.rate);
    return analysis.energy[at] ?? 0;
  });
  const max = Math.max(0.001, ...peaks);

  const handle = (word: LyricWord, index: number, edge: Drag["edge"]) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(index);
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        index,
        edge,
        x: event.clientX,
        start: word.start,
        end: word.end,
        span,
        width: rail.current?.clientWidth ?? 1,
      };
      setDraft({ index, start: word.start, end: word.end });
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || d.index !== index || d.edge !== edge) return;
      const delta = ((event.clientX - d.x) / d.width) * d.span;
      setDraft({
        index,
        start:
          edge === "end"
            ? d.start
            : Math.min(
                d.start + delta,
                edge === "start" ? d.end - 0.01 : Infinity,
              ),
        end:
          edge === "start"
            ? d.end
            : Math.max(
                d.end + delta,
                edge === "end" ? d.start + 0.01 : -Infinity,
              ),
      });
    },
    onPointerUp: () => {
      if (draft && drag.current) {
        const patch = {
          start: Math.round(draft.start * 1000) / 1000,
          end: Math.round(draft.end * 1000) / 1000,
        };
        if (
          patch.start !== drag.current.start ||
          patch.end !== drag.current.end
        )
          onEdit(index, patch);
      }
      drag.current = null;
      setDraft(null);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDraft(null);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta =
        (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01);
      onEdit(index, {
        start:
          edge === "end"
            ? word.start
            : Math.min(
                word.start + delta,
                edge === "start" ? word.end - 0.01 : Infinity,
              ),
        end:
          edge === "start"
            ? word.end
            : Math.max(
                word.end + delta,
                edge === "end" ? word.start + 0.01 : -Infinity,
              ),
      });
    },
  });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        ref={rail}
        className="relative isolate overflow-hidden rounded-xl border border-border bg-muted/30"
      >
        <button
          type="button"
          aria-label="Seek in lyric waveform"
          className="block h-14 w-full"
          disabled={disabled}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onSeek(start + ((e.clientX - rect.left) / rect.width) * span);
          }}
        >
          <svg
            viewBox="0 0 400 56"
            preserveAspectRatio="none"
            className="size-full"
            aria-hidden="true"
          >
            {peaks.map((value, i) => (
              <rect
                key={start + (i * span) / 100}
                x={i * 4}
                y={28 - Math.max(2, (value / max) * 24)}
                width={2.5}
                height={Math.max(4, (value / max) * 48)}
                rx={1}
                fill="currentColor"
                className="text-muted-foreground/40"
              />
            ))}
          </svg>
        </button>
        <section
          className="relative h-11 border-t border-border"
          aria-label="Word timing track"
        >
          {line.words.map((original, index) => {
            const word =
              draft?.index === index ? { ...original, ...draft } : original;
            if (word.end < start || word.start > end) return null;
            const left = Math.max(0, pct(word.start)),
              right = Math.min(100, pct(word.end));
            return (
              <div
                key={word.id}
                className={cn(
                  "absolute top-1 flex h-9 min-w-2 overflow-hidden rounded-md border border-border bg-secondary text-secondary-foreground",
                  index === wordIndex &&
                    "z-10 border-primary bg-primary text-primary-foreground",
                )}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(0.5, right - left)}%`,
                }}
              >
                <button
                  type="button"
                  aria-label={`Start of ${word.text.trim()}`}
                  className="w-2 shrink-0 touch-none cursor-ew-resize bg-foreground/15"
                  disabled={disabled}
                  {...handle(original, index, "start")}
                />
                <button
                  type="button"
                  aria-label={`Move ${word.text.trim()}`}
                  className="min-w-0 flex-1 touch-none cursor-grab truncate text-[10px]"
                  disabled={disabled}
                  {...handle(original, index, "move")}
                >
                  {word.text.trim()}
                </button>
                <button
                  type="button"
                  aria-label={`End of ${word.text.trim()}`}
                  className="w-2 shrink-0 touch-none cursor-ew-resize bg-foreground/15"
                  disabled={disabled}
                  {...handle(original, index, "end")}
                />
              </div>
            );
          })}
        </section>
        {time >= start && time <= end ? (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-primary"
            style={{ left: `${pct(time)}%` }}
          />
        ) : null}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{formatTime(start)}</span>
        <span>{formatTime(end)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a word or either edge. Arrow keys nudge 10 ms; Shift + arrow nudges
        100 ms.
      </p>
    </div>
  );
}
