export type LyricEffect =
  | "fade"
  | "rise"
  | "pop"
  | "stamp"
  | "karaoke"
  | "spotlight";
export type LyricTiming = "imported" | "estimated" | "manual";
export type LyricWord = {
  id: string;
  text: string;
  start: number;
  end: number;
  timing: LyricTiming;
};
export type LyricLine = {
  id: string;
  start: number;
  end: number;
  words: LyricWord[];
};
export type LyricTrack = {
  enabled: boolean;
  lines: LyricLine[];
  source: string;
  sourceUrl?: string;
  effect: LyricEffect;
  font: "sans" | "serif" | "mono";
  size: number;
  x: number;
  y: number;
  width: number;
  color: string;
  accent: string;
  entrance: number;
  backdrop: boolean;
};
export const EMPTY_LYRICS: LyricTrack = {
  enabled: true,
  lines: [],
  source: "Your lyrics",
  effect: "rise",
  font: "sans",
  size: 64,
  x: 0.5,
  y: 0.72,
  width: 0.82,
  color: "#ffffff",
  accent: "#ffde8a",
  entrance: 0.18,
  backdrop: true,
};
export const LYRIC_EFFECTS: {
  value: LyricEffect;
  label: string;
  description: string;
}[] = [
  {
    value: "fade",
    label: "Fade",
    description: "Words appear softly and stay together until the phrase ends.",
  },
  {
    value: "rise",
    label: "Float",
    description: "Each word glides up into place with a soft landing.",
  },
  {
    value: "pop",
    label: "Pop",
    description: "Words spring into place with a little overshoot.",
  },
  {
    value: "stamp",
    label: "Stamp",
    description: "Each word lands with a quick tilt, like ink hitting paper.",
  },
  {
    value: "karaoke",
    label: "Karaoke",
    description:
      "Show the phrase, then sweep the accent color across each word.",
  },
  {
    value: "spotlight",
    label: "Solo",
    description:
      "One word at a time, large and centered. Its end time controls the hold.",
  },
];
export type TimingScope = "word" | "line" | "tail" | "all";
export const lyricId = () => crypto.randomUUID();
export const lineText = (line: LyricLine) =>
  line.words
    .map((w) => w.text)
    .join("")
    .trim();
export const roundedTime = (n: number) => Math.round(n * 1000) / 1000;

export function tokenizeLyrics(text: string): string[] {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (!normalized) return [];
  if (
    !normalized.includes(" ") &&
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized)
  ) {
    const parts: string[] = [];
    for (const segment of new Intl.Segmenter(undefined, {
      granularity: "word",
    }).segment(normalized)) {
      if (segment.isWordLike || !parts.length) parts.push(segment.segment);
      else parts[parts.length - 1] += segment.segment;
    }
    return parts;
  }
  return normalized.match(/\S+\s*/gu) ?? [];
}

