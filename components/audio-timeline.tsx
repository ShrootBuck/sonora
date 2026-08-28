"use client";

import { AudioWaveformIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type AudioTimelineProps = {
  file: File;
  url: string;
  duration: number;
  selection: [number, number];
  onDurationChange: (duration: number) => void;
  onSelectionChange: (selection: [number, number]) => void;
};

const WAVEFORM_BARS = 144;

export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fraction = Math.floor((value % 1) * 10);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${fraction}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction}`;
}

function parseTime(value: string) {
  const parts = value.trim().split(":");
  if (parts.some((part) => part === "" || !Number.isFinite(Number(part)))) {
    return null;
  }

  if (parts.length === 1) return Number(parts[0]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  return null;
}

type TimeInputProps = {
  id: string;
  label: string;
  value: number;
  max: number;
  onCommit: (value: number) => void;
};

function TimeInput({ id, label, value, max, onCommit }: TimeInputProps) {
  const [draft, setDraft] = useState(formatTime(value));

  useEffect(() => setDraft(formatTime(value)), [value]);

  const commit = () => {
    const parsed = parseTime(draft);
    if (parsed === null) {
      setDraft(formatTime(value));
      return;
    }
    onCommit(Math.max(0, Math.min(max, parsed)));
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(formatTime(value));
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

export function AudioTimeline({
  file,
  url,
  duration,
  selection,
  onDurationChange,
  onSelectionChange,
}: AudioTimelineProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(selection[0]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [waveformUnavailable, setWaveformUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setWaveform([]);
    setWaveformUnavailable(false);

    const decode = async () => {
      const AudioContextClass =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        setWaveformUnavailable(true);
        return;
      }

      const context = new AudioContextClass();
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (cancelled) return;
        const channel = buffer.getChannelData(0);
        const blockSize = Math.max(
          1,
          Math.floor(channel.length / WAVEFORM_BARS),
        );
        const samples = Array.from({ length: WAVEFORM_BARS }, (_, index) => {
          const start = index * blockSize;
          const end = Math.min(channel.length, start + blockSize);
          let peak = 0;
          for (let position = start; position < end; position += 1) {
            peak = Math.max(peak, Math.abs(channel[position] ?? 0));
          }
          return peak;
        });
        const max = Math.max(...samples, 0.0001);
        setWaveform(samples.map((sample) => Math.max(0.08, sample / max)));
      } catch {
        if (!cancelled) setWaveformUnavailable(true);
      } finally {
        await context.close().catch(() => undefined);
      }
    };

    void decode();
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    setCurrentTime(selection[0]);
    if (audioRef.current && !isPlaying) {
      audioRef.current.currentTime = selection[0];
    }
  }, [isPlaying, selection]);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const selectionDuration = Math.max(0, selection[1] - selection[0]);
  const playheadPercent =
    duration > 0
      ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
      : 0;
  const selectionStartPercent =
    duration > 0 ? (selection[0] / duration) * 100 : 0;
  const selectionEndPercent =
    duration > 0 ? (selection[1] / duration) * 100 : 100;

  const fallbackWaveform = useMemo(
    () =>
      Array.from(
        { length: WAVEFORM_BARS },
        (_, index) => 0.18 + ((index * 17) % 11) / 18,
      ),
    [],
  );
  const bars = waveform.length ? waveform : fallbackWaveform;

  const stopPlayback = (reset = false) => {
    const audio = audioRef.current;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    audio?.pause();
    setIsPlaying(false);
    if (reset && audio) {
      audio.currentTime = selection[0];
      setCurrentTime(selection[0]);
    }
  };

  const tick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime >= selection[1] || audio.ended) {
      stopPlayback(true);
      return;
    }
    setCurrentTime(audio.currentTime);
    animationRef.current = requestAnimationFrame(tick);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (audio.currentTime < selection[0] || audio.currentTime >= selection[1]) {
      audio.currentTime = selection[0];
    }
    await audio.play();
    setIsPlaying(true);
    animationRef.current = requestAnimationFrame(tick);
  };

  return (
    <Field>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="audio-range">Audio selection</FieldLabel>
          <FieldDescription>
            Drag both handles. There is no imposed duration limit.
          </FieldDescription>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatTime(selectionDuration)} selected
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon-lg"
          variant="outline"
          aria-label={
            isPlaying ? "Pause selected audio" : "Play selected audio"
          }
          onClick={() => void togglePlayback()}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div
            className="relative h-20 cursor-pointer overflow-hidden rounded-lg bg-muted px-2"
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const nextTime =
                ((event.clientX - rect.left) / rect.width) * duration;
              const audio = audioRef.current;
              if (audio) audio.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
          >
            <div
              className="absolute inset-0 flex items-center gap-px px-2"
              aria-hidden
            >
              {bars.map((height, index) => {
                const percent = (index / Math.max(1, bars.length - 1)) * 100;
                const selected =
                  percent >= selectionStartPercent &&
                  percent <= selectionEndPercent;
                return (
                  <span
                    key={percent}
                    className={cn(
                      "min-w-px flex-1 rounded-full transition-colors",
                      selected ? "bg-foreground/75" : "bg-foreground/20",
                    )}
                    style={{ height: `${Math.max(10, height * 92)}%` }}
                  />
                );
              })}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-primary"
              style={{ left: `${playheadPercent}%` }}
            />
            {waveformUnavailable ? (
              <div className="pointer-events-none absolute right-2 bottom-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <AudioWaveformIcon className="size-3" />
                Preview unavailable; export still works
              </div>
            ) : null}
          </div>

          <Slider
            id="audio-range"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.01}
            value={selection}
            disabled={duration <= 0}
            onValueChange={(value) => {
              if (!Array.isArray(value) || value.length < 2) return;
              const start = Math.max(0, value[0] ?? 0);
              const end = Math.min(duration, value[1] ?? duration);
              onSelectionChange([start, end]);
            }}
          />

          <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(selection[0])}</span>
            <span>{formatTime(selection[1])}</span>
          </div>

          <FieldGroup className="grid grid-cols-2 gap-3">
            <TimeInput
              id="audio-start"
              label="Start"
              value={selection[0]}
              max={duration}
              onCommit={(start) =>
                onSelectionChange([Math.min(start, selection[1]), selection[1]])
              }
            />
            <TimeInput
              id="audio-end"
              label="End"
              value={selection[1]}
              max={duration}
              onCommit={(end) =>
                onSelectionChange([selection[0], Math.max(selection[0], end)])
              }
            />
          </FieldGroup>
        </div>
      </div>

      {/* biome-ignore lint/a11y/useMediaCaption: This is arbitrary user-supplied audio, so Sonora has no caption track to attach. */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration)) onDurationChange(nextDuration);
        }}
        onEnded={() => stopPlayback(true)}
      />
    </Field>
  );
}
