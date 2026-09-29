"use client";

import {
  ActivityIcon,
  CircleIcon,
  DownloadIcon,
  ImageIcon,
  MaximizeIcon,
  MoveIcon,
  RotateCcwIcon,
  Share2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  WandSparklesIcon,
  WavesIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioTimeline } from "@/components/audio-timeline";
import { BackdropControls } from "@/components/backdrop-controls";
import { FileDrop } from "@/components/file-drop";
import { StoryCanvas, type StoryCanvasHandle } from "@/components/story-canvas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  extractPhotoColors,
  extractPhotoField,
  resolveBackdrop,
} from "@/lib/media/backdrop";
import {
  type CompositionMode,
  type CompositionSettings,
  clampPan,
  clampZoom,
  DEFAULT_COMPOSITION,
  FULL_DURATION_PRESETS,
  getImageRect,
  type MotionPreset,
  type MotionSpeed,
  resetForMode,
  STORY_HEIGHT,
} from "@/lib/media/composition";
import {
  cancelSonoraExport,
  exportSonoraVideo,
} from "@/lib/media/ffmpeg-client";
import { loadImageFile } from "@/lib/media/load-image";

type ExportState = "idle" | "working" | "complete" | "error";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function outputFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `sonora-story-${timestamp}.mp4`;
}

