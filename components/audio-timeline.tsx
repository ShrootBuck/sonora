"use client";

import { AudioWaveformIcon, PauseIcon, PlayIcon } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { formatTime, parseTime } from "@/lib/media/time";
import type { AudioAnalysis } from "@/lib/studio/audio";
import { cn } from "@/lib/utils";

export { formatTime, parseTime } from "@/lib/media/time";

export type AudioTransport = {
  time: () => number;
  seek: (time: number) => void;
  toggle: () => Promise<void>;
  pause: () => void;
  setRate: (rate: number) => void;
  setLoop: (range: [number, number] | null) => void;
};

type AudioTimelineProps = {
  file: File;
  url: string;
  duration: number;
  selection: [number, number];
  onDurationChange: (duration: number) => void;
  onSelectionChange: (selection: [number, number]) => void;
  analysis?: AudioAnalysis | null;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  disabled?: boolean;
  transportRef?: Ref<AudioTransport>;
};

const WAVEFORM_BARS = 144;

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
  analysis,
  onTimeChange,
  onPlayingChange,
  disabled = false,
  transportRef,
}: AudioTimelineProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(selection[0]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [waveformUnavailable, setWaveformUnavailable] = useState(false);
  const loopRef = useRef<[number, number] | null>(null);
  const playEpoch = useRef(0);
  const live = useRef({ selection, disabled, onTimeChange });
  live.current = { selection, disabled, onTimeChange };

  useEffect(() => {
    if (analysis !== undefined) return;
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
  }, [file, analysis]);

  useEffect(() => {
    if (disabled) {
      playEpoch.current++;
      audioRef.current?.pause();
      setIsPlaying(false);
      if (animationRef.current !== null)
        cancelAnimationFrame(animationRef.current);
    }
  }, [disabled]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
    return () => onPlayingChange?.(false);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    playEpoch.current++;
    loopRef.current = null;
    setCurrentTime(selection[0]);
    setIsPlaying(false);
    if (animationRef.current !== null)
      cancelAnimationFrame(animationRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = selection[0];
    }
  }, [selection]);

  useEffect(() => {
    return () => {
      playEpoch.current++;
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
  const bars =
    analysis?.waveform ?? (waveform.length ? waveform : fallbackWaveform);

  const stopPlayback = (reset = false) => {
    playEpoch.current++;
    const audio = audioRef.current;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    audio?.pause();
    setIsPlaying(false);
    if (reset && audio) {
      audio.currentTime = live.current.selection[0];
      setCurrentTime(audio.currentTime);
      live.current.onTimeChange?.(audio.currentTime);
    } else if (audio) {
      setCurrentTime(audio.currentTime);
      live.current.onTimeChange?.(audio.currentTime);
    }
  };

  const tick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const bounds = live.current.selection;
    const loop = loopRef.current;
    if (
      loop &&
      loop[1] > loop[0] &&
      (audio.currentTime >= loop[1] || audio.currentTime < loop[0])
    ) {
      audio.currentTime = loop[0];
    } else if (audio.currentTime >= bounds[1] || audio.ended) {
      stopPlayback(true);
      return;
    }
    setCurrentTime(audio.currentTime);
    live.current.onTimeChange?.(audio.currentTime);
    animationRef.current = requestAnimationFrame(tick);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (
      !audio ||
      live.current.disabled ||
      live.current.selection[1] <= live.current.selection[0]
    )
      return;
    if (!audio.paused) {
      stopPlayback();
      return;
    }

    const bounds = loopRef.current ?? live.current.selection;
    if (audio.currentTime < bounds[0] || audio.currentTime >= bounds[1]) {
      audio.currentTime = bounds[0];
    }
    const epoch = ++playEpoch.current;
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      return;
    }
    if (epoch !== playEpoch.current) {
      audio.pause();
      return;
    }
    setIsPlaying(true);
    if (animationRef.current !== null)
      cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(tick);
  };

  const seek = (seconds: number) => {
    const bounds = live.current.selection;
    const next = Math.max(bounds[0], Math.min(bounds[1], seconds));
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrentTime(next);
    live.current.onTimeChange?.(next);
  };

  useImperativeHandle(transportRef, () => ({
    time: () => audioRef.current?.currentTime ?? live.current.selection[0],
    seek,
    toggle: togglePlayback,
    pause: stopPlayback,
    setRate(rate) {
      if (audioRef.current) audioRef.current.playbackRate = rate;
    },
    setLoop(range) {
      if (!range) {
        loopRef.current = null;
        return;
      }
      const start = Math.max(live.current.selection[0], range[0]);
      const end = Math.min(live.current.selection[1], range[1]);
      loopRef.current = end > start ? [start, end] : null;
    },
  }));

  return (
    <Field>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="audio-range">Audio selection</FieldLabel>
          <FieldDescription>
            This range sets the story's duration.
          </FieldDescription>
        </div>
        <span className="studio-value shrink-0 tabular-nums">
          {formatTime(selectionDuration)} selected
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon-lg"
          className="size-12 rounded-full"
          aria-label={
            isPlaying ? "Pause selected audio" : "Play selected audio"
          }
          onClick={() => void togglePlayback()}
          disabled={disabled}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div
            className="relative h-20 cursor-pointer overflow-hidden rounded-xl bg-black/30 px-2 ring-1 ring-border ring-inset"
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const nextTime =
                ((event.clientX - rect.left) / rect.width) * duration;
              if (!disabled) seek(nextTime);
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
                      !selected && "bg-foreground/15",
                    )}
                    style={{
                      height: `${Math.max(10, height * 92)}%`,
                      backgroundColor: selected ? "var(--primary)" : undefined,
                    }}
                  />
                );
              })}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-foreground"
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
            thumbLabels={["Audio selection start", "Audio selection end"]}
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
          <FieldDescription>
            Type exact times in seconds (65.5) or minutes:seconds (1:05.5).
          </FieldDescription>
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
        onEnded={() => {
          if (loopRef.current && !live.current.disabled) {
            seek(loopRef.current[0]);
            void togglePlayback();
          } else stopPlayback(true);
        }}
      />
    </Field>
  );
}
