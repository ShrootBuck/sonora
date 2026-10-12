<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sonora product context

This repository is **Sonora**, hosted at `sonora.party`. The old working name
was Vignette. Do not restore old names in copy, metadata, filenames, or downloads.

Sonora is a browser-only Instagram composition studio. One local photo collection
can become a Post, Carousel, or Story. The main tools are photo-dump formatting,
connected carousels, collages, music-timed photo sequences, audio-reactive
backdrops, and coordinated post/cover/story sets.

## Hard constraints

- All photo, audio, and video processing happens on the user's device.
- No media uploads, accounts, database, storage service, queue, or processing API.
- Users supply local audio. Do not add yt-dlp or music-download integrations.
- Do not impose artificial duration, collection-size, or file-size limits.
- Target modern Chrome/Chromium and Safari. Current Chromium on a modern Mac is
  the primary performance target; do not add speculative performance fallbacks.
- Story video remains 1080 × 1920 at 60 FPS. Never silently lower quality,
  resolution, or frame rate. Posts use a 1080-pixel-wide selected aspect ratio.
- Use mature packaged media libraries. Do not implement codecs, HEIC decoders,
  or a new canvas framework.
- This is a normal Next.js app with shadcn/ui, not a Sites project. Read
  `.agents/skills/shadcn/SKILL.md` before UI work and reuse existing primitives.

## Current editing model

- Post, Carousel, and Story share an ordered photo collection and style.
- Fit is the default and preserves the entire photo at 30–100% sizing. Dragging
  and position controls must keep every edge inside the photo's layout slot.
- Fill crops to cover its slot, with 100–300% sizing and bounded positioning.
- Layouts: Single, Diptych, Filmstrip, Contact sheet, Editorial, and Prints.
- Connected carousels allocate one to three slide widths per photo, with seam
  shifts and angles. Titles can cross the first seam. The swipe preview and
  numbered downloads must use identical coordinates.
- Colors, spacing, titles, subtitles, and typography are shared. Matching cover
  and story-teaser variants independently adjust layout, size, and text position.
- Story scenes group photos by layout capacity. Normalized cut positions retain
  relative timing when the user changes the selected audio range.
- Audio timestamps accept seconds and flexible colon notation with fractions.
  Do not replace them with coarse integer-only controls.
- Transitions are Cut, Dissolve, and Slide; collage photos can reveal in sequence.
- Motion presets: Still, Zoom In, Zoom Out, Breathe, Drift, Pulse, and Sway.
  Fill photos and Photo blur support camera motion. Abstract backdrops animate
  independently while the sharp Fit foreground remains stationary.
- Backdrops: Photo melt, Glow, Liquid, Swirl, Haze, Solid, and Photo blur. Keep
  photo-derived colors, optional palettes, animation, pace, intensity, detail,
  grain, dimming, and seeded pattern controls.
- Locally analyzed bass, percussion, or energy envelopes drive reactivity.
  The same source-audio timestamps must drive preview and export.
- Safe-zone/Instagram overlays are approximate editor-only guides. Never include
  them in downloaded media. Exporting or sharing does not publish to Instagram.

## Media architecture

- Konva owns the interactive composition, image exports, and video frames through
  `lib/studio/renderer.ts`. Keep one shared scene graph for preview/export.
- heic-to/libheif is the local fallback when native image decoding cannot read HEIC.
- Three.js Photo melt runs inside the Konva backdrop painter. Reuse the GPU
  painter across scene fields and dispose it on replacement and all exit paths.
- Mediabunny CanvasSource/WebCodecs is the visual encoder, requesting H.264 High
  Profile Level 4.2, quantizer 14, a 20 Mbps fallback bitrate, and 60 FPS.
- FFmpeg WASM trims audio, encodes 320 kbps / 48 kHz stereo AAC, and muxes with
  video stream copy. Let it select threading defaults. Do not rebuild a second
  visual renderer with custom FFmpeg camera filters or PNG chunk fallbacks.
- The published FFmpeg WASM release is distinct from desktop FFmpeg and cannot
  directly access desktop GPU/video encoders. Preserve native browser encoding.
- COOP/COEP headers enable the multithread core. When SharedArrayBuffer is absent,
  the single-thread core performs the same mux. Missing native H.264 support is
  an explicit error, never a silent quality downgrade.
- fflate packages ordered PNGs and matching sets locally.
- Clean up object URLs, stages, native encoders, GPU resources, and temporary
  FFmpeg files on success, failure, cancellation, and unmount. A failed/cancelled
  FFmpeg worker must not poison subsequent exports.
- Frame count is ceil(duration × 60). Fractional video duration may exceed exact
  audio duration by less than one video frame; keep the audio endpoint exact.

## Important files

- `components/sonora-studio.tsx`: main Post / Carousel / Story workspace.
- `components/studio-preview.tsx`: responsive interactive Konva preview lifecycle.
- `lib/studio/model.ts`: layout, framing, timeline, and variant definitions.
- `lib/studio/renderer.ts`: shared composition renderer.
- `lib/studio/audio.ts`: local waveform/envelope/beat analysis.
- `lib/studio/export.ts`: PNG, native video, ZIP, and matching-set exports.
- `components/audio-timeline.tsx`: waveform, playback, and exact audio selection.
- `components/backdrop-controls.tsx`: styles, palettes, and effect controls.
- `lib/media/backdrop.ts`, `backdrop-painter.ts`, `photo-melt.ts`: backdrop artwork.
- `lib/media/ffmpeg-client.ts`: worker lifecycle, audio trim, final mux, cancellation.
- `lib/media/load-image.ts`: browser decoding and HEIC support.
- `public/ffmpeg/`: self-hosted single-thread and multithread assets.
- `components/sonora-editor.tsx`, `story-canvas.tsx`, and
  `lib/media/native-video-loop.ts` retain the original single-photo editor and
  encoder adapter; the homepage uses the new studio.

## Verification expectations

After implementation work run:

```bash
bun test
bun run lint
bun run build
```

For media changes, also test the actual local browser with a real HEIC photo and
real audio. Check affected layouts, framing, motion, transitions, exact timestamps,
cancellation followed by retry, desktop/mobile layout, and downloaded outputs.
Use ffprobe to verify resolution, codec, frame rate, frame count, and audio timing.
Compile success alone does not verify media behavior. Remove temporary QA routes
before the final build. Keep local validation distinct from production deployment.
