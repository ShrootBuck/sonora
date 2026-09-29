<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sonora product context

This repository is **Sonora**, hosted at `sonora.party`. The old working name
was Vignette. Do not restore old names in product copy, package metadata, file
names, or generated downloads. The parent directory can keep its old name.

Sonora is a browser-only editor for **dynamic picture stories**:

1. The user selects one photo and one audio file.
2. The user frames the photo on a 9:16 canvas.
3. The user can add subtle, seamless motion.
4. The user selects an exact audio range.
5. Sonora exports a high-quality 1080 × 1920, 60 FPS MP4.

This is not only a tool that disguises a still image as a video. Motion and
effects are first-class product features. Keep a Still option, but do not make
the product direction static-only again.

## Hard constraints

- All photo, audio, and video processing must happen on the user's device.
- Do not add media uploads, server-side conversion, accounts, a database,
  object storage, a job queue, or a media-processing API.
- Do not add `yt-dlp`. Users supply their own local audio files.
- Do not add artificial duration or file-size limits. A device can run out of
  memory or fail, but Sonora must not reject a valid job because of a made-up
  product cap.
- Target current Chrome and Safari on modern desktop and mobile devices.
- The standard export is 1080 × 1920 at 60 FPS. Do not silently lower the frame
  rate, resolution, or quality as a performance shortcut.
- Use mature packaged libraries. Do not write a custom media codec, HEIC
  decoder, canvas framework, or FFmpeg replacement.
- This is a normal Next.js application with shadcn/ui. Do not migrate it to the
  Sites workflow. Before changing shadcn components, read
  `.agents/skills/shadcn/SKILL.md` and use the project's existing primitives.

## Current editing model

- **Fill** crops the photo to the full 9:16 canvas. Motion affects the complete
  image.
- **Fit** is the default, preserves the entire foreground photo, and supports
  30–100% sizing with drag bounds that keep every edge visible. Upper/center/lower
  placement controls complement dragging.
- Fit backdrops are Photo melt (default), Glow, Liquid, Swirl, Haze, Solid, and
  Photo blur. Colors default to the photo. Photo melt warps a 32 × 32 color field
  sampled locally from the image; other abstract effects use its extracted palette.
  Optional palettes/custom colors, animation, pace, intensity, detail, grain,
  dimming, and seeded pattern variations are available.
- Abstract backdrops animate independently; the sharp foreground stays stationary.
  Camera motion presets apply to Fill and Photo blur.
- Current motion presets are Still, Zoom In, Zoom Out, Breathe, Drift, Pulse,
  and Sway.
- Dynamic presets have adjustable intensity. Breathe, Drift, Pulse, and Sway
  use reusable 8, 6, or 4 second effect passes. Zoom In and Zoom Out render one
  camera move across the full selected audio range.
- The Konva preview is live. Safe-zone guides are editor-only and must never
  appear in the output.
- The audio editor supports exact flexible timestamps such as `0:33`, `67`, and
  `1:07.5`. Do not replace it with a coarse whole-second-only control.

## Media architecture

- `react-konva` and `konva` own the interactive 1080 × 1920 composition and
  export the visual layer or layers.
- `heic-to` / libheif provides the local HEIC fallback when the browser cannot
  decode HEIC natively.
- `mediabunny` and its `CanvasSource` are the primary visual encoder. They
  feed exact timestamped canvas frames into the browser's native WebCodecs H.264
  encoder and write the result as MP4.
- `@ffmpeg/ffmpeg` with self-hosted `@ffmpeg/core` and `@ffmpeg/core-mt` assets
  trims audio, repeats reusable compressed effects, and muxes the final MP4.
  FFmpeg also remains the visual fallback when native H.264 is unavailable.
- `next.config.ts` sends COOP and COEP headers so supported browsers can use
  `SharedArrayBuffer` and the multithreaded FFmpeg core. Sonora falls back to the
  single-thread core when isolation or threads are unavailable.

Abstract backdrops use the same painter for preview, native encoding, and the
FFmpeg fallback. Photo melt uses a lazily loaded Three.js WebGL renderer inside
Konva; it does not replace Konva. The fallback uses bounded batches of lossless
PNG frames and concatenates their CRF 14 H.264 chunks. Dispose GPU resources and
delete temporary FFmpeg files on success, error, and cancellation.

The exporter encodes Still as one reusable second. Breathe, Drift, Pulse, and
Sway encode one 4, 6, or 8 second effect pass, then FFmpeg repeats the compressed
stream while it trims and muxes audio. Zoom In and Zoom Out instead encode a
single continuous move across the full selected audio duration.

The native visual encoder requests H.264 High Profile Level 4.2, quantizer 14,
and a 20 Mbps fallback bitrate. The FFmpeg visual fallback uses CRF 14, yuv420p,
BT.709 metadata, and a 60 FPS time base. Final audio is 320 kbps / 48 kHz stereo
AAC. Changes can improve compatibility or quality, but they must not quietly
degrade the default output.

## Important files

- `components/sonora-editor.tsx`: editor workflow and controls.
- `components/story-canvas.tsx`: Konva preview, framing, motion, and layer
  export.
- `components/audio-timeline.tsx`: waveform and exact audio selection.
- `lib/media/composition.ts`: shared composition, backdrop, and motion types.
- `components/backdrop-controls.tsx`: backdrop styles, palettes, and controls.
- `lib/media/backdrop.ts`: photo color extraction and vector effect artwork.
- `lib/media/backdrop-painter.ts`: shared painter used by preview and both encoders.
- `lib/media/photo-melt.ts`: Three.js shader for image-derived fluid color.
- `lib/media/ffmpeg-client.ts`: FFmpeg loading, loop encoding, and final mux.
- `lib/media/native-video-loop.ts`: Mediabunny/WebCodecs 60 FPS loop encoding.
- `lib/media/load-image.ts`: browser image loading and HEIC fallback.
- `public/ffmpeg/`: self-hosted single-thread and multithread FFmpeg assets.

## Verification expectations

Run both of these after implementation work:

```bash
bun run lint
bun run build
```

For media changes, also test the actual local app with at least one real HEIC
photo and one real audio file. Verify exact audio timestamps, each affected
motion/framing mode, cancellation, and the output with `ffprobe` when practical.
Compile success alone is not enough for FFmpeg filter changes.
