import { parseTime } from "@/lib/media/time";
import {
  EMPTY_LYRICS,
  estimateWords,
  LYRIC_EFFECTS,
  type LyricLine,
  type LyricTrack,
  type LyricWord,
  lyricId,
  roundedTime,
} from "./lyrics";

type RawLine = {
  start: number;
  end?: number;
  text: string;
  words?: { text: string; start: number; end?: number }[];
};
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function fromRaw(raw: RawLine[]): LyricLine[] {
  return raw
    .sort((a, b) => a.start - b.start)
    .flatMap((line, i, lines) => {
      if (!line.text.trim()) return [];
      const next = lines.slice(i + 1).find((n) => n.start > line.start)?.start;
      const fallback =
        line.start + Math.max(2, line.text.split(/\s+/u).length * 0.4);
      const end = Math.max(line.start + 0.01, line.end ?? next ?? fallback);
      const words: LyricWord[] = line.words?.length
        ? line.words.map((w, j, words) => ({
            id: lyricId(),
            text: w.text,
            start: w.start,
            end: Math.max(w.start + 0.001, w.end ?? words[j + 1]?.start ?? end),
            timing: "imported",
          }))
        : estimateWords(line.text, line.start, end);
      return [
        {
          id: lyricId(),
          start: Math.min(line.start, ...words.map((w) => w.start)),
          end: Math.max(end, ...words.map((w) => w.end)),
          words,
        },
      ];
    });
}

