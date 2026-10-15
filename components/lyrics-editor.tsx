"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  SearchIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { AudioTransport } from "@/components/audio-timeline";
import { LyricTimeline } from "@/components/lyric-timeline";
import { Amount, Choice } from "@/components/studio-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatTime, parseTime } from "@/lib/media/time";
import type { AudioAnalysis } from "@/lib/studio/audio";
import { importLyrics, serializeLyrics } from "@/lib/studio/lyric-import";
import {
  type LyricResult,
  lyricsFromResult,
  searchLyrics,
} from "@/lib/studio/lyric-provider";
import {
  EMPTY_LYRICS,
  editWord,
  estimateWords,
  joinLyricLine,
  LYRIC_EFFECTS,
  type LyricLine,
  type LyricTrack,
  lineText,
  lyricId,
  replaceLineText,
  shiftLyrics,
  splitLyricLine,
  type TimingScope,
  tapLyricWord,
} from "@/lib/studio/lyrics";
import { TYPEFACES } from "@/lib/studio/options";
import { cn } from "@/lib/utils";

type Props = {
  track: LyricTrack;
  onChange: (track: LyricTrack) => void;
  transport: RefObject<AudioTransport | null>;
  range: [number, number];
  time: number;
  audio: File | null;
  analysis: AudioAnalysis | null;
  playing: boolean;
  active: boolean;
  disabled: boolean;
  isStory: boolean;
  onAddAudio: () => void;
  onSeek: (time: number) => void;
  onStory: () => void;
};
const signedTime = (n: number) =>
  `${n < 0 ? "-" : ""}${formatTime(Math.abs(n))}`;

