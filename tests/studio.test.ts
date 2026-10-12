import { describe, expect, test } from "bun:test";
import { formatTime, parseTime } from "../lib/media/time";
import { audioLevel } from "../lib/studio/audio";
import {
  capacity,
  dimensions,
  INITIAL_PROJECT,
  imageRect,
  LAYOUTS,
  layoutRects,
  pageCount,
  sceneAt,
  sceneCount,
  snapCutsToBeats,
  timelineCuts,
  updateCut,
} from "../lib/studio/model";

const slot = { x: 0, y: 0, width: 1080, height: 1350 };
describe("studio composition contracts", () => {
  test("all Fit edges stay in the slot at every size and extreme position", () => {
    for (const [w, h] of [
      [6000, 2000],
      [2000, 6000],
      [4000, 4000],
    ]) {
      for (const scale of [0.3, 0.65, 1])
        for (const x of [-1, 0, 1])
          for (const y of [-1, 0, 1]) {
            const rect = imageRect(w, h, slot, { fit: "fit", scale, x, y });
            expect(rect.x).toBeGreaterThanOrEqual(-1e-8);
            expect(rect.y).toBeGreaterThanOrEqual(-1e-8);
            expect(rect.x + rect.width).toBeLessThanOrEqual(slot.width + 1e-8);
            expect(rect.y + rect.height).toBeLessThanOrEqual(
              slot.height + 1e-8,
            );
          }
    }
  });
  test("Fill covers the slot even with extreme pan", () => {
    for (const [w, h] of [
      [6000, 2000],
      [2000, 6000],
    ])
      for (const scale of [1, 2, 3])
        for (const x of [-1, 1])
          for (const y of [-1, 1]) {
            const rect = imageRect(w, h, slot, { fit: "fill", scale, x, y });
            expect(rect.x).toBeLessThanOrEqual(0);
            expect(rect.y).toBeLessThanOrEqual(0);
            expect(rect.x + rect.width).toBeGreaterThanOrEqual(slot.width);
            expect(rect.y + rect.height).toBeGreaterThanOrEqual(slot.height);
          }
  });
  test("layouts have valid slots at all aspect ratios and spacing extremes", () => {
    for (const layout of LAYOUTS)
      for (const h of [608, 1080, 1350, 1440, 1920])
        for (const gap of [0, 120]) {
          const rects = layoutRects(layout.value, 1080, h, gap);
          expect(rects).toHaveLength(capacity(layout.value));
          for (const r of rects) {
            expect(r.width).toBeGreaterThan(0);
            expect(r.height).toBeGreaterThan(0);
          }
        }
  });
  test("connected page count follows spans, individual scenes follow layout capacity", () => {
    const photos = [{ span: 2 }, { span: 1 }, { span: 3 }];
    expect(pageCount({ ...INITIAL_PROJECT, connected: true }, photos)).toBe(6);
    expect(pageCount({ ...INITIAL_PROJECT, layout: "diptych" }, photos)).toBe(
      2,
    );
    expect(sceneCount({ ...INITIAL_PROJECT, layout: "diptych" }, photos)).toBe(
      2,
    );
  });
  test("matching covers retain feed dimensions when the main composition is a story", () => {
    const project = { ...INITIAL_PROJECT, mode: "story" as const };
    expect(dimensions(project).height).toBe(1920);
    expect(dimensions(project, "teaser").height).toBe(1920);
    expect(dimensions(project, "cover").height).toBe(1350);
  });
});

describe("exact music timing", () => {
  test("cuts preserve relative timing when the audio selection changes", () => {
    const project = { ...INITIAL_PROJECT, cuts: [0.25, 0.8] };
    expect(timelineCuts(project, 3)).toEqual([0, 0.25, 0.8, 1]);
    expect(sceneAt(project, 3, 2.5, 10).scene).toBe(1);
    expect(sceneAt(project, 3, 10, 10).scene).toBe(2);
    expect(sceneAt(project, 3, 5, 20).scene).toBe(1);
  });
  test("manual edits cannot cross adjacent scene boundaries", () => {
    const cuts = updateCut(INITIAL_PROJECT, 3, 1, 999, 12);
    expect(cuts[0]).toBeLessThan(cuts[1]);
    expect(cuts[0]).toBeCloseTo(2 / 3 - 1 / 720);
  });
  test("beat snapping uses absolute source time but stores selection-relative cuts", () => {
    const cuts = snapCutsToBeats(
      INITIAL_PROJECT,
      3,
      [31, 34.1, 37.9, 45],
      30,
      12,
    );
    expect(cuts[0]).toBeCloseTo(4.1 / 12);
    expect(cuts[1]).toBeCloseTo(7.9 / 12);
    expect(cuts[0]).toBeLessThan(cuts[1]);
  });
  test("transitions cannot overrun short scenes and do not run past the last photo", () => {
    const project = { ...INITIAL_PROJECT, transitionSeconds: 2 };
    expect(sceneAt(project, 3, 0.8, 3).mix).toBeCloseTo(0.6);
    expect(sceneAt(project, 3, 2.99, 3).mix).toBe(0);
  });
  test("audio envelopes interpolate and are silent outside the file", () => {
    const data = {
      duration: 1,
      rate: 2,
      bass: new Float32Array([0, 1]),
      energy: new Float32Array([0, 1]),
      percussion: new Float32Array([0, 1]),
      waveform: [],
      beats: [],
    };
    expect(audioLevel(data, 0.25, "bass")).toBe(0.5);
    expect(audioLevel(data, 1, "bass")).toBe(0);
    expect(audioLevel(data, -1, "bass")).toBe(0);
  });
});

test("fractional timestamps preserve the actual selection at millisecond precision", () => {
  for (const value of [0, 1.25, 33.125, 67.5, 3603.007])
    expect(parseTime(formatTime(value))).toBeCloseTo(value, 3);
  expect(parseTime("67")).toBe(67);
  expect(parseTime("1:07.5")).toBe(67.5);
  expect(parseTime("1:-5")).toBeNull();
  expect(parseTime("Infinity")).toBeNull();
  expect(parseTime("abc")).toBeNull();
  expect(formatTime(59.9999)).toBe("1:00.0");
});