export function parseLrc(text: string): LyricLine[] {
  // LRC's positive offset makes text appear earlier, in milliseconds.
  const offset =
    Number(text.match(/\[offset:\s*([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const raw: RawLine[] = [];
  for (const row of text.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const stamps = [
      ...row.matchAll(/\[(\d+:\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)?)\]/gu),
    ];
    if (!stamps.length) continue;
    const body = row.slice(
      (stamps.at(-1)?.index ?? 0) + (stamps.at(-1)?.[0].length ?? 0),
    );
    const enhanced = [
      ...body.matchAll(/<(\d+:\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)?)>([^<]*)/gu),
    ];
    const firstStart = parseTime(stamps[0][1]) ?? 0;
    for (const stamp of stamps) {
      const start = parseTime(stamp[1]);
      if (start === null) continue;
      const shift = start - firstStart - offset;
      const words = enhanced.flatMap((m, i) => {
        const at = parseTime(m[1]);
        const until = enhanced[i + 1] ? parseTime(enhanced[i + 1][1]) : null;
        return at !== null && m[2].trim()
          ? [
              {
                text: m[2],
                start: roundedTime(at + shift),
                end: until === null ? undefined : roundedTime(until + shift),
              },
            ]
          : [];
      });
      // Some enhanced LRC uses the line timestamp for its first word.
      const prefix = enhanced.length ? body.slice(0, enhanced[0].index) : "";
      if (prefix.trim())
        words.unshift({
          text: prefix,
          start: roundedTime(start - offset),
          end: roundedTime((parseTime(enhanced[0][1]) ?? firstStart) + shift),
        });
      const plain = body.replace(/<[^>]*>/gu, "").trim();
      raw.push({
        start: roundedTime(start - offset),
        text: plain,
        words,
        end:
          enhanced.at(-1)?.[2].trim() === ""
            ? (parseTime(enhanced.at(-1)?.[1] ?? "") ?? start) + shift
            : undefined,
      });
    }
  }
  return fromRaw(raw);
}

export function parsePlainLyrics(
  text: string,
  start: number,
  duration: number,
): LyricLine[] {
  const rows = text
    .split(/\r?\n/u)
    .map((r) => r.trim())
    .filter(Boolean);
  const span = duration > 0 ? duration / Math.max(1, rows.length) : 3;
  return rows.map((text, i) => {
    const at = roundedTime(start + span * i),
      end = roundedTime(start + span * (i + 1));
    return {
      id: lyricId(),
      start: at,
      end,
      words: estimateWords(text, at, end),
    };
  });
}

export async function parseLyricsfile(text: string): Promise<LyricLine[]> {
  const { parse } = await import("yaml");
  const doc = record(parse(text, { maxAliasCount: 20, schema: "core" }));
  if (!Array.isArray(doc.lines))
    throw new Error("This lyrics file has no lines.");
  const raw: RawLine[] = doc.lines.map((entry: unknown) => {
    const line = record(entry);
    if (!finite(line.start_ms) || typeof line.text !== "string")
      throw new Error(
        "Each lyric line needs text and a valid start_ms timestamp.",
      );
    const words = Array.isArray(line.words)
      ? line.words.map((item: unknown) => {
          const word = record(item);
          if (!finite(word.start_ms) || typeof word.text !== "string")
            throw new Error(
              "A word in this file has an invalid timestamp or text.",
            );
          return {
            text: word.text,
            start: word.start_ms / 1000,
            end: finite(word.end_ms) ? word.end_ms / 1000 : undefined,
          };
        })
      : undefined;
    return {
      start: line.start_ms / 1000,
      end: finite(line.end_ms) ? line.end_ms / 1000 : undefined,
      text: line.text,
      words,
    };
  });
  return fromRaw(raw);
}

export function serializeLyrics(track: LyricTrack) {
  return JSON.stringify(
    { format: "sonora-lyrics", version: 1, track },
    null,
    2,
  );
}

export function parseSavedLyrics(text: string): LyricTrack {
  const saved = record(JSON.parse(text));
  if (saved.format !== "sonora-lyrics" || saved.version !== 1)
    throw new Error("This isn't a supported Sonora lyrics file.");
  const value = record(saved.track);
  if (!Array.isArray(value.lines))
    throw new Error("The lyrics file has no phrases.");
  const track = { ...EMPTY_LYRICS };
  const inRange = (
    key: "size" | "x" | "y" | "width" | "entrance",
    min: number,
    max: number,
  ) => {
    const n = value[key];
    if (finite(n)) track[key] = Math.max(min, Math.min(max, n));
  };
  inRange("size", 24, 150);
  inRange("x", 0, 1);
  inRange("y", 0, 1);
  inRange("width", 0.2, 1);
  inRange("entrance", 0, 1);
  for (const key of ["color", "accent"] as const)
    if (typeof value[key] === "string" && /^#[\da-f]{6}$/i.test(value[key]))
      track[key] = value[key];
  if (LYRIC_EFFECTS.some((e) => e.value === value.effect))
    track.effect = value.effect as LyricTrack["effect"];
  if (value.font === "sans" || value.font === "serif" || value.font === "mono")
    track.font = value.font;
  if (typeof value.enabled === "boolean") track.enabled = value.enabled;
  if (typeof value.backdrop === "boolean") track.backdrop = value.backdrop;
  if (typeof value.source === "string") track.source = value.source;
  if (
    typeof value.sourceUrl === "string" &&
    /^https:\/\/lrclib\.net\//u.test(value.sourceUrl)
  )
    track.sourceUrl = value.sourceUrl;
  track.lines = value.lines.map((entry: unknown) => {
    const line = record(entry);
    if (
      !finite(line.start) ||
      !finite(line.end) ||
      line.end <= line.start ||
      !Array.isArray(line.words) ||
      !line.words.length
    )
      throw new Error("A saved phrase has invalid timing or no words.");
    const words = line.words.map((item: unknown): LyricWord => {
      const word = record(item);
      if (
        typeof word.text !== "string" ||
        !word.text.trim() ||
        !finite(word.start) ||
        !finite(word.end) ||
        word.end <= word.start
      )
        throw new Error("A saved word has invalid text or timing.");
      return {
        id: lyricId(),
        text: word.text,
        start: word.start,
        end: word.end,
        timing:
          word.timing === "imported" || word.timing === "manual"
            ? word.timing
            : "estimated",
      };
    });
    return {
      id: lyricId(),
      start: Math.min(line.start, ...words.map((w) => w.start)),
      end: Math.max(line.end, ...words.map((w) => w.end)),
      words,
    };
  });
  return track;
}

export async function importLyrics(
  text: string,
  name: string,
  start: number,
  duration: number,
): Promise<LyricTrack> {
  if (
    name.endsWith(".json") ||
    text.trim().startsWith('{"format"') ||
    text.includes('"sonora-lyrics"')
  )
    return parseSavedLyrics(text);
  const lines =
    /\.ya?ml$/iu.test(name) || /^version:\s*["']?1/mu.test(text)
      ? await parseLyricsfile(text)
      : /\[\d+:\d/u.test(text)
        ? parseLrc(text)
        : parsePlainLyrics(text, start, duration);
  if (!lines.length)
    throw new Error(
      "No lyric text found. Paste one phrase per line, or import an LRC file.",
    );
  return { ...EMPTY_LYRICS, lines, source: name || "Pasted lyrics" };
}
