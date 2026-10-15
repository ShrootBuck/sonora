import { parseLrc, parseLyricsfile, parsePlainLyrics } from "./lyric-import";
import { EMPTY_LYRICS, type LyricLine, type LyricTrack } from "./lyrics";

export type LyricResult = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  hasWordSync: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  lyricsfile?: string;
};

/** Metadata only. Audio stays on the device; no keys, account, proxy, or paid service. */
export async function searchLyrics(
  query: string,
  signal: AbortSignal,
): Promise<LyricResult[]> {
  const response = await fetch(
    `https://lrclib.net/api/search?${new URLSearchParams({ q: query.trim() })}`,
    {
      signal,
      headers: { "Lrclib-Client": "Sonora (https://sonora.party)" },
    },
  );
  if (!response.ok) {
    if (response.status === 429)
      throw new Error(
        "LRCLIB is receiving too many requests. Wait a moment, then try again, or paste your lyrics below.",
      );
    throw new Error(
      "LRCLIB isn't available right now. You can still paste or import lyrics.",
    );
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body))
    throw new Error(
      "LRCLIB returned an unexpected response. Try pasting lyrics instead.",
    );
  return body
    .filter(
      (r): r is LyricResult =>
        r &&
        typeof r.id === "number" &&
        typeof r.trackName === "string" &&
        typeof r.artistName === "string" &&
        Number.isFinite(r.duration),
    )
    .map((r) => ({
      ...r,
      albumName: typeof r.albumName === "string" ? r.albumName : "",
      plainLyrics: typeof r.plainLyrics === "string" ? r.plainLyrics : null,
      syncedLyrics: typeof r.syncedLyrics === "string" ? r.syncedLyrics : null,
      lyricsfile: typeof r.lyricsfile === "string" ? r.lyricsfile : undefined,
    }));
}

export async function lyricsFromResult(
  result: LyricResult,
): Promise<LyricTrack> {
  let lines: LyricLine[] = [];
  if (result.lyricsfile) {
    try {
      lines = await parseLyricsfile(result.lyricsfile);
    } catch {
      /* Older records can still supply ordinary LRC. */
    }
  }
  if (!lines?.length && result.syncedLyrics)
    lines = parseLrc(result.syncedLyrics);
  if (!lines?.length && result.plainLyrics)
    lines = parsePlainLyrics(result.plainLyrics, 0, result.duration);
  if (!lines?.length)
    throw new Error(
      result.instrumental
        ? "This recording is marked instrumental. Try another result, or write your own words."
        : "This result has no usable lyrics. Try another recording or paste the words.",
    );
  return {
    ...EMPTY_LYRICS,
    lines,
    source: `${result.trackName} · ${result.artistName}`,
    sourceUrl: `https://lrclib.net/api/get/${result.id}`,
  };
}
