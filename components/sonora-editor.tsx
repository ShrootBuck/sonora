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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AudioTimeline } from "@/components/audio-timeline";
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
  type CompositionMode,
  type CompositionSettings,
  clampPan,
  DEFAULT_COMPOSITION,
  type MotionPreset,
  type MotionSpeed,
  resetForMode,
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
  const cancelledRef = useRef(false);
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
      .catch((error) => setImageError(errorMessage(error)))
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
    setImageFile(file);
    setSettings(DEFAULT_COMPOSITION);
    clearOutput();
  };

  const chooseAudio = (file: File) => {
    setAudioFile(file);
    clearOutput();
  };

  const setMode = (mode: CompositionMode) => {
    setSettings((current) => resetForMode(current, mode));
    clearOutput();
  };

  const updateSettings = (next: CompositionSettings) => {
    setSettings(next);
    if (outputBlob) clearOutput();
  };

  const updateZoom = (zoom: number) => {
    if (!image) return;
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

    cancelledRef.current = false;
    setExportState("working");
    setExportError(null);
    setExportProgress(0);
    setExportStatus("Rendering the exact story frame…");

    try {
      const visual = await canvasRef.current.exportVisual();
      const result = await exportSonoraVideo({
        visual,
        audio: audioFile,
        start: selection[0],
        end: selection[1],
        onStatus: setExportStatus,
        onProgress: setExportProgress,
      });
      if (cancelledRef.current) return;

      const nextFilename = outputFilename();
      const nextUrl = URL.createObjectURL(result);
      setOutputBlob(result);
      setOutputUrl(nextUrl);
      setFilename(nextFilename);
      setExportProgress(1);
      setExportStatus("Your story is ready.");
      setExportState("complete");
    } catch (error) {
      if (cancelledRef.current) return;
      setExportError(errorMessage(error));
      setExportState("error");
    }
  };

  const cancelExport = () => {
    cancelledRef.current = true;
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] xl:gap-8">
      <section className="lg:sticky lg:top-6">
        {image ? (
          <StoryCanvas
            ref={canvasRef}
            image={image}
            settings={settings}
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
          Drag to move. Pinch or scroll to zoom.
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>1. Frame &amp; animate</CardTitle>
            <CardDescription>
              Fill moves the whole photo. Fit keeps it sharp while the blurred
              background moves behind it.
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
                        Fill is the normal story look. Fit keeps the whole
                        photo.
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
                    <FieldLabel htmlFor="photo-zoom">Zoom</FieldLabel>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {settings.zoom.toFixed(2)}×
                    </span>
                  </div>
                  <Slider
                    id="photo-zoom"
                    min={1}
                    max={4}
                    step={0.01}
                    value={settings.zoom}
                    onValueChange={(value) => {
                      if (typeof value === "number") updateZoom(value);
                    }}
                  />
                </Field>

                {settings.mode === "fit" ? (
                  <Field>
                    <div className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor="background-blur">
                        Background blur
                      </FieldLabel>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {Math.round(settings.blur)} px
                      </span>
                    </div>
                    <Slider
                      id="background-blur"
                      min={0}
                      max={60}
                      step={1}
                      value={settings.blur}
                      onValueChange={(value) => {
                        if (typeof value === "number") {
                          updateSettings({ ...settings, blur: value });
                        }
                      }}
                    />
                  </Field>
                ) : null}

                <Field>
                  <div className="flex flex-col gap-1">
                    <FieldLabel>Motion</FieldLabel>
                    <FieldDescription>
                      The live preview matches the seamless 60 FPS export.
                    </FieldDescription>
                  </div>
                  <ToggleGroup
                    value={[settings.motionPreset]}
                    onValueChange={(value) => {
                      const motionPreset = value[0] as MotionPreset | undefined;
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
                    <Field orientation="horizontal">
                      <div className="flex flex-1 flex-col gap-1">
                        <FieldLabel>Speed</FieldLabel>
                        <FieldDescription>
                          Slow uses a longer, calmer loop.
                        </FieldDescription>
                      </div>
                      <ToggleGroup
                        value={[settings.motionSpeed]}
                        onValueChange={(value) => {
                          const motionSpeed = value[0] as
                            | MotionSpeed
                            | undefined;
                          if (motionSpeed) {
                            updateSettings({ ...settings, motionSpeed });
                          }
                        }}
                        variant="outline"
                        spacing={0}
                      >
                        <ToggleGroupItem value="slow">Slow</ToggleGroupItem>
                        <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
                        <ToggleGroupItem value="fast">Fast</ToggleGroupItem>
                      </ToggleGroup>
                    </Field>
                  </FieldGroup>
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

        <Card>
          <CardHeader>
            <CardTitle>2. Cut the audio</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle>3. Export the story</CardTitle>
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
