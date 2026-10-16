import Konva from "konva";
import {
  type LyricLine,
  type LyricTrack,
  type LyricWord,
  lyricEntrance,
} from "./lyrics";
import { TYPEFACES } from "./options";

type WordNode = {
  group: Konva.Group;
  highlight?: Konva.Group;
  word: LyricWord;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** All animation is a function of source-audio time, including random-looking tilts.
 * Seeking backwards and exporting the same frame produce exactly the same scene. */
export function createLyricRenderer(
  layer: Konva.Layer,
  track: LyricTrack,
  width: number,
  height: number,
) {
  const root = new Konva.Group({ listening: false });
  layer.add(root);
  const fontFamily =
    TYPEFACES.find((f) => f.value === track.font)?.font ?? "Arial";
  let key = "";
  let nodes: ReturnType<typeof build>[] = [];

  function build(line: LyricLine, words: LyricWord[]) {
    const fontSize =
      track.effect === "spotlight" ? track.size * 1.45 : track.size;
    const maxWidth = width * track.width;
    const rowHeight = fontSize * 1.32;
    const measure = new Konva.Text({
      fontFamily,
      fontSize,
      fontStyle: track.font === "sans" ? "bold" : "normal",
    });
    const space = measure.measureSize(" ").width;
    const rows: { word: LyricWord; width: number; gap: number }[][] = [[]];
    let rowWidth = 0;
    for (const word of words) {
      const wordWidth = Math.max(
        1,
        measure.measureSize(word.text.trim()).width,
      );
      const gap = /\s$/u.test(word.text) ? space : 0;
      if (rowWidth + wordWidth > maxWidth && rows.at(-1)?.length) {
        rows.push([]);
        rowWidth = 0;
      }
      rows.at(-1)?.push({ word, width: wordWidth, gap });
      rowWidth += wordWidth + gap;
    }
    measure.destroy();
    const boxWidth = Math.max(
      ...rows.map((row) =>
        row.reduce(
          (sum, w, i) => sum + w.width + (i < row.length - 1 ? w.gap : 0),
          0,
        ),
      ),
      1,
    );
    const boxHeight = rows.length * rowHeight;
    const group = new Konva.Group();
    root.add(group);
    const backing = track.backdrop
      ? new Konva.Rect({
          x: -boxWidth / 2 - 24,
          y: -14,
          width: boxWidth + 48,
          height: boxHeight + 28,
          fill: "#101014",
          opacity: 0.72,
          cornerRadius: 22,
        })
      : undefined;
    if (backing) group.add(backing);
    const wordNodes: WordNode[] = [];
    rows.forEach((row, rowIndex) => {
      const lineWidth = row.reduce(
        (sum, w, i) => sum + w.width + (i < row.length - 1 ? w.gap : 0),
        0,
      );
      let x = -lineWidth / 2;
      for (const item of row) {
        const y = rowIndex * rowHeight;
        const wordGroup = new Konva.Group({
          x: x + item.width / 2,
          y: y + rowHeight / 2,
          offsetX: item.width / 2,
          offsetY: rowHeight / 2,
        });
        const textOptions = {
          text: item.word.text.trim(),
          fontSize,
          fontFamily,
          fontStyle: track.font === "sans" ? "bold" : "normal",
          height: rowHeight,
          padding: 0,
          wrap: "none",
          verticalAlign: "middle",
          fill: track.color,
          shadowColor: "#000000",
          shadowOpacity: 0.55,
          shadowBlur: 10,
          shadowOffsetY: 3,
        };
        wordGroup.add(
          new Konva.Text({
            ...textOptions,
            opacity: track.effect === "karaoke" ? 0.45 : 1,
          }),
        );
        let highlight: Konva.Group | undefined;
        if (track.effect === "karaoke") {
          highlight = new Konva.Group({
            clipX: -2,
            clipY: -8,
            clipWidth: 0,
            clipHeight: rowHeight + 16,
          });
          highlight.add(new Konva.Text({ ...textOptions, fill: track.accent }));
          wordGroup.add(highlight);
        }
        group.add(wordGroup);
        wordNodes.push({
          group: wordGroup,
          highlight,
          word: item.word,
          x: x + item.width / 2,
          y: y + rowHeight / 2,
          width: item.width,
          height: rowHeight,
        });
        x += item.width + item.gap;
      }
    });
    const fit = Math.min(1, maxWidth / (boxWidth + (track.backdrop ? 48 : 0)));
    group.scale({ x: fit, y: fit });
    return {
      line,
      group,
      words: wordNodes,
      backing,
      height: boxHeight * fit,
      width: boxWidth * fit,
    };
  }

  return {
    draw(sourceTime: number) {
      if (!track.enabled) {
        root.hide();
        return;
      }
      const active = track.lines.filter(
        (line) => sourceTime >= line.start && sourceTime < line.end,
      );
      const content = active
        .map((line) => ({
          line,
          words:
            track.effect === "spotlight"
              ? line.words
                  .filter((w) => sourceTime >= w.start && sourceTime < w.end)
                  .slice(-1)
              : line.words,
        }))
        .filter((entry) => entry.words.length);
      const nextKey = content
        .map(
          ({ line, words }) =>
            `${line.id}:${track.effect === "spotlight" ? words[0].id : "all"}`,
        )
        .join("|");
      if (nextKey !== key) {
        key = nextKey;
        root.destroyChildren();
        const built = content.map(({ line, words }) => build(line, words));
        const total = built.reduce((sum, line) => sum + line.height + 24, -24);
        const fit = Math.min(1, (height * 0.85) / Math.max(1, total));
        root.scale({ x: fit, y: fit });
        const maxWidth = Math.max(...built.map((line) => line.width), 0) * fit;
        root.position({
          x: Math.max(
            maxWidth / 2 + 24,
            Math.min(width - maxWidth / 2 - 24, width * track.x),
          ),
          y: Math.max(
            (total * fit) / 2 + 24,
            Math.min(height - (total * fit) / 2 - 24, height * track.y),
          ),
        });
        let y = -total / 2;
        for (const line of built) {
          line.group.y(y);
          y += line.height + 24;
        }
        nodes = built;
      }
      root.visible(content.length > 0);
      root.moveToTop();
      for (const entry of nodes) {
        entry.group.opacity(Math.min(1, (entry.line.end - sourceTime) / 0.08));
        let visibleOpacity = 0;
        for (const node of entry.words) {
          const pose = lyricEntrance(
            track.effect,
            sourceTime - node.word.start,
            track.entrance,
          );
          node.group.opacity(track.effect === "karaoke" ? 1 : pose.opacity);
          visibleOpacity = Math.max(visibleOpacity, node.group.opacity());
          node.group.position({ x: node.x, y: node.y + pose.y * track.size });
          node.group.scale({ x: pose.scale, y: pose.scale });
          node.group.rotation(pose.rotation);
          node.highlight?.clipWidth(
            (node.width + 4) *
              Math.max(
                0,
                Math.min(
                  1,
                  (sourceTime - node.word.start) /
                    Math.max(0.001, node.word.end - node.word.start),
                ),
              ),
          );
        }
        // The backing follows the words instead of flashing an empty plate
        // at the phrase boundary or while waiting for its first word.
        entry.backing?.opacity(0.72 * visibleOpacity);
      }
    },
  };
}
