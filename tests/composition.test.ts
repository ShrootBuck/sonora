import assert from "node:assert/strict";
import { test } from "node:test";
import { drawBackdrop, resolveBackdrop } from "../lib/media/backdrop";
import {
  clampPan,
  clampZoom,
  DEFAULT_COMPOSITION,
  getImageRect,
  motionRenderSeconds,
  resetForMode,
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryVisual,
} from "../lib/media/composition";

test("Fit preserves every edge for wide, tall, and square photos at extreme drag positions", () => {
  for (const [width, height] of [
    [4096, 2304],
    [6000, 900],
    [900, 6000],
    [2048, 2048],
  ]) {
    for (const zoom of [0.3, 0.7, 1, 4]) {
      for (const pan of [-100000, 0, 100000]) {
        const position = clampPan(width, height, "fit", zoom, pan, -pan);
        const rect = getImageRect(
          width,
          height,
          "fit",
          zoom,
          position.panX,
          position.panY,
        );
        assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8);
        assert.ok(rect.x + rect.width <= STORY_WIDTH + 1e-8);
        assert.ok(rect.y + rect.height <= STORY_HEIGHT + 1e-8);
        assert.ok(Math.abs(rect.width / rect.height - width / height) < 1e-8);
      }
    }
  }
});

test("Fill keeps its zoom range and mode changes retain backdrop choices", () => {
  assert.equal(clampZoom("fill", 0.3), 1);
  assert.equal(clampZoom("fill", 4), 4);
  assert.equal(clampZoom("fit", 4), 1);
  const current = { ...DEFAULT_COMPOSITION, zoom: 0.5, panY: 100 };
  const fill = resetForMode(current, "fill");
  assert.equal(fill.zoom, 1);
  assert.equal(fill.panY, 0);
  assert.deepEqual(fill.backdrop, current.backdrop);
});

test("Abstract animation renders its full loop even though the foreground has no camera motion", () => {
  const visual: StoryVisual = {
    kind: "backdrop",
    foreground: new Blob(),
    backdrop: DEFAULT_COMPOSITION.backdrop,
    motionPreset: "none",
    motionStrength: 0,
    loopSeconds: 8,
  };
  assert.equal(motionRenderSeconds(visual, 75.5), 8);
  assert.equal(
    motionRenderSeconds(
      { ...visual, backdrop: { ...visual.backdrop, animated: false } },
      75.5,
    ),
    1,
  );
  assert.equal(
    motionRenderSeconds(
      { ...visual, backdrop: { ...visual.backdrop, style: "solid" } },
      75.5,
    ),
    1,
  );
  assert.equal(
    motionRenderSeconds(
      {
        kind: "composite",
        frame: new Blob(),
        motionPreset: "zoomin",
        motionStrength: 55,
        loopSeconds: 8,
      },
      75.5,
    ),
    75.5,
  );
});

function drawing(
  style: "glow" | "grain" | "swirl" | "liquid" | "solid",
  progress: number,
  animated = true,
  seed = 1,
) {
  const commands: unknown[] = [];
  const gradient = {
    addColorStop: (...args: unknown[]) => commands.push(["stop", ...args]),
  };
  const context = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args: unknown[]) => {
          for (const value of args)
            if (typeof value === "number") assert.ok(Number.isFinite(value));
          commands.push([key, ...args]);
          return gradient;
        },
      set: (_, key, value) => {
        commands.push([key, value === gradient ? "gradient" : value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  drawBackdrop(
    context,
    { ...DEFAULT_COMPOSITION.backdrop, style, grain: 0, animated, seed },
    progress,
  );
  return commands;
}

test("All abstract styles close the loop exactly and remain deterministic", () => {
  for (const style of ["glow", "grain", "liquid", "swirl", "solid"] as const) {
    assert.deepEqual(drawing(style, 0), drawing(style, 1));
    assert.deepEqual(drawing(style, 0.25), drawing(style, 0.25));
    assert.deepEqual(drawing(style, 0, false), drawing(style, 0.75, false));
    if (style !== "solid") {
      assert.notDeepEqual(drawing(style, 0), drawing(style, 0.25));
      assert.notDeepEqual(
        drawing(style, 0, true, 1),
        drawing(style, 0, true, 2),
      );
    }
  }
});

test("Custom palettes survive resolving, while From photo follows the selected image", () => {
  const colors: [string, string, string] = ["#112233", "#445566", "#778899"];
  assert.deepEqual(
    resolveBackdrop(DEFAULT_COMPOSITION.backdrop, colors).colors,
    colors,
  );
  const custom = { ...DEFAULT_COMPOSITION.backdrop, palette: "custom", colors };
  assert.deepEqual(
    resolveBackdrop(custom, ["#000000", "#ffffff", "#abcdef"]).colors,
    colors,
  );
});