/** Draft word boundaries are deliberately marked as estimates, never provider word sync. */
export function estimateWords(
  text: string,
  start: number,
  end: number,
): LyricWord[] {
  const tokens = tokenizeLyrics(text);
  const weights = tokens.map((t) => Math.max(1, Array.from(t.trim()).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = start;
  return tokens.map((text, i) => {
    const next =
      i === tokens.length - 1
        ? end
        : cursor + ((end - start) * weights[i]) / total;
    const word: LyricWord = {
      id: lyricId(),
      text,
      start: roundedTime(cursor),
      end: roundedTime(next),
      timing: "estimated",
    };
    cursor = next;
    return word;
  });
}

export function replaceLineText(line: LyricLine, text: string): LyricLine {
  const tokens = tokenizeLyrics(text);
  const estimates = estimateWords(text, line.start, line.end);
  // Text corrections keep existing boundaries when the number of words is unchanged.
  const words =
    tokens.length === line.words.length
      ? line.words.map((word, i) => ({ ...word, text: tokens[i] }))
      : estimates;
  return { ...line, words };
}

function withWordBounds(line: LyricLine, words: LyricWord[]): LyricLine {
  const lead = Math.min(
    0,
    line.start - Math.min(...line.words.map((w) => w.start)),
  );
  const hold = Math.max(
    0,
    line.end - Math.max(...line.words.map((w) => w.end)),
  );
  return {
    ...line,
    words,
    start: roundedTime(Math.min(...words.map((w) => w.start)) + lead),
    end: roundedTime(Math.max(...words.map((w) => w.end)) + hold),
  };
}

export function editWord(
  line: LyricLine,
  index: number,
  patch: Partial<Pick<LyricWord, "start" | "end" | "text">>,
): LyricLine {
  const word = line.words[index];
  if (!word) return line;
  const next = { ...word, ...patch, timing: "manual" as const };
  if (patch.start !== undefined && patch.end === undefined)
    next.end = Math.max(next.end, next.start + 0.01);
  else next.end = Math.max(next.start + 0.001, next.end);
  const words = line.words.map((w, i) => (i === index ? next : w));
  return withWordBounds(line, words);
}

/** Negative cue times are intentional: anchoring a late chorus to a trimmed local file
 * can move earlier verses before zero. Clamping them would destroy relative timing. */
export function shiftLyrics(
  lines: LyricLine[],
  lineId: string,
  wordIndex: number,
  delta: number,
  scope: TimingScope,
): LyricLine[] {
  const index = lines.findIndex((line) => line.id === lineId);
  if (index < 0 || !Number.isFinite(delta)) return lines;
  const shifted = (n: number) => roundedTime(n + delta);
  return lines.map((line, i) => {
    const whole =
      scope === "all" ||
      (scope === "line" && i === index) ||
      (scope === "tail" && i > index);
    if (whole)
      return {
        ...line,
        start: shifted(line.start),
        end: shifted(line.end),
        words: line.words.map((w) => ({
          ...w,
          start: shifted(w.start),
          end: shifted(w.end),
        })),
      };
    if (i !== index || (scope !== "word" && scope !== "tail")) return line;
    const words = line.words.map((w, j) =>
      (scope === "word" ? j === wordIndex : j >= wordIndex)
        ? {
            ...w,
            start: shifted(w.start),
            end: shifted(w.end),
            timing: "manual" as const,
          }
        : w,
    );
    return withWordBounds(line, words);
  });
}

export function splitLyricLine(
  lines: LyricLine[],
  lineId: string,
  wordIndex: number,
): LyricLine[] {
  return lines.flatMap((line) => {
    if (line.id !== lineId || wordIndex <= 0 || wordIndex >= line.words.length)
      return [line];
    const first = line.words.slice(0, wordIndex),
      second = line.words.slice(wordIndex);
    return [
      { ...line, end: Math.max(...first.map((w) => w.end)), words: first },
      {
        id: lyricId(),
        start: Math.min(...second.map((w) => w.start)),
        end: line.end,
        words: second,
      },
    ];
  });
}

export function joinLyricLine(lines: LyricLine[], lineId: string): LyricLine[] {
  const index = lines.findIndex((line) => line.id === lineId);
  if (index < 0 || index === lines.length - 1) return lines;
  const a = lines[index],
    b = lines[index + 1];
  const words = a.words.map((w, i) =>
    i === a.words.length - 1 ? { ...w, text: `${w.text.trimEnd()} ` } : w,
  );
  return [
    ...lines.slice(0, index),
    {
      ...a,
      start: Math.min(a.start, b.start),
      end: Math.max(a.end, b.end),
      words: [...words, ...b.words],
    },
    ...lines.slice(index + 2),
  ];
}

export function tapLyricWord(
  line: LyricLine,
  index: number,
  time: number,
): LyricLine {
  const changed = editWord(line, index, { start: roundedTime(time) });
  if (index === 0) return { ...changed, start: roundedTime(time) };
  const words = changed.words.map((w, i) =>
    i === index - 1
      ? {
          ...w,
          end: Math.max(w.start + 0.001, roundedTime(time)),
          timing: "manual" as const,
        }
      : w,
  );
  return { ...changed, words };
}

export function lyricEntrance(
  effect: LyricEffect,
  elapsed: number,
  duration: number,
) {
  const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  const ease = 1 - (1 - t) ** 3;
  const spring = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  return {
    opacity:
      elapsed < 0
        ? 0
        : effect === "fade" || effect === "rise"
          ? ease
          : Math.min(1, t * 5),
    y: effect === "rise" ? (1 - ease) * 0.45 : 0,
    scale:
      effect === "pop" || effect === "spotlight"
        ? 0.65 + spring * 0.35
        : effect === "stamp"
          ? 1 + (1 - ease) * 0.7
          : 1,
    rotation: effect === "stamp" ? (ease - 1) * 12 : 0,
  };
}
