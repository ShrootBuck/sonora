"use client";

import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AudioLinesIcon,
  CaptionsIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilmIcon,
  ImagePlusIcon,
  ImagesIcon,
  LayersIcon,
  LockKeyholeIcon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  ScanIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioTimeline,
  type AudioTransport,
  formatTime,
} from "@/components/audio-timeline";
import { BackdropControls } from "@/components/backdrop-controls";
import { LyricsEditor } from "@/components/lyrics-editor";
import {
  AspectArt,
  CarouselArt,
  FramingArt,
  LayoutArt,
  MotionArt,
  ReactionArt,
  SpanArt,
  TransitionArt,
  TreatmentArt,
  TypeArt,
} from "@/components/option-art";
import { Amount, Choice, TimeField } from "@/components/studio-fields";
import { StudioPreview } from "@/components/studio-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractPhotoColors, extractPhotoField } from "@/lib/media/backdrop";
import { loadImageFile } from "@/lib/media/load-image";
import { type AudioAnalysis, analyzeAudio } from "@/lib/studio/audio";
import type { ExportFile, ExportRequest } from "@/lib/studio/export";
import {
  ASPECTS,
  capacity,
  clamp,
  dimensions,
  INITIAL_PROJECT,
  LAYOUTS,
  type Photo,
  type Project,
  pageCount,
  sceneAt,
  sceneCount,
  snapCutsToBeats,
  timelineCuts,
  updateCut,
  type Variant,
} from "@/lib/studio/model";
import {
  CAROUSEL_MODES,
  FRAMINGS,
  MODES,
  MOTIONS,
  PAPER_COLORS,
  PLACEMENTS,
  REACTIONS,
  SPANS,
  TEASER_FORMATS,
  TRANSITIONS,
  TREATMENTS,
  TYPEFACES,
  VARIANTS,
} from "@/lib/studio/options";
import { cn } from "@/lib/utils";

const MODE_ICONS = {
  post: ImagePlusIcon,
  carousel: ImagesIcon,
  story: FilmIcon,
};

