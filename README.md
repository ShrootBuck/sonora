# Sonora

A browser-only studio for Instagram posts, carousels, and dynamic picture stories.
Your photos and audio stay on your device. There are no accounts or uploads.

## Make something

1. Add a collection of photos (including HEIC/HEIF).
2. Choose **Post**, **Carousel**, or **Story**. Your collection and style carry across.
3. Pick a layout and treatment. Select a photo to adjust its framing, or drag it
   directly in the preview. Fit preserves every edge; Fill crops to the slot.
4. Export a PNG, numbered carousel PNGs in a ZIP, or a 60 FPS MP4.

### Posts and photo dumps

- 4:5, 3:4, square, landscape, and 9:16 canvases, at 1080 pixels wide.
- Shared paper, film, color, and unframed treatments; spacing and custom colors.
- Single images, diptychs, filmstrips, contact sheets, editorial layouts, and prints.
- Individual Fit/Fill, size and positioning, with an apply-to-all action.
- Drag to reorder on desktop; earlier/later buttons also work on touch devices.
- Optional titles, small print, three type styles, and adjustable size/position.

### Connected carousels

Switch Carousel to **Connected strip**, then let a photo span one, two, or three
slides in the Photo panel. Shift and angle images across seams, or place a title
across the first boundary. Scrub the swipe preview. Downloads are sliced and
numbered in posting order.

### Stories and sound

- Multiple scenes, precise audio trim, and editable scene-change timestamps.
- Flexible time input: `67`, `1:07.5`, `0:33.125`, or `1:02:03`.
- Cut, dissolve, and slide transitions; optional staggered collage reveals.
- Still, Zoom In/Out, Breathe, Drift, Pulse, and Sway camera motion.
- Photo melt, Glow, Liquid, Swirl, Haze, Solid, and Photo blur backdrops, using
  photo-derived colors or an adjustable palette.
- Local analysis of bass, percussion, and energy drives background reactivity.
  Beat snapping finds nearby detected attacks; manual timing remains editable.
- Optional audio: silent stories use an editable duration with no imposed cap.
- Video stays at 1080 × 1920, 60 FPS, H.264 High Profile; audio is AAC at
  320 kbps, 48 kHz stereo. A fractional final video frame can extend by less than
  1/60 second beyond the selected audio endpoint.

### Lyrics

Open **Lyrics** to search LRCLIB for free, paste one phrase per line, or import
LRC, enhanced LRC, lyricsfile YAML, or saved Sonora edits. Lookup sends only the
search text to LRCLIB; media stays on your device. No API key or paid service is
used. Catalog coverage varies. Line-synced and untimed lyrics get clearly marked
word timing estimates that you can replace by ear.

Select a word, seek to its onset, and **Align this word to playhead**. This shifts
the whole lyric track while preserving its relative timing. Word times use the
original audio file's clock and do not stretch when you trim the story.

- Drag word blocks or their edges, type millisecond timestamps, or tap along.
- Nudge one word, one phrase, everything from the selected word, or all lyrics.
- Loop a phrase and listen at 0.5× or 0.75×; exports use normal playback speed.
- Edit text, split/join phrases, hold an ending, and undo or redo changes.
- Choose Fade, Float, Pop, Stamp, Karaoke, or Solo; adjust type, colors, size,
  entrance duration, placement, and backing. Preview and export share the renderer.
- Save the lyric edits as a local JSON file and import it to resume later. This
  saves timing and appearance, not your audio or photos.

Lyrics appear in stories and story teasers, and stay out of feed posts and covers.

### Matching sets

Adjust **Composition**, **Story teaser**, and **Cover** in the preview tabs.
Each variant has its own layout, composition size, and text placement, while
colors and typography stay shared. A matching-set ZIP includes all carousel
slides, a cover, and a still or animated 9:16 teaser.

Instagram overlays are approximate placement guides, not a guarantee of every
Instagram surface or device's crop. Guides never enter the exported artwork.
Downloads and device sharing do not publish to Instagram. Edits live in the
current browser tab; reloading clears the collection.

## Media architecture

- **Konva** owns composition, clipping, dragging, typography, transitions, and
  image exports. `lib/studio/renderer.ts` supplies the same scene graph to the
  live preview and every exported frame.
- **heic-to / libheif** decodes HEIC locally when the browser cannot.
- **Three.js** supplies Photo melt through the shared backdrop painter. One GPU
  painter updates its sampled photo field as scenes change, and is disposed when
  the renderer is replaced, completed, or cancelled.
- **Web Audio** analyzes decoded samples locally. Preview and export interpolate
  the same stored envelopes, indexed by exact source-audio timestamps.
- **Mediabunny / WebCodecs** encode exact timestamped canvas frames using the
  browser's H.264 encoder. Requests use High Profile Level 4.2, quantizer 14 and a
  20 Mbps fallback bitrate, preserving the existing quality target.
- **FFmpeg WASM** trims audio, encodes AAC, and muxes the already-compressed video
  with stream copy. It does not redraw the composition or run a second video
  encoding pipeline. FFmpeg chooses its codec threading defaults. The current
  published `@ffmpeg/ffmpeg` and core releases are used; these are distinct from
  desktop FFmpeg versions and do not expose desktop hardware encoders.
- The multithread core loads when cross-origin isolation and SharedArrayBuffer
  are available; otherwise the single-thread build runs the same mux operation.
  Unsupported native H.264 produces an explicit error instead of silently
  lowering quality or launching a separate compatibility video renderer.
- **fflate** packages numbered PNGs and coordinated sets locally.

FFmpeg workers are reused between successful exports. Temporary files are
removed afterward; failures or cancellation discard the worker so the next
export starts cleanly. Native encoders, GPU painters, object URLs, and preview
stages have explicit cleanup. Exports are cancellable, including ZIP packaging.
No artificial file-size or duration limits are imposed. Device memory and
browser limits still apply.

## Development

```bash
bun install
bun dev
```

Visit [localhost:3000](http://localhost:3000).

```bash
bun test
bun run lint
bun run build
```

Tests cover framing bounds, layout geometry, timeline ordering, beat snapping,
source-audio envelope sampling, and backdrop determinism. For media changes,
exercise the real browser with HEIC and audio, download files, and check the
resulting MP4 with `ffprobe`. Cancellation must be followed by a successful new
export. Verify both desktop and narrow touch layouts.

`next.config.ts` supplies COOP/COEP headers. Keep the self-hosted FFmpeg assets
under `public/ffmpeg/`. Current Chrome/Chromium is the primary validation target;
current Safari is also a browser target and must expose the requested native
H.264 configuration to export video.
