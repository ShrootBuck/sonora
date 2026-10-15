import { describe, expect, test } from "bun:test";
import {
  parseLrc,
  parseLyricsfile,
  parsePlainLyrics,
  parseSavedLyrics,
  serializeLyrics,
} from "../lib/studio/lyric-import";
import { lyricsFromResult, searchLyrics } from "../lib/studio/lyric-provider";
import {
  EMPTY_LYRICS,
  editWord,
  joinLyricLine,
  LYRIC_EFFECTS,
  lineText,
  lyricEntrance,
  replaceLineText,
  shiftLyrics,
  splitLyricLine,
  tapLyricWord,
} from "../lib/studio/lyrics";

describe("lyric imports", () => {
  test("LRC honors repeated timestamps, fractional precision, offsets, and blank instrumental boundaries", () => {
    const lines = parseLrc(
      "[ar:Artist]\n[offset:200]\n[00:02.125][00:12.125]Small bright words\n[00:05.500]\n[00:16.800]Last line",
    );
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.start)).toEqual([1.925, 11.925, 16.6]);
    expect(lines[0].end).toBe(5.3);
    expect(lineText(lines[1])).toBe("Small bright words");
    expect(lines[0].words.every((w) => w.timing === "estimated")).toBe(true);
  });
  test("enhanced LRC keeps supplied word starts and a final end marker", () => {
    const [line] = parseLrc(
      "[00:02.00]<00:02.00>Small <00:02.45>bright <00:03.12>words<00:04.90>",
    );
    expect(line.words.map((w) => w.start)).toEqual([2, 2.45, 3.12]);
    expect(line.words.map((w) => w.end)).toEqual([2.45, 3.12, 4.9]);
    expect(lineText(line)).toBe("Small bright words");
    expect(line.end).toBe(4.9);
  });
  test("enhanced LRC can use the line timestamp for its first word", () => {
    const [line] = parseLrc(
      "[00:02.00]Small <00:02.45>bright <00:03.12>words<00:04.90>",
    );
    expect(lineText(line)).toBe("Small bright words");
    expect(line.words.map((w) => w.start)).toEqual([2, 2.45, 3.12]);
    expect(line.words.map((w) => w.end)).toEqual([2.45, 3.12, 4.9]);
  });
  test("lyricsfile preserves actual word spacing and explicit overlapping boundaries", async () => {
    const [line] = await parseLyricsfile(
      'version: "1.0"\nlines:\n  - text: "two words"\n    start_ms: 1250\n    end_ms: 4000\n    words:\n      - {text: "two ", start_ms: 1250, end_ms: 3000}\n      - {text: "words", start_ms: 2000, end_ms: 3500}',
    );
    expect(line.start).toBe(1.25);
    expect(line.end).toBe(4);
    expect(line.words[0].end).toBe(3);
    expect(line.words[1].start).toBe(2);
    expect(lineText(line)).toBe("two words");
    await expect(
      parseLyricsfile("lines: [{text: broken, start_ms: nope}]"),
    ).rejects.toThrow();
  });
  test("plain words get explicitly estimated timing inside the chosen audio slice", () => {
    const lines = parsePlainLyrics("first phrase\nsecond phrase", 65.25, 6.5);
    expect(lines[0].start).toBe(65.25);
    expect(lines[1].end).toBe(71.75);
    expect(
      lines.flatMap((l) => l.words).every((w) => w.timing === "estimated"),
    ).toBe(true);
  });
  test("saved edits round-trip negative cue times, holds, and appearance; malformed data is rejected", () => {
    const track = {
      ...EMPTY_LYRICS,
      effect: "stamp" as const,
      size: 86,
      lines: parsePlainLyrics("hello there", -1, 4),
    };
    const result = parseSavedLyrics(serializeLyrics(track));
    expect(result.effect).toBe("stamp");
    expect(result.size).toBe(86);
    expect(result.lines[0].start).toBe(-1);
    expect(result.lines[0].end).toBe(3);
    expect(lineText(result.lines[0])).toBe("hello there");
    const saved = JSON.parse(serializeLyrics(track));
    saved.track.lines[0].words[0].end = -99;
    expect(() => parseSavedLyrics(JSON.stringify(saved))).toThrow();
  });
});