export function SonoraStudio() {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("main");
  const [page, setPage] = useState(0);
  const [panel, setPanel] = useState("style");
  const [guides, setGuides] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(ExportFile & { url: string }) | null>(
    null,
  );
  const [animatedSet, setAnimatedSet] = useState(true);
  const [dragging, setDragging] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const audioTransport = useRef<AudioTransport | null>(null);
  const resources = useRef(new Map<string, Photo>());
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const loadEpoch = useRef(0);
  const dragPhoto = useRef<string | null>(null);
  const photo = photos.find((p) => p.id === selected) ?? photos[0];
  const duration = audio
    ? Math.max(0, selection[1] - selection[0])
    : project.duration;
  const scenes = sceneCount(project, photos);
  const pages = project.mode === "post" ? scenes : pageCount(project, photos);
  const size = dimensions(project, variant);
  const cuts = timelineCuts(project, scenes);
  const activeScene = sceneAt(project, scenes, time, duration);
  const change = (patch: Partial<Project>) => {
    setProject((p) => ({ ...p, ...patch }));
    setAnimate(false);
  };
  const movePhoto = useCallback((id: string, patch: Partial<Photo>) => {
    setPhotos((items) =>
      items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
    setAnimate(false);
  }, []);
  const choosePhoto = useCallback((id: string) => {
    setSelected(id);
    setPanel("photo");
    setAnimate(false);
  }, []);
  const onPlaying = useCallback((value: boolean) => {
    setPlaying(value);
    if (value) setAnimate(false);
  }, []);
  const onAudioTime = useCallback(
    (value: number) => {
      setTime(clamp(value - selection[0], 0, duration));
    },
    [selection, duration],
  );
  const seekAudio = (sourceTime: number) => {
    setAnimate(false);
    if (audioTransport.current) audioTransport.current.seek(sourceTime);
    else setTime(clamp(sourceTime, 0, duration));
  };

  useEffect(() => {
    alive.current = true;
    const collection = resources.current;
    return () => {
      alive.current = false;
      controller.current?.abort();
      for (const p of collection.values()) p.dispose();
      collection.clear();
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: An edit invalidates the previously exported snapshot.
  useEffect(() => {
    setResult(null);
    setStatus("");
  }, [project, photos, variant, page, audio, selection, animatedSet]);
  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    setPage((p) => Math.min(p, pages - 1));
  }, [pages]);

  async function addPhotos(files: File[]) {
    if (working || loading) return;
    setLoading(true);
    setError("");
    const loaded: Photo[] = [],
      failures: string[] = [];
    for (const file of files) {
      try {
        const image = await loadImageFile(file);
        if (!alive.current) {
          image.dispose();
          break;
        }
        const item: Photo = {
          ...image,
          id: crypto.randomUUID(),
          name: file.name,
          colors: extractPhotoColors(image.image),
          field: extractPhotoField(image.image),
          fit: "fit",
          scale: 1,
          x: 0,
          y: 0,
          span: 1,
          shift: 0,
          rotation: 0,
        };
        loaded.push(item);
        resources.current.set(item.id, item);
      } catch {
        failures.push(file.name);
      }
    }
    if (!alive.current) return;
    setPhotos((p) => [...p, ...loaded]);
    setSelected((id) => id ?? loaded[0]?.id ?? null);
    setProject((p) => ({ ...p, cuts: [] }));
    if (failures.length)
      setError(
        `Could not open: ${failures.join(", ")}. Try another image format.`,
      );
    setLoading(false);
  }
  async function addAudio(file: File) {
    const epoch = ++loadEpoch.current;
    setAudio(file);
    setAnalysis(null);
    setAudioDuration(0);
    setSelection([0, 0]);
    setTime(0);
    setPlaying(false);
    setAnimate(false);
    setAudioLoading(true);
    setError("");
    try {
      const next = await analyzeAudio(file);
      if (!alive.current || epoch !== loadEpoch.current) return;
      setAnalysis(next);
      setAudioDuration(next.duration);
      setSelection([0, next.duration]);
    } catch {
      if (alive.current && epoch === loadEpoch.current)
        setError(
          "This audio could not be analyzed. You can still trim and export it if the browser can read its duration, but beat snapping and reactive effects need a decodable audio file.",
        );
    } finally {
      if (alive.current && epoch === loadEpoch.current) setAudioLoading(false);
    }
  }
  function reorder(id: string, index: number) {
    setPhotos((items) => {
      const next = [...items],
        from = next.findIndex((p) => p.id === id);
      if (from < 0) return items;
      const [item] = next.splice(from, 1);
      next.splice(clamp(index, 0, next.length), 0, item);
      return next;
    });
  }
  function removePhoto(id: string) {
    resources.current.get(id)?.dispose();
    resources.current.delete(id);
    setPhotos((items) => items.filter((p) => p.id !== id));
    setProject((p) => ({ ...p, cuts: [] }));
  }
  async function runExport(kind: "current" | "set") {
    if (working || !photos.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setWorking(true);
    setResult(null);
    setError("");
    setProgress(0);
    setStatus("Preparing your composition…");
    setAnimate(false);
    try {
      const exporter = await import("@/lib/studio/export");
      const request: ExportRequest = {
        project,
        photos,
        variant,
        page: Math.round(page),
        audio,
        analysis,
        start: audio ? selection[0] : 0,
        duration,
        signal: abort.signal,
        onStatus: setStatus,
        onProgress: setProgress,
      };
      let file: ExportFile;
      if (kind === "set")
        file = await exporter.exportMatchingSet(request, animatedSet);
      else if (project.mode === "story" && variant !== "cover")
        file = await exporter.exportVideo(request);
      else {
        const files = await exporter.exportImages(request);
        file =
          files.length === 1
            ? files[0]
            : {
                name: "sonora-carousel.zip",
                blob: await exporter.packageFiles(files, abort.signal),
              };
      }
      if (!alive.current || abort.signal.aborted) return;
      setResult({ ...file, url: URL.createObjectURL(file.blob) });
      setProgress(1);
      setStatus("Ready to post.");
    } catch (e) {
      if (!alive.current) return;
      if (abort.signal.aborted)
        setStatus("Export cancelled. Your edit is still here.");
      else {
        setError(
          e instanceof Error ? e.message : "Export failed. Please try again.",
        );
        setStatus("");
      }
    } finally {
      if (controller.current === abort) controller.current = null;
      if (alive.current) setWorking(false);
    }
  }
  async function share() {
    if (!result) return;
    const file = new File([result.blob], result.name, {
      type: result.blob.type,
    });
    if (!navigator.canShare?.({ files: [file] })) {
      setError(
        "Sharing this file is unavailable in this browser. Use Download instead.",
      );
      return;
    }
    try {
      await navigator.share({ files: [file], title: "Sonora" });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setError(e.message);
    }
  }
  const ready = photos.length > 0 && !loading;
  const videoReady = !audioLoading && duration > 0;

  return (
    <main className="studio-shell" data-has-photos={photos.length > 0}>
      <input
        ref={photoInput}
        id="studio-photos"
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        aria-label="Add photos"
        onChange={(e) => {
          void addPhotos(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        disabled={working || loading}
      />
      <input
        ref={audioInput}
        id="studio-audio"
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
        className="sr-only"
        aria-label="Add audio"
        onChange={(e) => {
          if (e.target.files?.[0]) void addAudio(e.target.files[0]);
          e.target.value = "";
        }}
        disabled={working}
      />
      <header className="studio-header">
        <a href="/" className="studio-brand" aria-label="Sonora home">
          <span className="studio-mark">
            <AudioLinesIcon className="size-5" />
          </span>
          <span className="studio-wordmark">
            sonora<span>.</span>
          </span>
        </a>
        <ToggleGroup
          aria-label="Create a"
          value={[project.mode]}
          onValueChange={(v) => {
            if (v[0]) {
              change({ mode: v[0] as Project["mode"] });
              setPage(0);
              setVariant("main");
              setTime(0);
            }
          }}
          className="segmented segmented-hot"
          disabled={working}
        >
          {MODES.map((mode) => {
            const Icon = MODE_ICONS[mode.value];
            return (
              <Tooltip key={mode.value}>
                <ToggleGroupItem
                  value={mode.value}
                  render={<TooltipTrigger delay={350} />}
                >
                  <Icon /> {mode.label}
                </ToggleGroupItem>
                <TooltipContent side="bottom">
                  {mode.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        <Badge
          variant="outline"
          className="studio-privacy h-7 rounded-full px-3"
        >
          <LockKeyholeIcon data-icon="inline-start" /> On your device
        </Badge>
      </header>
      {photos.length ? (
        <h1 className="sr-only">Sonora studio</h1>
      ) : (
        <div className="studio-topbar">
          <h1 className="studio-title">
            Make something <em className="hot-text">worth sharing.</em>
          </h1>
          <p className="studio-subtitle">
            One collection. Posts, carousels, and stories.
          </p>
        </div>
      )}
      <div className="studio-workspace">
        <section
          className="studio-panel studio-workbench"
          aria-label="Your composition"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length)
              void addPhotos(Array.from(e.dataTransfer.files));
          }}
        >
          <div
            className={cn("studio-preview-area", dragging && "studio-dragging")}
            style={
              photo
                ? ({
                    "--glow-a": photo.colors[1],
                    "--glow-b": photo.colors[2],
                  } as CSSProperties)
                : undefined
            }
          >
            <div className="studio-preview-toolbar">
              <ToggleGroup
                aria-label="Preview version"
                value={[variant]}
                onValueChange={(v) => {
                  if (v[0]) {
                    setVariant(v[0] as Variant);
                    setAnimate(false);
                  }
                }}
                disabled={working}
                size="sm"
                className="segmented"
              >
                {VARIANTS.map((v) => (
                  <Tooltip key={v.value}>
                    <ToggleGroupItem
                      value={v.value}
                      render={<TooltipTrigger delay={350} />}
                    >
                      {v.label}
                    </ToggleGroupItem>
                    <TooltipContent side="bottom">
                      {v.description}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </ToggleGroup>
              <Tooltip>
                <Toggle
                  aria-label="Show Instagram guides"
                  pressed={guides}
                  onPressedChange={setGuides}
                  size="sm"
                  className="studio-chip"
                  render={<TooltipTrigger delay={350} />}
                >
                  <ScanIcon data-icon="inline-start" />
                  <span className="studio-chip-label">Guides</span>
                </Toggle>
                <TooltipContent side="bottom">
                  Shows roughly where Instagram's buttons and captions cover
                  your image. Never included in downloads.
                </TooltipContent>
              </Tooltip>
            </div>
            {photos.length ? (
              <StudioPreview
                project={project}
                photos={photos}
                variant={variant}
                page={page}
                time={time}
                duration={duration || project.duration}
                analysis={analysis}
                audioStart={audio ? selection[0] : 0}
                animate={animate && !working && !playing}
                guides={guides}
                selected={selected}
                onSelect={choosePhoto}
                onMove={movePhoto}
                disabled={working}
              />
            ) : (
              <Empty className="studio-empty">
                <div className="studio-empty-art" aria-hidden="true">
                  <div className="sample-print sample-print-back">
                    <div />
                  </div>
                  <div className="sample-print sample-print-mid">
                    <div />
                  </div>
                  <div className="sample-print sample-print-front">
                    <div>
                      <span />
                    </div>
                  </div>
                  <span className="sample-star">✳</span>
                </div>
                <EmptyHeader>
                  <EmptyTitle>
                    Your camera roll has{" "}
                    <em className="hot-text">potential.</em>
                  </EmptyTitle>
                  <EmptyDescription>
                    Drop in a few photos. Find a layout you love.
                    <br />
                    Make the whole thing feel like you.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    size="lg"
                    className="studio-export-cta mt-2 px-6"
                    onClick={() => photoInput.current?.click()}
                    disabled={loading}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {loading ? "Opening photos…" : "Choose photos"}
                  </Button>
                  <span className="studio-spec">
                    HEIC · JPEG · PNG · WebP — never leaves your device
                  </span>
                </EmptyContent>
              </Empty>
            )}
            {dragging ? (
              <div className="studio-drop-overlay">
                <span className="hot-text">Drop your photos here</span>
              </div>
            ) : null}
          </div>
          <div className="studio-canvas-footer">
            <span className="studio-spec">
              <b>
                {size.width} × {size.height}
              </b>
              {project.mode === "story" && variant !== "cover"
                ? " · 60 FPS · H.264"
                : " · PNG"}
            </span>
            {photos.length > 0 &&
            project.mode !== "story" &&
            variant === "main" ? (
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Previous slide"
                  disabled={page <= 0 || working}
                  onClick={() => setPage(Math.max(0, Math.ceil(page) - 1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="text-xs tabular-nums">
                  {Math.round(page) + 1} / {pages}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Next slide"
                  disabled={page >= pages - 1 || working}
                  onClick={() =>
                    setPage(Math.min(pages - 1, Math.floor(page) + 1))
                  }
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            ) : null}
            {photos.length > 0 &&
            (project.mode === "story" || variant === "teaser") ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={working}
                onClick={() =>
                  audio
                    ? void audioTransport.current?.toggle()
                    : setAnimate((v) => !v)
                }
              >
                {animate || playing ? (
                  <PauseIcon data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                {audio ? "Preview with audio" : "Preview motion"}
              </Button>
            ) : null}
          </div>
          {project.connected &&
          project.mode === "carousel" &&
          photos.length > 0 &&
          variant === "main" ? (
            <div className="px-6 pb-4">
              <Slider
                aria-label="Swipe through connected carousel"
                value={page}
                min={0}
                max={Math.max(0.01, pages - 1)}
                step={0.01}
                onValueChange={(v) => {
                  if (typeof v === "number") setPage(v);
                }}
                disabled={working}
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Scrub to preview the swipe between slides.
              </p>
            </div>
          ) : null}
          {project.mode === "post" && variant === "main" && pages > 1 ? (
            <p className="px-6 pb-3 text-center text-xs text-muted-foreground">
              A post is one image, so only the photos shown here are exported.
              Switch to Carousel to export every page.
            </p>
          ) : null}
          {guides ? (
            <p className="px-6 pb-3 text-center text-xs text-muted-foreground">
              Approximate Instagram overlays. Guides never appear in your
              export.
            </p>
          ) : null}
          <div className="studio-collection">
            <div className="flex items-center justify-between gap-3">
              <span className="studio-section-label">
                Your collection <span>{photos.length}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => photoInput.current?.click()}
                disabled={working || loading}
              >
                {loading ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                Add photos
              </Button>
            </div>
            <div className="photo-strip">
              {photos.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  className={cn(
                    "photo-thumbnail",
                    photo?.id === p.id && "photo-thumbnail-selected",
                  )}
                  aria-label={`Select photo ${i + 1}: ${p.name}`}
                  aria-pressed={photo?.id === p.id}
                  disabled={working}
                  draggable={!working}
                  onDragStart={() => {
                    dragPhoto.current = p.id;
                  }}
                  onDragOver={(e) => {
                    if (dragPhoto.current) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (dragPhoto.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      reorder(dragPhoto.current, i);
                      dragPhoto.current = null;
                    }
                  }}
                  onDragEnd={() => {
                    dragPhoto.current = null;
                  }}
                  onClick={() => {
                    choosePhoto(p.id);
                    if (project.mode !== "story")
                      setPage(
                        project.connected && project.mode === "carousel"
                          ? photos
                              .slice(0, i)
                              .reduce((sum, item) => sum + item.span, 0)
                          : Math.floor(i / capacity(project.layout)),
                      );
                  }}
                >
                  {/* biome-ignore lint/performance/noImgElement: User-owned blob URLs never go through a server image optimizer. */}
                  <img src={p.objectUrl} alt={p.name} draggable={false} />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </button>
              ))}
              {photos.length ? (
                <button
                  type="button"
                  className="photo-add-tile"
                  aria-label="Add more photos"
                  disabled={working || loading}
                  onClick={() => photoInput.current?.click()}
                >
                  {loading ? <Spinner /> : <PlusIcon className="size-5" />}
                  Add
                </button>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  Your photos will appear here, in posting order.
                </p>
              )}
            </div>
            {photo ? (
              <div className="flex items-center gap-1">
                <span className="mr-auto truncate text-xs text-muted-foreground">
                  {photo.name}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move photo earlier"
                  disabled={working || photos.indexOf(photo) === 0}
                  onClick={() => reorder(photo.id, photos.indexOf(photo) - 1)}
                >
                  <ArrowLeftIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move photo later"
                  disabled={
                    working || photos.indexOf(photo) === photos.length - 1
                  }
                  onClick={() => reorder(photo.id, photos.indexOf(photo) + 1)}
                >
                  <ArrowRightIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove selected photo"
                  disabled={working}
                  onClick={() => removePhoto(photo.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ) : null}
            {photos.length > 1 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Layouts fill up with photos in this order. Drag a thumbnail or
                use the arrows to reorder.
              </p>
            ) : null}
          </div>
          {project.mode === "story" && photos.length > 0 ? (
            <div className="studio-timeline">
              <div className="flex items-center justify-between gap-3">
                <span className="studio-section-label">Story timeline</span>
                <span className="studio-value">
                  {formatTime(time)} / {formatTime(duration)}
                </span>
              </div>
              <Slider
                aria-label="Story playhead"
                value={time}
                min={0}
                max={Math.max(duration - 1 / 60, 0.01)}
                step={1 / 60}
                disabled={working || playing}
                onValueChange={(v) => {
                  if (typeof v === "number") {
                    seekAudio((audio ? selection[0] : 0) + v);
                  }
                }}
              />
              <div className="flex gap-1">
                {Array.from({ length: scenes }, (_, i) => (
                  <button
                    type="button"
                    key={photos[i * capacity(project.layout)]?.id ?? i}
                    className={cn(
                      "timeline-scene",
                      activeScene.scene === i && "timeline-scene-active",
                    )}
                    style={{ flex: cuts[i + 1] - cuts[i] }}
                    disabled={working || playing}
                    onClick={() => {
                      seekAudio(
                        (audio ? selection[0] : 0) + cuts[i] * duration,
                      );
                    }}
                    aria-label={`Preview scene ${i + 1}`}
                  >
                    <span>{i + 1}</span>
                    <span className="hidden sm:inline">
                      {((cuts[i + 1] - cuts[i]) * duration).toFixed(1)}s
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Each block is a scene: the photos on screen together. Tap one to
                jump there, or set exact times under Sound & motion.
              </p>
            </div>
          ) : null}
        </section>
        <aside
          className="studio-panel studio-inspector"
          aria-label="Editing controls"
        >
          <div className="studio-inspector-scroll">
            <fieldset disabled={working} className="min-w-0">
              <Tabs value={panel} onValueChange={(v) => setPanel(String(v))}>
                <div className="studio-tabs-bar">
                  <TabsList className="w-full">
                    <TabsTrigger value="style">
                      <LayersIcon />
                      Style
                    </TabsTrigger>
                    <TabsTrigger value="photo">
                      <ImagesIcon />
                      Photo
                    </TabsTrigger>
                    <TabsTrigger value="sound">
                      <Music2Icon />
                      Sound
                    </TabsTrigger>
                    <TabsTrigger value="lyrics">
                      <CaptionsIcon />
                      Lyrics
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Keep the single audio element mounted across inspector tabs. */}
                <div hidden={panel !== "sound"} className="pt-3">
                  <FieldGroup>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {audio?.name ?? "Your soundtrack"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => audioInput.current?.click()}
                      >
                        {audio ? "Replace" : "Add audio"}
                      </Button>
                      {audio ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove audio"
                          onClick={() => {
                            loadEpoch.current++;
                            setAudio(null);
                            setAnalysis(null);
                            setAudioLoading(false);
                            setTime(0);
                          }}
                        >
                          <XIcon />
                        </Button>
                      ) : null}
                    </div>
                    {!audio ? (
                      <FieldDescription className="-mt-3">
                        Pick a song or sound from your device. The story plays
                        the part you select, and it never leaves your device.
                      </FieldDescription>
                    ) : null}
                    {audioLoading ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Spinner />
                        Listening for rhythm…
                      </p>
                    ) : null}
                    {audio && audioUrl ? (
                      <AudioTimeline
                        key={audioUrl}
                        transportRef={audioTransport}
                        file={audio}
                        url={audioUrl}
                        analysis={analysis}
                        duration={audioDuration}
                        selection={selection}
                        onDurationChange={(n) => {
                          setAudioDuration(n);
                          if (!audioDuration) setSelection([0, n]);
                        }}
                        onSelectionChange={(s) => {
                          setSelection(s);
                          setTime(0);
                        }}
                        onTimeChange={onAudioTime}
                        onPlayingChange={onPlaying}
                        disabled={working}
                      />
                    ) : (
                      <TimeField
                        label="Story duration"
                        hint="How long the video runs. Type seconds (12) or minutes:seconds (1:05.5)."
                        value={project.duration}
                        onChange={(n) => {
                          if (n > 0) change({ duration: n });
                        }}
                      />
                    )}
                  </FieldGroup>
                </div>
                <TabsContent value="style" className="pt-3">
                  <FieldGroup>
                    {variant !== "main" ? (
                      <Alert>
                        <AlertTitle>
                          {variant === "teaser"
                            ? "Matching story teaser"
                            : "Matching cover"}
                        </AlertTitle>
                        <AlertDescription>
                          {variant === "teaser"
                            ? "A 9:16 story that points people to your post."
                            : "A single still in your post shape, for a first slide or grid cover."}{" "}
                          Change its layout, size, and text position here.
                          Colors and type stay linked to your main composition.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {variant === "main" && project.mode !== "story" ? (
                      <Choice
                        label="Canvas"
                        value={project.aspect}
                        options={ASPECTS}
                        art={(aspect) => (
                          <AspectArt
                            height={
                              ASPECTS.find((a) => a.value === aspect)?.height ??
                              1350
                            }
                          />
                        )}
                        columns={5}
                        onChange={(aspect) => change({ aspect })}
                      />
                    ) : null}
                    {variant === "main" && project.mode === "carousel" ? (
                      <Choice
                        label="Carousel"
                        value={project.connected ? "connected" : "individual"}
                        options={CAROUSEL_MODES}
                        art={(v) => (
                          <CarouselArt connected={v === "connected"} />
                        )}
                        columns={2}
                        onChange={(v) => {
                          change({ connected: v === "connected" });
                          setPage(0);
                        }}
                      />
                    ) : null}
                    {!project.connected ||
                    project.mode !== "carousel" ||
                    variant !== "main" ? (
                      <Choice
                        label="Layout"
                        value={
                          variant === "main"
                            ? project.layout
                            : project[variant].layout
                        }
                        options={LAYOUTS}
                        art={(layout) => (
                          <LayoutArt layout={layout} height={size.height} />
                        )}
                        onChange={(layout) =>
                          variant === "main"
                            ? change({ layout, cuts: [] })
                            : change({
                                [variant]: { ...project[variant], layout },
                              })
                        }
                      />
                    ) : (
                      <FieldDescription>
                        A continuous strip, sliced into numbered slides. In
                        Photo, let a panorama span two or three slides, or shift
                        a photo across a seam.
                      </FieldDescription>
                    )}
                    {variant !== "main" ? (
                      <Amount
                        label="Composition size"
                        hint="Shrinks the whole layout to leave more background around it."
                        value={project[variant].scale * 100}
                        min={30}
                        suffix="%"
                        onChange={(n) =>
                          change({
                            [variant]: { ...project[variant], scale: n / 100 },
                          })
                        }
                      />
                    ) : null}
                    <Choice
                      label="Treatment"
                      value={project.treatment}
                      options={TREATMENTS}
                      art={(treatment) => (
                        <TreatmentArt
                          treatment={treatment}
                          color={photo?.colors[0] ?? project.background}
                        />
                      )}
                      columns={4}
                      onChange={(treatment) => {
                        change({
                          treatment,
                          ...(treatment === "border" ? PAPER_COLORS : {}),
                          ...(treatment === "color" && photo
                            ? {
                                background: photo.colors[0],
                                ink: photo.colors[2],
                              }
                            : {}),
                        });
                        if (treatment === "clean")
                          setPhotos((items) =>
                            items.map((p) => ({
                              ...p,
                              fit: "fill",
                              scale: 1,
                              x: 0,
                              y: 0,
                            })),
                          );
                      }}
                    />
                    {project.treatment !== "clean" ? (
                      <Amount
                        label="Spacing"
                        hint="Space between photos and around the edges of the frame."
                        value={project.gap}
                        max={120}
                        suffix=" px"
                        onChange={(gap) => change({ gap })}
                      />
                    ) : null}
                    <Field>
                      <div className="flex gap-4">
                        <Field>
                          <FieldLabel htmlFor="paper-color">
                            Background
                          </FieldLabel>
                          <Input
                            id="paper-color"
                            type="color"
                            value={project.background}
                            onChange={(e) =>
                              change({ background: e.target.value })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="type-color">Text</FieldLabel>
                          <Input
                            id="type-color"
                            type="color"
                            value={project.ink}
                            onChange={(e) => change({ ink: e.target.value })}
                          />
                        </Field>
                      </div>
                      <FieldDescription>
                        {project.treatment === "film"
                          ? "Film always uses its dark mat and light text, so these colors don't apply while it's on."
                          : project.atmospheric
                            ? "Your atmospheric backdrop covers the background color. Text colors the title and small print."
                            : "Background is the mat behind your photos. Text colors the title and small print."}
                      </FieldDescription>
                    </Field>
                    {photo ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          change({
                            background: photo.colors[0],
                            ink: photo.colors[2],
                            treatment: "color",
                          })
                        }
                      >
                        <SparklesIcon data-icon="inline-start" />
                        Use this photo's colors
                      </Button>
                    ) : null}
                    <Separator />
                    <Field>
                      <FieldLabel htmlFor="studio-title">Title</FieldLabel>
                      <Input
                        id="studio-title"
                        placeholder="A weekend worth keeping"
                        value={project.title}
                        onChange={(e) => change({ title: e.target.value })}
                      />
                      <FieldDescription>
                        Big text on every slide. Adding text shrinks the photos
                        a little to make room for it.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="studio-subtitle">
                        Small print
                      </FieldLabel>
                      <Input
                        id="studio-subtitle"
                        placeholder="Somewhere good, with good people."
                        value={project.subtitle}
                        onChange={(e) => change({ subtitle: e.target.value })}
                      />
                      <FieldDescription>
                        A smaller line under the title, like a date or a place.
                      </FieldDescription>
                    </Field>
                    {project.title || project.subtitle ? (
                      <>
                        <Choice
                          label="Typography"
                          value={project.typeface}
                          options={TYPEFACES}
                          art={(typeface) => <TypeArt typeface={typeface} />}
                          onChange={(typeface) => change({ typeface })}
                        />
                        <Amount
                          label="Title size"
                          hint="Small print scales along with the title."
                          value={project.titleSize}
                          min={24}
                          max={160}
                          suffix=" px"
                          onChange={(titleSize) => change({ titleSize })}
                        />
                        <Amount
                          label="Text position"
                          hint="How far down the frame the text sits. 0% is the very top."
                          value={Math.round(
                            (variant === "main"
                              ? project.titleY
                              : project[variant].titleY) * 100,
                          )}
                          max={90}
                          suffix="%"
                          onChange={(n) =>
                            variant === "main"
                              ? change({ titleY: n / 100 })
                              : change({
                                  [variant]: {
                                    ...project[variant],
                                    titleY: n / 100,
                                  },
                                })
                          }
                        />
                        {project.connected &&
                        project.mode === "carousel" &&
                        variant === "main" ? (
                          <Field>
                            <Toggle
                              pressed={project.titleAcross}
                              onPressedChange={(titleAcross) =>
                                change({ titleAcross })
                              }
                              variant="outline"
                            >
                              Let the title cross the first seam
                            </Toggle>
                            <FieldDescription>
                              Centers the title on the line between slides 1 and
                              2, so it carries across the swipe.
                            </FieldDescription>
                          </Field>
                        ) : null}
                      </>
                    ) : null}
                  </FieldGroup>
                </TabsContent>
                <TabsContent value="photo" className="pt-3">
                  {photo ? (
                    <FieldGroup>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          Photo {photos.indexOf(photo) + 1}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            movePhoto(photo.id, {
                              fit: "fit",
                              scale: 1,
                              x: 0,
                              y: 0,
                              shift: 0,
                              rotation: 0,
                            })
                          }
                        >
                          <RotateCcwIcon data-icon="inline-start" />
                          Reset framing
                        </Button>
                      </div>
                      <FieldDescription className="-mt-3">
                        Framing changes this photo only. Tap another thumbnail
                        in your collection to edit it.
                      </FieldDescription>
                      <Choice
                        label="Framing"
                        value={photo.fit}
                        options={FRAMINGS}
                        art={(fit) => <FramingArt fit={fit} />}
                        columns={2}
                        onChange={(fit) =>
                          movePhoto(photo.id, { fit, scale: 1, x: 0, y: 0 })
                        }
                      />
                      <Amount
                        label="Photo size"
                        hint={
                          photo.fit === "fit"
                            ? "Shrinks the photo inside its slot. At 100% it touches the slot's edges."
                            : "Zooms in past the edges. At 100% it just covers the slot."
                        }
                        value={Math.round(photo.scale * 100)}
                        min={photo.fit === "fit" ? 30 : 100}
                        max={photo.fit === "fit" ? 100 : 300}
                        suffix="%"
                        onChange={(n) =>
                          movePhoto(photo.id, { scale: n / 100 })
                        }
                      />
                      <Amount
                        label="Horizontal position"
                        value={Math.round(photo.x * 100)}
                        min={-100}
                        onChange={(n) => movePhoto(photo.id, { x: n / 100 })}
                      />
                      <Amount
                        label="Vertical position"
                        hint="Slides the photo inside its slot, or drag it in the preview. A photo that already touches both edges in one direction can't move that way."
                        value={Math.round(photo.y * 100)}
                        min={-100}
                        onChange={(n) => movePhoto(photo.id, { y: n / 100 })}
                      />
                      <Choice
                        label="Placement"
                        value={
                          photo.y < -0.5
                            ? "upper"
                            : photo.y > 0.5
                              ? "lower"
                              : "center"
                        }
                        options={PLACEMENTS}
                        onChange={(v) =>
                          movePhoto(photo.id, {
                            y: v === "upper" ? -1 : v === "lower" ? 1 : 0,
                          })
                        }
                      />
                      <Field>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setPhotos((items) =>
                              items.map((p) => ({
                                ...p,
                                fit: photo.fit,
                                scale: photo.scale,
                                x: photo.x,
                                y: photo.y,
                              })),
                            )
                          }
                        >
                          Apply framing to all photos
                        </Button>
                        <FieldDescription>
                          Copies this photo's Fit or Fill, size, and position to
                          every photo.
                        </FieldDescription>
                      </Field>
                      {project.connected && project.mode === "carousel" ? (
                        <>
                          <Separator />
                          <Choice
                            label="Photo spans"
                            value={String(photo.span) as "1" | "2" | "3"}
                            options={SPANS}
                            art={(v) => <SpanArt span={Number(v)} />}
                            onChange={(v) =>
                              movePhoto(photo.id, { span: Number(v) })
                            }
                          />
                          <Amount
                            label="Shift across the seam"
                            hint="Slides the photo sideways, up to half a slide, so it straddles the cut between two slides."
                            value={Math.round(photo.shift * 100)}
                            min={-50}
                            max={50}
                            suffix="%"
                            onChange={(n) =>
                              movePhoto(photo.id, { shift: n / 100 })
                            }
                          />
                          <Amount
                            label="Print angle"
                            hint="Tilts the photo like a print tossed on a table."
                            value={photo.rotation}
                            min={-15}
                            max={15}
                            suffix="°"
                            onChange={(rotation) =>
                              movePhoto(photo.id, { rotation })
                            }
                          />
                        </>
                      ) : null}
                      <Separator />
                      <Field>
                        <Toggle
                          pressed={project.atmospheric}
                          onPressedChange={(atmospheric) =>
                            change({ atmospheric })
                          }
                          variant="outline"
                        >
                          <SparklesIcon data-icon="inline-start" />
                          Atmospheric backdrop
                        </Toggle>
                        <FieldDescription>
                          Fills the space behind your photos with artwork made
                          from them, instead of a flat color. Applies to every
                          slide.
                        </FieldDescription>
                      </Field>
                      {project.atmospheric ? (
                        <BackdropControls
                          settings={{
                            ...project.backdrop,
                            photoField: photo.field,
                          }}
                          image={photo.image}
                          photoColors={photo.colors}
                          onChange={(backdrop) => change({ backdrop })}
                        />
                      ) : null}
                    </FieldGroup>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>No photo selected yet.</EmptyTitle>
                        <EmptyDescription>
                          Add your photos to start framing.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>
                <TabsContent value="sound" className="pt-3">
                  <FieldGroup>
                    {project.mode !== "story" ? (
                      <Alert>
                        <AlertTitle>Give it some movement.</AlertTitle>
                        <AlertDescription>
                          Sound and motion apply to Story videos and animated
                          teasers in your matching set.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <Separator />
                    <Choice
                      label="Transition"
                      value={project.transition}
                      options={TRANSITIONS}
                      art={(transition) => (
                        <TransitionArt transition={transition} />
                      )}
                      onChange={(transition) => change({ transition })}
                    />
                    {project.transition !== "cut" ? (
                      <Amount
                        label="Transition length"
                        hint="How long each change between scenes takes."
                        value={project.transitionSeconds}
                        min={0.05}
                        max={2}
                        step={0.05}
                        suffix=" s"
                        onChange={(transitionSeconds) =>
                          change({ transitionSeconds })
                        }
                      />
                    ) : null}
                    <Field>
                      <Toggle
                        pressed={project.reveal}
                        onPressedChange={(reveal) => change({ reveal })}
                        variant="outline"
                      >
                        Reveal collage photos in sequence
                      </Toggle>
                      <FieldDescription>
                        In layouts with several photos, each one fades up into
                        place after the last instead of all at once.
                      </FieldDescription>
                    </Field>
                    <Choice
                      label="Camera motion"
                      value={project.motion}
                      options={MOTIONS}
                      art={(motion) => <MotionArt motion={motion} />}
                      columns={4}
                      hint="Moves Fill photos and the Photo blur backdrop. Fit photos stay put so no edge gets cropped, and other backdrops have their own animation."
                      onChange={(motion) => change({ motion })}
                    />
                    {project.motion !== "none" ? (
                      <Amount
                        label="Motion intensity"
                        hint="How far the camera moves."
                        value={project.motionStrength}
                        suffix="%"
                        onChange={(motionStrength) =>
                          change({ motionStrength })
                        }
                      />
                    ) : null}
                    <Separator />
                    <Amount
                      label="Music reactivity"
                      hint="How strongly the backdrop pulses with your music. Turning it up also switches on the atmospheric backdrop."
                      value={project.reactive}
                      suffix="%"
                      onChange={(reactive) =>
                        change({
                          reactive,
                          ...(reactive > 0 ? { atmospheric: true } : {}),
                        })
                      }
                    />
                    {project.reactive > 0 ? (
                      <Choice
                        label="React to"
                        value={project.reaction}
                        options={REACTIONS}
                        art={(reaction) => <ReactionArt reaction={reaction} />}
                        hint={
                          analysis
                            ? undefined
                            : "Add an audio file to drive the backdrop with real sound."
                        }
                        onChange={(reaction) => change({ reaction })}
                      />
                    ) : null}
                    {scenes > 1 ? (
                      <>
                        <Separator />
                        <Field>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              Photo timing
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => change({ cuts: [] })}
                            >
                              Even spacing
                            </Button>
                          </div>
                          <FieldDescription>
                            A scene is the group of photos on screen together.
                            Your layout decides how many share one.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <Button
                            variant="outline"
                            disabled={!analysis?.beats.length || duration <= 0}
                            onClick={() => {
                              if (analysis)
                                change({
                                  cuts: snapCutsToBeats(
                                    project,
                                    scenes,
                                    analysis.beats,
                                    selection[0],
                                    duration,
                                  ),
                                });
                            }}
                          >
                            <AudioLinesIcon data-icon="inline-start" />
                            Snap changes to detected beats
                          </Button>
                          <FieldDescription>
                            {analysis?.beats.length
                              ? "Moves each scene change to the nearest beat Sonora heard in your song."
                              : "Add audio with a clear beat to line scene changes up with it."}
                          </FieldDescription>
                        </Field>
                        <FieldDescription>
                          Times count from the start of the story. Type seconds
                          (4.5) or minutes:seconds (0:04.5).
                        </FieldDescription>
                        {cuts.slice(1, -1).map((cut, i) => (
                          <TimeField
                            key={
                              photos[(i + 1) * capacity(project.layout)]?.id ??
                              i
                            }
                            label={`Scene ${i + 2} starts at`}
                            value={cut * duration}
                            onChange={(seconds) =>
                              change({
                                cuts: updateCut(
                                  project,
                                  scenes,
                                  i + 1,
                                  seconds,
                                  duration,
                                ),
                              })
                            }
                          />
                        ))}
                      </>
                    ) : null}
                  </FieldGroup>
                </TabsContent>
                <TabsContent value="lyrics" keepMounted className="pt-3">
                  <LyricsEditor
                    track={project.lyrics}
                    onChange={(lyrics) => change({ lyrics })}
                    transport={audioTransport}
                    range={audio ? selection : [0, duration]}
                    time={(audio ? selection[0] : 0) + time}
                    audio={audio}
                    analysis={analysis}
                    playing={playing}
                    active={panel === "lyrics"}
                    disabled={working}
                    isStory={
                      (project.mode === "story" && variant !== "cover") ||
                      variant === "teaser"
                    }
                    onAddAudio={() => audioInput.current?.click()}
                    onSeek={seekAudio}
                    onStory={() => {
                      change({ mode: "story" });
                      setVariant("main");
                    }}
                  />
                </TabsContent>
              </Tabs>
            </fieldset>
          </div>
          <div className="studio-export">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-xl italic">Ready when you are.</p>
              <Badge variant="secondary">No watermark</Badge>
            </div>
            <Button
              size="lg"
              className="studio-export-cta"
              disabled={
                !ready ||
                working ||
                (project.mode === "story" && variant !== "cover" && !videoReady)
              }
              onClick={() => void runExport("current")}
            >
              <ArrowDownToLineIcon data-icon="inline-start" />
              {variant === "cover"
                ? "Export cover"
                : variant === "teaser" && project.mode !== "story"
                  ? "Export story image"
                  : project.mode === "story"
                    ? "Export story video"
                    : project.mode === "carousel"
                      ? `Export ${pages} ${pages === 1 ? "slide" : "slides"}`
                      : "Export post"}
            </Button>
            <details className="matching-set">
              <summary>
                Make a matching set <ChevronDownIcon className="size-4" />
              </summary>
              <div className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  All your slides, a cover, and a story teaser in one ZIP, so
                  your feed post and story match. Use Composition, Story teaser,
                  and Cover above the preview to adjust each version.
                </p>
                <Choice
                  label="Story teaser"
                  value={animatedSet ? "video" : "image"}
                  options={TEASER_FORMATS}
                  onChange={(v) => setAnimatedSet(v === "video")}
                />
                <Button
                  variant="outline"
                  disabled={!ready || working || (animatedSet && !videoReady)}
                  onClick={() => void runExport("set")}
                >
                  <LayersIcon data-icon="inline-start" />
                  Export matching set
                </Button>
              </div>
            </details>
            {working ? (
              <div className="flex flex-col gap-3" aria-live="polite">
                <Progress value={progress * 100} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {status} {Math.round(progress * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      controller.current?.abort();
                      setStatus("Cancelling…");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : status && !result ? (
              <output className="text-xs text-muted-foreground">
                {status}
              </output>
            ) : null}
            {result ? (
              <Alert className="studio-result">
                <CheckIcon />
                <AlertTitle>Your export is ready.</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      render={
                        <a href={result.url} download={result.name}>
                          Download{" "}
                          {result.name.endsWith(".zip")
                            ? "ZIP"
                            : result.name.endsWith(".mp4")
                              ? "MP4"
                              : "PNG"}
                        </a>
                      }
                      nativeButton={false}
                      size="sm"
                    >
                      Download{" "}
                      {result.name.endsWith(".zip")
                        ? "ZIP"
                        : result.name.endsWith(".mp4")
                          ? "MP4"
                          : "PNG"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void share()}
                    >
                      <Share2Icon data-icon="inline-start" />
                      Share
                    </Button>
                  </div>
                  <span className="text-xs">
                    {(result.blob.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {result.name}
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Something needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </aside>
      </div>
      <footer className="studio-footer">
        <span>
          <em>Made for the moments</em> between the big moments.
        </span>
        <span>No accounts. No uploads. Just your browser.</span>
      </footer>
    </main>
  );
}