function ExactTime({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  onFocus?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(signedTime(value));
  const cancelled = useRef(false);
  useEffect(() => setText(signedTime(value)), [value]);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={text}
        className="font-mono text-xs"
        onFocus={onFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          const trimmed = text.trim();
          const n = parseTime(trimmed.replace(/^[+-]/u, ""));
          if (n === null) setText(signedTime(value));
          else {
            const next = n * (trimmed.startsWith("-") ? -1 : 1);
            if (Math.abs(next - value) > 0.00001) onChange(next);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            setText(signedTime(value));
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

function PhraseText({
  line,
  onChange,
}: {
  line: LyricLine;
  onChange: (text: string) => void;
}) {
  const [text, setText] = useState(lineText(line));
  const value = lineText(line);
  useEffect(() => setText(value), [value]);
  return (
    <Field>
      <FieldLabel htmlFor="lyric-phrase-text">Phrase text</FieldLabel>
      <Textarea
        id="lyric-phrase-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text.trim() !== value) onChange(text);
          else setText(value);
        }}
      />
      <FieldDescription>
        Keep the word count to preserve timings. Adding or removing words
        creates fresh estimates for this phrase.
      </FieldDescription>
    </Field>
  );
}

export function LyricsEditor({
  track,
  onChange,
  transport,
  range,
  time,
  audio,
  analysis,
  playing,
  active,
  disabled,
  isStory,
  onAddAudio,
  onSeek,
  onStory,
}: Props) {
  const [view, setView] = useState("timing");
  const [sourceOpen, setSourceOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [results, setResults] = useState<LyricResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<TimingScope>("word");
  const [nudge, setNudge] = useState("0.05");
  const [rate, setRate] = useState("1");
  const [loop, setLoop] = useState(false);
  const [tap, setTap] = useState<number | null>(null);
  const [historySize, setHistorySize] = useState([0, 0]);
  const past = useRef<LyricTrack[]>([]),
    future = useRef<LyricTrack[]>([]);
  const current = useRef(track);
  current.current = track;
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const lastSearch = useRef(0);
  const download = useRef<string | null>(null);
  const clipLines = track.lines.filter(
    (line) => line.end > range[0] && line.start < range[1],
  );
  const line =
    track.lines.find((line) => line.id === selected) ??
    clipLines[0] ??
    track.lines[0];
  const index = Math.min(wordIndex, (line?.words.length ?? 1) - 1);
  const word = line?.words[index];
  const estimated = track.lines.some((line) =>
    line.words.some((w) => w.timing === "estimated"),
  );
  const refreshHistory = () =>
    setHistorySize([past.current.length, future.current.length]);
  const commit = (next: LyricTrack) => {
    if (disabled || next === current.current) return;
    past.current.push(current.current);
    future.current = [];
    current.current = next;
    onChange(next);
    refreshHistory();
  };
  const patch = (next: Partial<LyricTrack>) =>
    commit({ ...current.current, ...next });
  const changeLine = (next: LyricLine) =>
    patch({
      lines: current.current.lines.map((l) => (l.id === next.id ? next : l)),
    });
  const now = () => transport.current?.time() ?? time;
  const choose = (id: string) => {
    setSelected(id);
    setWordIndex(0);
    setTap(null);
    setLoop(false);
  };

  useEffect(
    () => () => {
      request.current?.abort();
      epoch.current++;
      if (download.current) URL.revokeObjectURL(download.current);
    },
    [],
  );
  useEffect(() => {
    if (disabled) {
      request.current?.abort();
      epoch.current++;
      setBusy(false);
      setTap(null);
    }
  }, [disabled]);
  const loopStart = line?.start,
    loopEnd = line?.end;
  // The transport is replaced when audio changes; trimming also clears its loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reapply settings to the current audio element after either change.
  useEffect(() => {
    const player = transport.current;
    player?.setRate(active ? Number(rate) : 1);
    player?.setLoop(
      active && loop && loopStart !== undefined && loopEnd !== undefined
        ? [loopStart, loopEnd]
        : null,
    );
    return () => {
      player?.setRate(1);
      player?.setLoop(null);
    };
  }, [active, rate, loop, loopStart, loopEnd, transport, audio, range]);

  const adopt = (next: LyricTrack, restoreStyle = false) => {
    commit(
      restoreStyle
        ? next
        : {
            ...current.current,
            lines: next.lines,
            enabled: true,
            source: next.source,
            sourceUrl: next.sourceUrl,
          },
    );
    setSourceOpen(false);
    setSelected(
      (
        next.lines.find(
          (line) => line.end > range[0] && line.start < range[1],
        ) ?? next.lines[0]
      )?.id ?? "",
    );
    setWordIndex(0);
    setTap(null);
    setLoop(false);
    setNotice(
      "Lyrics loaded. Select a word and align it to the playhead to set your starting point.",
    );
    setError("");
  };
  const importText = async (text: string, name: string) => {
    request.current?.abort();
    const operation = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const next = await importLyrics(
        text,
        name,
        range[0],
        range[1] - range[0],
      );
      if (operation === epoch.current) adopt(next, name.endsWith(".json"));
    } catch (e) {
      if (operation === epoch.current)
        setError(
          e instanceof Error ? e.message : "Couldn't open those lyrics.",
        );
    } finally {
      if (operation === epoch.current) setBusy(false);
    }
  };
  const search = async () => {
    if (!query.trim() || busy || disabled) return;
    if (Date.now() - lastSearch.current < 500) return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    const operation = ++epoch.current;
    lastSearch.current = Date.now();
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const found = await searchLyrics(
        query,
        AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
      );
      if (operation === epoch.current) setResults(found);
    } catch (e) {
      if (operation === epoch.current && !abort.signal.aborted)
        setError(
          e instanceof Error &&
            e.name !== "TypeError" &&
            e.name !== "TimeoutError"
            ? e.message
            : "Couldn't reach LRCLIB. Try again, or paste your lyrics below.",
        );
    } finally {
      if (operation === epoch.current) setBusy(false);
    }
  };
  const selectResult = async (result: LyricResult) => {
    const operation = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const next = await lyricsFromResult(result);
      if (operation === epoch.current) adopt(next);
    } catch (e) {
      if (operation === epoch.current)
        setError(e instanceof Error ? e.message : "Couldn't read this result.");
    } finally {
      if (operation === epoch.current) setBusy(false);
    }
  };
  const undo = (redo = false) => {
    const from = redo ? future : past,
      to = redo ? past : future;
    const next = from.current.pop();
    if (!next) return;
    to.current.push(current.current);
    current.current = next;
    onChange(next);
    refreshHistory();
    setTap(null);
    setLoop(false);
  };
  const shift = (delta: number, target = scope) => {
    if (line && Number.isFinite(delta))
      patch({
        lines: shiftLyrics(
          current.current.lines,
          line.id,
          index,
          delta,
          target,
        ),
      });
  };
  const tapNext = () => {
    if (!line || tap === null) return;
    const at = now();
    if (tap < line.words.length) {
      changeLine(tapLyricWord(line, tap, at));
      setWordIndex(tap);
      setTap(tap + 1);
    } else {
      const last = line.words.length - 1;
      const end = Math.max(line.words[last].start + 0.001, at);
      const next = editWord(line, last, { end });
      changeLine({
        ...next,
        end: Math.max(end, ...next.words.map((w) => w.end)),
      });
      setTap(null);
      setNotice("Phrase timed. Play it back, then fine-tune any word.");
    }
  };

  return (
    <FieldGroup className="min-w-0">
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".lrc,.txt,.yaml,.yml,.json"
        aria-label="Import lyric file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void file
              .text()
              .then((text) => importText(text, file.name))
              .catch(() => setError("Couldn't read the lyric file."));
        }}
      />
      {!isStory ? (
        <Alert>
          <AlertDescription>
            <span>Lyrics appear in Story videos and story teasers.</span>
            <Button size="sm" variant="outline" onClick={onStory}>
              Switch to Story
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-xl italic">Make every word land.</p>
          <p className="text-xs text-muted-foreground">
            Your timing. Your typography.
          </p>
        </div>
        <Badge variant="secondary">Free</Badge>
      </div>
      <details
        open={sourceOpen}
        onToggle={(e) => setSourceOpen(e.currentTarget.open)}
        className="lyric-source"
      >
        <summary className="cursor-pointer text-sm font-medium">
          {track.lines.length ? "Find or replace lyrics" : "Find your lyrics"}
        </summary>
        <FieldGroup className="mt-4 gap-4">
          <Field>
            <FieldLabel htmlFor="lyric-search">Song and artist</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="lyric-search"
                placeholder="Song title, artist"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void search();
                  }
                }}
              />
              <Button
                size="icon"
                aria-label="Search free lyrics"
                disabled={busy || !query.trim()}
                onClick={() => void search()}
              >
                {busy ? <Spinner /> : <SearchIcon />}
              </Button>
            </div>
            <FieldDescription>
              Free lookup from{" "}
              <a
                className="underline"
                href="https://lrclib.net"
                target="_blank"
                rel="noreferrer"
              >
                LRCLIB
              </a>
              . Only this search text is sent; your audio stays here.
            </FieldDescription>
          </Field>
          {busy ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                request.current?.abort();
                epoch.current++;
                setBusy(false);
              }}
            >
              Cancel lyric loading
            </Button>
          ) : null}
          {results ? (
            <section
              className="flex max-h-60 flex-col gap-2 overflow-y-auto"
              aria-label="Lyric search results"
            >
              {results.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No match. Try a shorter title or paste the words below.
                </p>
              ) : (
                results.map((result) => (
                  <Button
                    key={result.id}
                    variant="outline"
                    className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                    disabled={busy}
                    onClick={() => void selectResult(result)}
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span>
                        {result.trackName}{" "}
                        <span className="text-muted-foreground">
                          · {result.artistName}
                        </span>
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {result.albumName} · {formatTime(result.duration)} ·{" "}
                        {result.hasWordSync
                          ? "Word sync"
                          : result.syncedLyrics
                            ? "Line sync"
                            : result.instrumental
                              ? "Instrumental"
                              : "Text only"}
                      </span>
                    </span>
                  </Button>
                ))
              )}
            </section>
          ) : null}
          <Separator />
          <Field>
            <FieldLabel htmlFor="lyric-paste">Or paste your lyrics</FieldLabel>
            <Textarea
              id="lyric-paste"
              value={paste}
              placeholder="One phrase per line. LRC timestamps work too."
              onChange={(e) => setPaste(e.target.value)}
              className="max-h-52 min-h-24"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !paste.trim()}
                onClick={() => void importText(paste, "Pasted lyrics")}
              >
                Use these lyrics
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <UploadIcon data-icon="inline-start" />
                Import file
              </Button>
            </div>
            <FieldDescription>
              LRC, enhanced LRC, lyricsfile YAML, text, or saved Sonora edits.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </details>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <output className="text-xs text-muted-foreground">{notice}</output>
      ) : null}
      {track.lines.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Toggle
              variant="outline"
              size="sm"
              pressed={track.enabled}
              onPressedChange={(enabled) => patch({ enabled })}
            >
              Show lyrics
            </Toggle>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Undo lyric edit"
                disabled={!historySize[0]}
                onClick={() => undo()}
              >
                <Undo2Icon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Redo lyric edit"
                disabled={!historySize[1]}
                onClick={() => undo(true)}
              >
                <Redo2Icon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Save lyric edits"
                onClick={() => {
                  if (download.current) URL.revokeObjectURL(download.current);
                  download.current = URL.createObjectURL(
                    new Blob([serializeLyrics(current.current)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = download.current;
                  a.download = "sonora-lyrics.json";
                  a.click();
                  setNotice(
                    "Saved timings and appearance. Import this file to continue later.",
                  );
                }}
              >
                <DownloadIcon />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium break-words">{track.source}</p>
            <p className="text-xs text-muted-foreground">
              {estimated
                ? "Some word timings are estimated. Tap or edit them to dial it in."
                : "Word start times supplied or edited. Check the word endings by ear."}
            </p>
          </div>
          <ToggleGroup
            aria-label="Lyric editor section"
            value={[view]}
            onValueChange={(v) => {
              if (v[0]) setView(v[0]);
            }}
            className="w-full"
            variant="outline"
          >
            <ToggleGroupItem value="timing" className="flex-1">
              Timing
            </ToggleGroupItem>
            <ToggleGroupItem value="look" className="flex-1">
              Appearance
            </ToggleGroupItem>
          </ToggleGroup>
          {view === "look" ? (
            <>
              <Choice
                label="Word entrance"
                value={track.effect}
                options={LYRIC_EFFECTS}
                onChange={(effect) => patch({ effect })}
              />
              <Choice
                label="Lyric typeface"
                value={track.font}
                options={TYPEFACES}
                onChange={(font) => patch({ font })}
              />
              <Amount
                label="Word size"
                value={track.size}
                min={24}
                max={150}
                suffix="px"
                onChange={(size) => patch({ size })}
              />
              <Amount
                label="Entrance time"
                value={Math.round(track.entrance * 1000)}
                min={0}
                max={1000}
                step={10}
                suffix="ms"
                onChange={(n) => patch({ entrance: n / 1000 })}
              />
              <div className="grid grid-cols-2 gap-3">
                {(["color", "accent"] as const).map((key) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`lyric-${key}`}>
                      {key === "color" ? "Text color" : "Karaoke accent"}
                    </FieldLabel>
                    <Input
                      id={`lyric-${key}`}
                      type="color"
                      value={track[key]}
                      onChange={(e) => patch({ [key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <Amount
                label="Lyric width"
                value={Math.round(track.width * 100)}
                min={20}
                max={100}
                suffix="%"
                onChange={(n) => patch({ width: n / 100 })}
              />
              <Amount
                label="Horizontal position"
                value={Math.round(track.x * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => patch({ x: n / 100 })}
              />
              <Amount
                label="Vertical position"
                value={Math.round(track.y * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => patch({ y: n / 100 })}
              />
              <Toggle
                variant="outline"
                pressed={track.backdrop}
                onPressedChange={(backdrop) => patch({ backdrop })}
              >
                Soft backing behind words
              </Toggle>
              <FieldDescription>
                Fade, Float, Pop, and Stamp build the whole phrase. Solo holds
                each word until its end time. Karaoke uses both boundaries for
                the color sweep.
              </FieldDescription>
            </>
          ) : (
            <>
              {!audio ? (
                <Button variant="outline" onClick={onAddAudio}>
                  <Music2Icon data-icon="inline-start" />
                  Add audio to sync by ear
                </Button>
              ) : null}
              <div className="lyric-transport flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    aria-label={
                      playing ? "Pause lyric preview" : "Play lyric preview"
                    }
                    disabled={!audio}
                    onClick={() => void transport.current?.toggle()}
                  >
                    {playing ? <PauseIcon /> : <PlayIcon />}
                  </Button>
                  <span className="min-w-0 flex-1 font-mono text-xs tabular-nums">
                    {formatTime(time)}{" "}
                    <span className="text-muted-foreground">in song</span>
                  </span>
                  <Toggle
                    size="sm"
                    variant="outline"
                    pressed={loop}
                    onPressedChange={setLoop}
                    disabled={!audio || !line}
                  >
                    Loop phrase
                  </Toggle>
                </div>
                <Slider
                  aria-label="Lyric playhead"
                  min={range[0]}
                  max={Math.max(range[0] + 0.01, range[1])}
                  step={0.001}
                  value={time}
                  onValueChange={(n) => {
                    if (typeof n === "number") onSeek(n);
                  }}
                />
                <ExactTime
                  label="Playhead in song"
                  value={time}
                  onFocus={() => transport.current?.pause()}
                  onChange={onSeek}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Listen slower
                  </span>
                  <ToggleGroup
                    aria-label="Lyric playback speed"
                    size="sm"
                    variant="outline"
                    value={[rate]}
                    onValueChange={(v) => {
                      if (v[0]) setRate(v[0]);
                    }}
                  >
                    {["0.5", "0.75", "1"].map((v) => (
                      <ToggleGroupItem key={v} value={v}>
                        {v}×
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  {clipLines.length} phrases in this clip
                </p>
                <Toggle
                  size="sm"
                  pressed={showAll}
                  onPressedChange={setShowAll}
                >
                  Full song
                </Toggle>
              </div>
              <section
                className="lyric-phrases flex max-h-44 flex-col gap-1 overflow-y-auto"
                aria-label="Lyric phrases"
              >
                {(showAll ? track.lines : clipLines).map((item) => (
                  <Button
                    key={item.id}
                    variant={item.id === line?.id ? "secondary" : "ghost"}
                    aria-pressed={item.id === line?.id}
                    className="h-auto justify-start gap-3 whitespace-normal py-2 text-left"
                    onClick={() => choose(item.id)}
                  >
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {signedTime(item.start)}
                    </span>
                    <span className="min-w-0 break-words text-xs">
                      {lineText(item)}
                    </span>
                  </Button>
                ))}
                {!showAll && !clipLines.length ? (
                  <p className="text-xs text-muted-foreground">
                    No lyrics land in this selection yet. Open Full song, pick
                    the phrase, then align a word below.
                  </p>
                ) : null}
              </section>
              {line && word ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel>Select a word</FieldLabel>
                    <ToggleGroup
                      aria-label="Lyric word"
                      value={[word.id]}
                      onValueChange={(v) => {
                        const n = line.words.findIndex((w) => w.id === v[0]);
                        if (n >= 0) {
                          setWordIndex(n);
                          setTap(null);
                        }
                      }}
                      spacing={1}
                      className="flex flex-wrap justify-start"
                    >
                      {line.words.map((w) => (
                        <ToggleGroupItem
                          key={w.id}
                          value={w.id}
                          className={cn(
                            "max-w-full truncate",
                            time >= w.start &&
                              time < w.end &&
                              "ring-1 ring-primary",
                          )}
                        >
                          {w.text.trim()}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription>
                      {word.timing === "estimated"
                        ? "Estimated timing"
                        : word.timing === "manual"
                          ? "Manually timed"
                          : "Imported word start"}{" "}
                      · all times are measured from the start of your audio
                      file.
                    </FieldDescription>
                  </Field>
                  <LyricTimeline
                    key={line.id}
                    line={line}
                    wordIndex={index}
                    time={time}
                    range={range}
                    analysis={analysis}
                    disabled={disabled}
                    onSelect={setWordIndex}
                    onSeek={onSeek}
                    onEdit={(i, patch) => changeLine(editWord(line, i, patch))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ExactTime
                      label="Word starts"
                      value={word.start}
                      onChange={(start) =>
                        changeLine(editWord(line, index, { start }))
                      }
                    />
                    <ExactTime
                      label="Word ends"
                      value={word.end}
                      onChange={(end) =>
                        changeLine(editWord(line, index, { end }))
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const at = now();
                      shift(at - word.start, "all");
                      setNotice(
                        `Aligned "${word.text.trim()}" to ${formatTime(at)}. Every other interval is preserved.`,
                      );
                    }}
                  >
                    Align this word to playhead
                  </Button>
                  <FieldDescription className="-mt-4">
                    Shifts all lyrics together. Use this once for your starting
                    point.
                  </FieldDescription>
                  <details className="lyric-source">
                    <summary className="cursor-pointer text-sm font-medium">
                      Fine-tune timing
                    </summary>
                    <FieldGroup className="mt-4 gap-4">
                      <Choice
                        label="Move"
                        value={scope}
                        options={[
                          {
                            value: "word",
                            label: "Word",
                            description:
                              "Move only the selected word, keeping its duration.",
                          },
                          {
                            value: "line",
                            label: "Phrase",
                            description:
                              "Move every word in this phrase together.",
                          },
                          {
                            value: "tail",
                            label: "From here",
                            description:
                              "Move this word and all the words and phrases after it.",
                          },
                          {
                            value: "all",
                            label: "All lyrics",
                            description:
                              "Shift every lyric without changing the spacing between words.",
                          },
                        ]}
                        onChange={setScope}
                      />
                      <Field>
                        <FieldLabel htmlFor="lyric-nudge">
                          Nudge amount (seconds)
                        </FieldLabel>
                        <Input
                          id="lyric-nudge"
                          inputMode="decimal"
                          value={nudge}
                          onChange={(e) => setNudge(e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !Number.isFinite(Number(nudge)) ||
                              Number(nudge) <= 0
                            }
                            onClick={() => shift(-Number(nudge))}
                          >
                            <ArrowLeftIcon data-icon="inline-start" />
                            Earlier
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !Number.isFinite(Number(nudge)) ||
                              Number(nudge) <= 0
                            }
                            onClick={() => shift(Number(nudge))}
                          >
                            Later
                            <ArrowRightIcon data-icon="inline-end" />
                          </Button>
                        </div>
                      </Field>
                      <Button
                        variant="outline"
                        onClick={() =>
                          changeLine(editWord(line, index, { start: now() }))
                        }
                      >
                        Set just this word's start to playhead
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          changeLine(editWord(line, index, { end: now() }))
                        }
                      >
                        Set just this word's end to playhead
                      </Button>
                      <ExactTime
                        label="Phrase disappears"
                        value={line.end}
                        onChange={(end) =>
                          changeLine({
                            ...line,
                            end: Math.max(end, ...line.words.map((w) => w.end)),
                          })
                        }
                      />
                    </FieldGroup>
                  </details>
                  <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Tap along</span>
                      {tap !== null ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTap(null)}
                        >
                          Done tapping
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Play the phrase, then tap when each word starts. The last
                      tap sets the ending.
                    </p>
                    {tap === null ? (
                      <Button
                        key="arm-tapping"
                        variant="outline"
                        disabled={!audio}
                        onClick={() => {
                          setTap(index);
                          setLoop(false);
                        }}
                      >
                        Time from "{word.text.trim()}"
                      </Button>
                    ) : (
                      <Button
                        key="tap-word"
                        className="h-auto min-h-12 whitespace-normal"
                        onPointerDown={(e) => {
                          if (e.button === 0) {
                            e.preventDefault();
                            tapNext();
                          }
                        }}
                        onClick={(e) => {
                          if (e.detail === 0) tapNext();
                        }}
                      >
                        {tap < line.words.length
                          ? `Tap "${line.words[tap].text.trim()}"`
                          : "Tap to end phrase"}
                      </Button>
                    )}
                  </div>
                  <details className="lyric-source">
                    <summary className="cursor-pointer text-sm font-medium">
                      Edit phrases
                    </summary>
                    <FieldGroup className="mt-4 gap-4">
                      <PhraseText
                        key={line.id}
                        line={line}
                        onChange={(text) => {
                          changeLine(replaceLineText(line, text));
                          setWordIndex(0);
                          setTap(null);
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={index === 0}
                          onClick={() =>
                            patch({
                              lines: splitLyricLine(
                                track.lines,
                                line.id,
                                index,
                              ),
                            })
                          }
                        >
                          Split before selected word
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={track.lines.at(-1)?.id === line.id}
                          onClick={() =>
                            patch({
                              lines: joinLyricLine(track.lines, line.id),
                            })
                          }
                        >
                          Join next phrase
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const at = now();
                          const added = {
                            id: lyricId(),
                            start: at,
                            end: at + 2,
                            words: estimateWords("Your words here", at, at + 2),
                          };
                          const n = track.lines.findIndex(
                            (l) => l.id === line.id,
                          );
                          patch({
                            lines: [
                              ...track.lines.slice(0, n + 1),
                              added,
                              ...track.lines.slice(n + 1),
                            ],
                          });
                          choose(added.id);
                        }}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Add phrase at playhead
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          patch({
                            lines: track.lines.filter((l) => l.id !== line.id),
                          });
                          choose("");
                        }}
                      >
                        Remove this phrase
                      </Button>
                    </FieldGroup>
                  </details>
                </>
              ) : null}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Save your lyric edits with the download icon to keep them after
            closing this page. Audio and photos aren't included.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              patch({ ...EMPTY_LYRICS });
              setSourceOpen(true);
              setTap(null);
              setNotice("Lyrics cleared. Undo restores them.");
            }}
          >
            Clear lyrics
          </Button>
        </>
      ) : historySize[0] ? (
        <Button variant="outline" onClick={() => undo()}>
          <Undo2Icon data-icon="inline-start" />
          Undo clearing lyrics
        </Button>
      ) : null}
    </FieldGroup>
  );
}
