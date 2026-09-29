# Sonora

Sonora turns one photo and one audio file into a dynamic 1080 × 1920, 60 FPS
picture story. The editor runs at [sonora.party](https://sonora.party), but the
user's media never leaves their browser.

## What it does

- Loads HEIC, HEIF, JPEG, PNG, WebP, and other browser-supported images.
- Defaults to Fit, keeping every edge of a wide, square, or tall photo visible.
  Resize from 30–100%, drag within the canvas, or choose upper/center/lower placement.
  Fill remains available for a full-bleed crop.
- Fills the surrounding space with Photo melt, Glow, Liquid, Swirl, Haze, Solid,
  or the original adjustable Photo blur.
- Defaults to colors from the photo. Photo melt warps a locally sampled color
  field from the actual image; other abstract effects use its extracted palette.
  Optional palettes and custom colors let you change the mood.
- Controls backdrop animation, pace, intensity, detail, grain, dimming, and pattern
  variations. The sharp foreground stays stationary in Fit.
- Retains Still, Zoom In, Zoom Out, Breathe, Drift, Pulse, and Sway camera motion
  for Fill and Photo blur. Story safe-zone guides are editor-only.
- Decodes an audio file locally, draws its waveform, and accepts exact start/end
  timestamps.
- Exports high-quality 60 FPS H.264 video with 320 kbps AAC audio in an MP4
  container.
- Downloads or opens the finished file in the device share sheet.

Sonora does not add a duration or file-size policy. A large job can still exceed
the device's memory or WebAssembly's platform limits; that is a real browser limit,
not a product restriction.

## Architecture

All media work is client-side:

- **React Konva** owns the interactive canvas, live motion preview, and exact
  1080 × 1920 visual layers.
- **Three.js** renders Photo melt's periodic shader into a canvas used by Konva.
  It warps a soft 32 × 32 color sample, never the full-resolution foreground.
  The final shader, composition, and export still render at 1080 × 1920.
  The other abstract effects draw vector artwork through Konva's scene function.
- **Mediabunny** feeds exact timestamped canvas frames into the browser's native
  WebCodecs H.264 encoder and writes the reusable visual loop as MP4. This is the
  primary path and can use hardware acceleration supplied by the browser.
- **ffmpeg.wasm** trims the selected audio, repeats the already-compressed visual
  loop with stream copy, and muxes the final MP4. If native H.264 encoding is not
  available, Sonora can still encode the loop with FFmpeg. It tries the
  multithreaded core first when cross-origin isolation and `SharedArrayBuffer` are
  available, then falls back to the much slower single-thread core.
- **heic-to / libheif** is the fallback HEIC decoder when the browser cannot decode
  a photo natively.

There are no accounts, database, uploads, object storage, job queue, or media API.
The Next.js server only delivers the app and its self-hosted WebAssembly assets.

Static stories encode one reusable second at 60 FPS. Dynamic stories encode one
seamless 4, 6, or 8 second 60 FPS effect loop based on the selected speed. The
native path requests H.264 High Profile Level 4.2 with quantizer 14 and a 20 Mbps
fallback bitrate. The FFmpeg video fallback uses CRF 14. Abstract backdrops use
exactly the same painter in the preview and both encoders. The fallback encodes
30 lossless PNG frames at a time, then concatenates compressed chunks, bounding
working memory without lowering resolution or frame rate. Zoom In and Zoom Out
render one continuous move over the selected duration. The final file uses a 320
kbps AAC audio track. The final pass repeats the compressed loop with stream copy
and muxes the selected audio, so a long song does not force Sonora to re-encode
the same visual cycle over and over.

## Local development

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
bun test
bun run lint
bun run build
```

The COOP and COEP response headers in `next.config.ts` are required for the
multithreaded encoder. Keep both FFmpeg cores under `public/ffmpeg`: current Chrome
and Safari can then use the fastest path their security model permits.

## Browser target

Sonora targets the current stable versions of Chrome and Safari on modern desktop
and mobile devices. Export speed depends heavily on CPU, memory, browser, source
format, and clip length. The single-thread fallback is intentionally slower but
more compatible.

Photo melt requires WebGL. If it is unavailable, the editor explains how to choose
another backdrop. Other styles, the photo, and the audio remain usable.