describe("manual synchronization", () => {
  test("one anchor shifts the entire song without clamping or disturbing relative intervals", () => {
    const original = parsePlainLyrics("verse words\nchorus words", 0, 80);
    const chorus = original[1],
      delta = 3.123 - chorus.words[0].start;
    const moved = shiftLyrics(original, chorus.id, 0, delta, "all");
    expect(moved[1].words[0].start).toBe(3.123);
    expect(moved[0].start).toBeLessThan(0);
    expect(moved[1].start - moved[0].start).toBeCloseTo(
      original[1].start - original[0].start,
      3,
    );
    expect(original[1].start).toBe(40);
  });
  test("word, phrase, and from-here edits have different scopes", () => {
    const lines = parsePlainLyrics("one two three\nfour five", 10, 12);
    const id = lines[0].id;
    const word = shiftLyrics(lines, id, 1, 0.123, "word");
    expect(word[0].words[0]).toEqual(lines[0].words[0]);
    expect(word[0].words[1].start).toBeCloseTo(lines[0].words[1].start + 0.123);
    expect(word[1]).toEqual(lines[1]);
    const phrase = shiftLyrics(lines, id, 1, 1, "line");
    expect(phrase[0].start).toBe(11);
    expect(phrase[1]).toEqual(lines[1]);
    const tail = shiftLyrics(lines, id, 1, 1, "tail");
    expect(tail[0].words[0]).toEqual(lines[0].words[0]);
    expect(tail[1].start).toBe(lines[1].start + 1);
  });
  test("text corrections and split/join preserve tuned boundaries", () => {
    const [line] = parsePlainLyrics("one two three", 5, 3);
    const corrected = replaceLineText(line, "one TWO three");
    expect(corrected.words.map((w) => [w.start, w.end])).toEqual(
      line.words.map((w) => [w.start, w.end]),
    );
    const split = splitLyricLine([corrected], line.id, 1);
    expect(split).toHaveLength(2);
    const joined = joinLyricLine(split, line.id);
    expect(joined[0].words).toEqual(corrected.words);
    expect(lineText(joined[0])).toBe("one TWO three");
  });
  test("tap timings close the preceding word, and explicit ends can extend a phrase", () => {
    const [line] = parsePlainLyrics("one two three", 5, 3);
    const tapped = tapLyricWord(line, 1, 6.257);
    expect(tapped.words[0].end).toBe(6.257);
    expect(tapped.words[1].start).toBe(6.257);
    const held = editWord(tapped, 2, { end: 11.675 });
    expect(held.end).toBe(11.675);
    expect(held.words[2].timing).toBe("manual");
  });
  test("a manual phrase hold survives word nudges and endpoint edits", () => {
    const [line] = parsePlainLyrics("one two", 10, 2);
    line.end = 14;
    const shifted = shiftLyrics([line], line.id, 0, 0.05, "word")[0];
    expect(shifted.end).toBe(14);
    const edited = editWord(shifted, 1, { end: 13 });
    expect(edited.end).toBe(15);
  });
  test("entrances are deterministic under seeking, hide future words, and settle without a wall clock", () => {
    for (const { value } of LYRIC_EFFECTS) {
      expect(lyricEntrance(value, -0.1, 0.2).opacity).toBe(0);
      const frame = lyricEntrance(value, 0.1, 0.2);
      lyricEntrance(value, 100, 0.2);
      expect(lyricEntrance(value, 0.1, 0.2)).toEqual(frame);
      expect(lyricEntrance(value, 1, 0.2)).toEqual({
        opacity: 1,
        y: 0,
        scale: 1,
        rotation: 0,
      });
      expect(lyricEntrance(value, 0, 0).opacity).toBe(1);
    }
  });
});

describe("free lookup", () => {
  test("an invalid word file can fall back to LRC, without pretending it has word sync", async () => {
    const track = await lyricsFromResult({
      id: 1,
      trackName: "Test",
      artistName: "Artist",
      albumName: "",
      duration: 10,
      instrumental: false,
      hasWordSync: true,
      lyricsfile: "bad: yaml",
      plainLyrics: null,
      syncedLyrics: "[00:02.000]one two",
    });
    expect(track.lines[0].words[0].timing).toBe("estimated");
    expect(track.lines[0].start).toBe(2);
  });
  test("lookup only sends the search query and handles rate limiting", async () => {
    const original = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response("busy", { status: 429 });
    }) as typeof fetch;
    try {
      await expect(
        searchLyrics("test song", new AbortController().signal),
      ).rejects.toThrow("too many requests");
      expect(requested).toBe("https://lrclib.net/api/search?q=test+song");
    } finally {
      globalThis.fetch = original;
    }
  });
});