export function SonoraEditor() {
  const canvasRef = useRef<StoryCanvasHandle>(null);
  const exportEpochRef = useRef(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [convertedFromHeic, setConvertedFromHeic] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [settings, setSettings] =
    useState<CompositionSettings>(DEFAULT_COMPOSITION);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportStatus, setExportStatus] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState("");
  const [canShare, setCanShare] = useState(false);
  const photoColors = useMemo(
    () =>
      image ? extractPhotoColors(image) : DEFAULT_COMPOSITION.backdrop.colors,
    [image],
  );
  const photoField = useMemo(
    () => (image ? extractPhotoField(image) : undefined),
    [image],
  );
  const resolvedSettings = useMemo(
    () => ({
      ...settings,
      backdrop: {
        ...resolveBackdrop(settings.backdrop, photoColors),
        photoField,
      },
    }),
    [settings, photoColors, photoField],
  );
  const abstractBackdrop =
    settings.mode === "fit" && settings.backdrop.style !== "photo";

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImage(null);
      return;
    }

    let disposed = false;
    let disposeLoadedImage: (() => void) | undefined;
    setImage(null);
    setImageError(null);
    setImageLoading(true);
    setConvertedFromHeic(false);

    void loadImageFile(imageFile)
      .then((loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        disposeLoadedImage = loaded.dispose;
        setImage(loaded.image);
        setConvertedFromHeic(loaded.convertedFromHeic);
      })
      .catch((error) => {
        if (!disposed) setImageError(errorMessage(error));
      })
      .finally(() => {
        if (!disposed) setImageLoading(false);
      });

    return () => {
      disposed = true;
      disposeLoadedImage?.();
    };
  }, [imageFile]);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl("");
      return;
    }

    const nextUrl = URL.createObjectURL(audioFile);
    setAudioUrl(nextUrl);
    setAudioDuration(0);
    setSelection([0, 0]);
    return () => URL.revokeObjectURL(nextUrl);
  }, [audioFile]);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  const clearOutput = () => {
    setOutputUrl("");
    setOutputBlob(null);
    setFilename("");
    setExportState("idle");
    setExportError(null);
    setExportProgress(0);
    setExportStatus("");
  };

  const chooseImage = (file: File) => {
    if (exportState === "working") return;
    setImageFile(file);
    setSettings(DEFAULT_COMPOSITION);
    clearOutput();
  };

  const chooseAudio = (file: File) => {
    if (exportState === "working") return;
    setAudioFile(file);
    clearOutput();
  };

  const setMode = (mode: CompositionMode) => {
    setSettings((current) => resetForMode(current, mode));
    clearOutput();
  };

  const updateSettings = (next: CompositionSettings) => {
    if (exportState === "working") return;
    setSettings(next);
    if (outputBlob) clearOutput();
  };

  const updateZoom = (zoom: number) => {
    if (!image) return;
    zoom = clampZoom(settings.mode, zoom);
    const pan = clampPan(
      image.naturalWidth,
      image.naturalHeight,
      settings.mode,
      zoom,
      settings.panX,
      settings.panY,
    );
    updateSettings({ ...settings, zoom, ...pan });
  };

  const handleDuration = (duration: number) => {
    setAudioDuration(duration);
    setSelection((current) => {
      if (current[1] <= 0) return [0, duration];
      return [Math.min(current[0], duration), Math.min(current[1], duration)];
    });
  };

  const runExport = async () => {
    if (!image || !audioFile || !canvasRef.current) return;

    const exportEpoch = exportEpochRef.current + 1;
    exportEpochRef.current = exportEpoch;
    setExportState("working");
    setExportError(null);
    setExportProgress(0);
    setExportStatus("Rendering the exact story frame…");

    try {
      const visual = await canvasRef.current.exportVisual();
      if (exportEpoch !== exportEpochRef.current) return;
      const result = await exportSonoraVideo({
        visual,
        audio: audioFile,
        start: selection[0],
        end: selection[1],
        onStatus: (status) => {
          if (exportEpoch === exportEpochRef.current) {
            setExportStatus(status);
          }
        },
        onProgress: (progress) => {
          if (exportEpoch === exportEpochRef.current) {
            setExportProgress(progress);
          }
        },
      });
      if (exportEpoch !== exportEpochRef.current) return;

      const nextFilename = outputFilename();
      const nextUrl = URL.createObjectURL(result);
      setOutputBlob(result);
      setOutputUrl(nextUrl);
      setFilename(nextFilename);
      setExportProgress(1);
      setExportStatus("Your story is ready.");
      setExportState("complete");
    } catch (error) {
      if (exportEpoch !== exportEpochRef.current) return;
      setExportError(errorMessage(error));
      setExportState("error");
    }
  };

  const cancelExport = () => {
    exportEpochRef.current += 1;
    cancelSonoraExport();
    setExportState("idle");
    setExportStatus("");
    setExportProgress(0);
  };

  const shareOutput = async () => {
    if (!outputBlob || !filename || typeof navigator.share !== "function")
      return;
    const file = new File([outputBlob], filename, { type: "video/mp4" });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return;

    try {
      await navigator.share({ files: [file], title: "Sonora story" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setExportError(errorMessage(error));
    }
  };

  const readyToExport = Boolean(
    image && audioFile && audioDuration > 0 && selection[1] > selection[0],
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] xl:gap-8">
      <section
        className="mx-auto w-full min-w-0 lg:sticky lg:top-6"
        style={{ maxWidth: "min(420px, calc((100svh - 6rem) * 0.5625))" }}
      >
        {image ? (
          <StoryCanvas
            ref={canvasRef}
            image={image}
            motionDuration={selection[1] - selection[0]}
            paused={exportState === "working"}
            settings={resolvedSettings}
            onSettingsChange={updateSettings}
          />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-[1.75rem] bg-story-canvas p-6 shadow-2xl ring-1 ring-foreground/10">
            {imageLoading ? (
              <div className="flex flex-col items-center gap-3 text-center text-white/75">
                <Spinner className="size-6" />
                <p className="text-sm">Decoding your photo on this device…</p>
              </div>
            ) : (
              <div className="flex max-w-56 flex-col items-center gap-3 text-center text-white/75">
                <div className="flex size-12 items-center justify-center rounded-full bg-white/10">
                  <ImageIcon className="size-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-white">Your story preview</p>
                  <p className="text-sm leading-relaxed">
                    Add a photo to start framing it at exactly 1080 × 1920.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <MoveIcon className="size-3.5" />
          {settings.mode === "fit"
            ? "Drag to place. Pinch or scroll to resize. The whole photo stays visible."
            : "Drag to move. Pinch or scroll to zoom."}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <fieldset
          disabled={exportState === "working"}
          className="flex min-w-0 flex-col gap-5 disabled:opacity-70"
        >
          <Card>
            <CardHeader>
              <CardTitle>1. Frame the photo</CardTitle>
              <CardDescription>
                Keep the whole photo in Fit, or crop edge to edge with Fill.
              </CardDescription>
              {convertedFromHeic ? (
                <CardAction>
                  <Badge variant="secondary">HEIC decoded locally</Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <FileDrop
                kind="image"
                file={imageFile}
                onFile={chooseImage}
                compact
              />

              {imageError ? (
                <Alert variant="destructive">
                  <AlertTitle>That photo could not be opened</AlertTitle>
                  <AlertDescription>{imageError}</AlertDescription>
                </Alert>
              ) : null}

              {image ? (
                <FieldGroup>
                  <Field>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <FieldLabel>Framing</FieldLabel>
                        <FieldDescription>
                          Fit preserves every edge. Fill crops to 9:16.
                        </FieldDescription>
                      </div>
                      <ToggleGroup
                        value={[settings.mode]}
                        onValueChange={(value) => {
                          const mode = value[0] as CompositionMode | undefined;
                          if (mode) setMode(mode);
                        }}
                        variant="outline"
                        spacing={0}
                      >
                        <ToggleGroupItem value="fill">
                          <MaximizeIcon data-icon="inline-start" />
                          Fill
                        </ToggleGroupItem>
                        <ToggleGroupItem value="fit">
                          <SparklesIcon data-icon="inline-start" />
                          Fit
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </Field>

                  <Field>
                    <div className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor="photo-zoom">
                        {settings.mode === "fit" ? "Photo size" : "Zoom"}
                      </FieldLabel>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {Math.round(settings.zoom * 100)}%
                      </span>
                    </div>
                    <Slider
                      id="photo-zoom"
                      aria-label={
                        settings.mode === "fit" ? "Photo size" : "Zoom"
                      }
                      min={settings.mode === "fit" ? 0.3 : 1}
                      max={settings.mode === "fit" ? 1 : 4}
                      step={0.01}
                      value={settings.zoom}
                      onValueChange={(value) => {
                        if (typeof value === "number") updateZoom(value);
                      }}
                    />
                  </Field>

                  {settings.mode === "fit" ? (
                    <Field>
                      <FieldLabel id="photo-placement-label">
                        Placement
                      </FieldLabel>
                      <ToggleGroup
                        aria-labelledby="photo-placement-label"
                        variant="outline"
                        spacing={0}
                        value={[
                          settings.panY < 0
                            ? "upper"
                            : settings.panY > 0
                              ? "lower"
                              : "center",
                        ]}
                        onValueChange={(values) => {
                          if (!values[0]) return;
                          const rect = getImageRect(
                            image.naturalWidth,
                            image.naturalHeight,
                            "fit",
                            settings.zoom,
                            0,
                            0,
                          );
                          const room = (STORY_HEIGHT - rect.height) / 2;
                          updateSettings({
                            ...settings,
                            panX: 0,
                            panY:
                              values[0] === "upper"
                                ? -room * 0.65
                                : values[0] === "lower"
                                  ? room * 0.65
                                  : 0,
                          });
                        }}
                      >
                        <ToggleGroupItem value="upper">Upper</ToggleGroupItem>
                        <ToggleGroupItem value="center">Center</ToggleGroupItem>
                        <ToggleGroupItem value="lower">Lower</ToggleGroupItem>
                      </ToggleGroup>
                    </Field>
                  ) : null}

                  {!abstractBackdrop ? (
                    <>
                      <Field>
                        <div className="flex flex-col gap-1">
                          <FieldLabel>Motion</FieldLabel>
                          <FieldDescription>
                            Push and pull span the full audio range. Other
                            effects use the selected pace.
                          </FieldDescription>
                        </div>
                        <ToggleGroup
                          value={[settings.motionPreset]}
                          onValueChange={(value) => {
                            const motionPreset = value[0] as
                              | MotionPreset
                              | undefined;
                            if (motionPreset) {
                              updateSettings({ ...settings, motionPreset });
                            }
                          }}
                          variant="outline"
                          spacing={0}
                          className="flex-wrap justify-start"
                        >
                          <ToggleGroupItem value="none">
                            <CircleIcon data-icon="inline-start" />
                            Still
                          </ToggleGroupItem>
                          <ToggleGroupItem value="zoomin">
                            <ZoomInIcon data-icon="inline-start" />
                            Zoom in
                          </ToggleGroupItem>
                          <ToggleGroupItem value="zoomout">
                            <ZoomOutIcon data-icon="inline-start" />
                            Zoom out
                          </ToggleGroupItem>
                          <ToggleGroupItem value="breathe">
                            <ActivityIcon data-icon="inline-start" />
                            Breathe
                          </ToggleGroupItem>
                          <ToggleGroupItem value="drift">
                            <MoveIcon data-icon="inline-start" />
                            Drift
                          </ToggleGroupItem>
                          <ToggleGroupItem value="pulse">
                            <SparklesIcon data-icon="inline-start" />
                            Pulse
                          </ToggleGroupItem>
                          <ToggleGroupItem value="sway">
                            <WavesIcon data-icon="inline-start" />
                            Sway
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </Field>

                      {settings.motionPreset !== "none" ? (
                        <FieldGroup>
                          <Field>
                            <div className="flex items-center justify-between gap-4">
                              <FieldLabel htmlFor="motion-strength">
                                Intensity
                              </FieldLabel>
                              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {Math.round(settings.motionStrength)}%
                              </span>
                            </div>
                            <Slider
                              id="motion-strength"
                              min={10}
                              max={100}
                              step={1}
                              value={settings.motionStrength}
                              onValueChange={(value) => {
                                if (typeof value === "number") {
                                  updateSettings({
                                    ...settings,
                                    motionStrength: value,
                                  });
                                }
                              }}
                            />
                          </Field>
                          {FULL_DURATION_PRESETS.has(settings.motionPreset) ? (
                            <Field>
                              <FieldDescription>
                                This camera move runs once across the exact
                                audio selection instead of repeating a short
                                effect pass.
                              </FieldDescription>
                            </Field>
                          ) : (
                            <Field orientation="horizontal">
                              <div className="flex flex-1 flex-col gap-1">
                                <FieldLabel>Speed</FieldLabel>
                                <FieldDescription>
                                  Slow gives the motion more room to develop.
                                </FieldDescription>
                              </div>
                              <ToggleGroup
                                value={[settings.motionSpeed]}
                                onValueChange={(value) => {
                                  const motionSpeed = value[0] as
                                    | MotionSpeed
                                    | undefined;
                                  if (motionSpeed) {
                                    updateSettings({
                                      ...settings,
                                      motionSpeed,
                                    });
                                  }
                                }}
                                variant="outline"
                                spacing={0}
                              >
                                <ToggleGroupItem value="slow">
                                  Slow
                                </ToggleGroupItem>
                                <ToggleGroupItem value="normal">
                                  Normal
                                </ToggleGroupItem>
                                <ToggleGroupItem value="fast">
                                  Fast
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </Field>
                          )}
                        </FieldGroup>
                      ) : null}
                    </>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Toggle
                            variant="outline"
                            pressed={settings.showGuides}
                            onPressedChange={(showGuides) =>
                              updateSettings({ ...settings, showGuides })
                            }
                          />
                        }
                      >
                        <ShieldCheckIcon data-icon="inline-start" />
                        Safe zones
                      </TooltipTrigger>
                      <TooltipContent>
                        Show areas covered by Instagram&apos;s controls. Guides
                        never appear in the exported video.
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => updateSettings(DEFAULT_COMPOSITION)}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      Reset editor
                    </Button>
                  </div>
                </FieldGroup>
              ) : null}
            </CardContent>
          </Card>

          {image && settings.mode === "fit" ? (
            <Card>
              <CardHeader>
                <CardTitle>2. Set the atmosphere</CardTitle>
                <CardDescription>
                  Give the space around your photo a life of its own.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <BackdropControls
                  image={image}
                  settings={{ ...settings.backdrop, photoField }}
                  photoColors={photoColors}
                  onChange={(backdrop) =>
                    updateSettings({ ...settings, backdrop })
                  }
                />
                {settings.backdrop.style === "photo" ? (
                  <Field>
                    <FieldLabel htmlFor="background-blur">
                      Background blur
                    </FieldLabel>
                    <Slider
                      id="background-blur"
                      aria-label="Background blur"
                      min={0}
                      max={60}
                      step={1}
                      value={settings.blur}
                      onValueChange={(value) => {
                        if (typeof value === "number")
                          updateSettings({ ...settings, blur: value });
                      }}
                    />
                  </Field>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {image && settings.mode === "fit" ? "3" : "2"}. Cut the audio
              </CardTitle>
              <CardDescription>
                Pick any segment. Sonora does not impose a duration or file-size
                cap.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <FileDrop
                kind="audio"
                file={audioFile}
                onFile={chooseAudio}
                compact
              />
              {audioFile && audioUrl ? (
                <AudioTimeline
                  file={audioFile}
                  url={audioUrl}
                  duration={audioDuration}
                  selection={selection}
                  onDurationChange={handleDuration}
                  onSelectionChange={(next) => {
                    setSelection(next);
                    if (outputBlob) clearOutput();
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </fieldset>
        <Card>
          <CardHeader>
            <CardTitle>
              {image && settings.mode === "fit" ? "4" : "3"}. Export the story
            </CardTitle>
            <CardDescription>
              High-quality H.264 video with AAC audio at 1080 × 1920 and 60 FPS.
              Made entirely on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {exportState === "working" ? (
              <Progress
                value={exportProgress > 0 ? exportProgress * 100 : null}
              >
                <ProgressLabel className="flex items-center gap-2">
                  <Spinner />
                  {exportStatus}
                </ProgressLabel>
                {exportProgress > 0 ? (
                  <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                    {Math.round(exportProgress * 100)}%
                  </span>
                ) : null}
              </Progress>
            ) : null}

            {exportError ? (
              <Alert variant="destructive">
                <AlertTitle>Export failed</AlertTitle>
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            ) : null}

            {outputUrl ? (
              <div className="flex flex-col gap-4">
                {/* biome-ignore lint/a11y/useMediaCaption: The preview contains the user's arbitrary audio, not content with a known caption track. */}
                <video
                  className="max-h-[34rem] w-full rounded-xl bg-story-canvas"
                  src={outputUrl}
                  controls
                  playsInline
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    nativeButton={false}
                    render={
                      // biome-ignore lint/a11y/useAnchorContent: Base UI merges the Button children into this anchor at runtime.
                      <a
                        href={outputUrl}
                        download={filename}
                        aria-label="Download MP4"
                      />
                    }
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Download MP4
                  </Button>
                  {canShare ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void shareOutput()}
                    >
                      <Share2Icon data-icon="inline-start" />
                      Share to phone
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
          {!outputUrl ? (
            <CardFooter className="justify-between gap-3">
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="size-3.5" />
                  Your media never uploads.
                </div>
                <p>
                  Native H.264 when available. The compatibility fallback can
                  take much longer.
                </p>
              </div>
              {exportState === "working" ? (
                <Button type="button" variant="outline" onClick={cancelExport}>
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  disabled={!readyToExport}
                  onClick={() => void runExport()}
                >
                  <WandSparklesIcon data-icon="inline-start" />
                  Make story
                </Button>
              )}
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
