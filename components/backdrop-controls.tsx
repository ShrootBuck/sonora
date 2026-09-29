"use client";

import { ShuffleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BACKDROP_PALETTES,
  BACKDROP_STYLES,
  resolveBackdrop,
} from "@/lib/media/backdrop";
import {
  type BackdropPainter,
  createBackdropPainter,
} from "@/lib/media/backdrop-painter";
import {
  type BackdropColors,
  type BackdropSettings,
  type BackdropStyle,
  type MotionSpeed,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "@/lib/media/composition";

function BackdropSwatch({
  settings,
  image,
}: {
  settings: BackdropSettings;
  image: HTMLImageElement;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [painter, setPainter] = useState<BackdropPainter | null>(null);
  useEffect(() => {
    let disposed = false;
    let active: BackdropPainter | undefined;
    setPainter(null);
    void createBackdropPainter(
      { style: settings.style, photoField: settings.photoField },
      true,
    )
      .then((next) => {
        if (disposed) {
          next.dispose();
          return;
        }
        active = next;
        setPainter(next);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      active?.dispose();
    };
  }, [settings.style, settings.photoField]);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.setTransform(120 / STORY_WIDTH, 0, 0, 120 / STORY_WIDTH, 0, 0);
    if (settings.style === "photo") {
      context.save();
      context.filter = "blur(3px)";
      const scale =
        Math.max(
          STORY_WIDTH / image.naturalWidth,
          STORY_HEIGHT / image.naturalHeight,
        ) * 1.1;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (STORY_WIDTH - width) / 2,
        (STORY_HEIGHT - height) / 2,
        width,
        height,
      );
      context.restore();
    } else painter?.draw(context, { ...settings, grain: 0 }, 0);
  }, [settings, image, painter]);
  return (
    <canvas
      ref={ref}
      width={120}
      height={68}
      className="h-12 w-full rounded-sm"
      role="img"
      aria-label={`${settings.style} preview`}
    />
  );
}

function Amount({
  id,
  label,
  value,
  onChange,
  max = 100,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="font-mono text-xs text-muted-foreground">
          {value}%
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        min={0}
        max={max}
        step={1}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "number") onChange(next);
        }}
      />
    </Field>
  );
}

export function BackdropControls({
  settings,
  image,
  photoColors,
  onChange,
}: {
  settings: BackdropSettings;
  image: HTMLImageElement;
  photoColors: BackdropColors;
  onChange: (settings: BackdropSettings) => void;
}) {
  const resolved = resolveBackdrop(settings, photoColors);
  const change = (patch: Partial<BackdropSettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <FieldGroup>
      <Field>
        <FieldLabel id="backdrop-style-label">Backdrop</FieldLabel>
        <ToggleGroup
          aria-labelledby="backdrop-style-label"
          value={[settings.style]}
          variant="outline"
          className="grid w-full grid-cols-3 gap-2"
          onValueChange={(values) => {
            if (values[0])
              change({
                style: values[0] as BackdropStyle,
                ...(values[0] === "grain" ? { grain: 45 } : {}),
              });
          }}
        >
          {BACKDROP_STYLES.map((style) => (
            <ToggleGroupItem
              key={style.value}
              value={style.value}
              className="h-auto min-w-0 flex-col gap-2 p-2"
            >
              <BackdropSwatch
                image={image}
                settings={{ ...resolved, style: style.value }}
              />
              {style.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          {
            BACKDROP_STYLES.find((style) => style.value === settings.style)
              ?.description
          }
        </FieldDescription>
      </Field>
      {settings.style !== "photo" ? (
        <>
          <Field>
            <FieldLabel id="backdrop-palette-label">Colors</FieldLabel>
            <ToggleGroup
              aria-labelledby="backdrop-palette-label"
              value={[settings.palette]}
              variant="outline"
              className="flex-wrap"
              onValueChange={(values) => {
                if (values[0]) change({ palette: values[0] });
              }}
            >
              <ToggleGroupItem value="photo">From photo</ToggleGroupItem>
              {BACKDROP_PALETTES.map((palette) => (
                <ToggleGroupItem key={palette.value} value={palette.value}>
                  <span
                    className="flex overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    {palette.colors.map((color) => (
                      <span
                        key={color}
                        className="h-3 w-1.5"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  {palette.label}
                </ToggleGroupItem>
              ))}
              {settings.palette === "custom" ? (
                <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
              ) : null}
            </ToggleGroup>
            <FieldDescription>
              From photo uses your image’s own colors. Other palettes are
              optional.
            </FieldDescription>
          </Field>
          {settings.style === "melt" && settings.palette === "photo" ? (
            <FieldDescription>
              Photo melt uses the full color map of this photo, including its
              soft textures. Choose a palette to recolor it.
            </FieldDescription>
          ) : (
            <FieldGroup className="grid grid-cols-3 gap-3">
              {(["Base", "Color", "Accent"] as const).map((label, index) => (
                <Field key={label}>
                  <FieldLabel htmlFor={`backdrop-color-${index}`}>
                    {label}
                  </FieldLabel>
                  <Input
                    type="color"
                    id={`backdrop-color-${index}`}
                    value={resolved.colors[index]}
                    onChange={(event) => {
                      const colors: BackdropColors = [...resolved.colors];
                      colors[index] = event.target.value;
                      change({ palette: "custom", colors });
                    }}
                  />
                </Field>
              ))}
            </FieldGroup>
          )}
          {settings.style !== "solid" ? (
            <>
              <Field>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FieldLabel id="backdrop-animation-label">
                    Animation
                  </FieldLabel>
                  <ToggleGroup
                    aria-labelledby="backdrop-animation-label"
                    value={[settings.animated ? "flow" : "still"]}
                    variant="outline"
                    spacing={0}
                    onValueChange={(values) => {
                      if (values[0]) change({ animated: values[0] === "flow" });
                    }}
                  >
                    <ToggleGroupItem value="still">Still</ToggleGroupItem>
                    <ToggleGroupItem value="flow">Flow</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <FieldDescription>
                  Only the backdrop moves. Your whole photo stays sharp.
                </FieldDescription>
              </Field>
              {settings.animated ? (
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <FieldLabel id="backdrop-speed-label">Pace</FieldLabel>
                    <ToggleGroup
                      aria-labelledby="backdrop-speed-label"
                      value={[settings.speed]}
                      variant="outline"
                      spacing={0}
                      onValueChange={(values) => {
                        if (values[0])
                          change({ speed: values[0] as MotionSpeed });
                      }}
                    >
                      <ToggleGroupItem value="slow">Slow</ToggleGroupItem>
                      <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
                      <ToggleGroupItem value="fast">Fast</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </Field>
              ) : null}
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Amount
                  id="backdrop-intensity"
                  label="Intensity"
                  value={settings.intensity}
                  onChange={(intensity) => change({ intensity })}
                />
                <Amount
                  id="backdrop-detail"
                  label="Detail"
                  value={settings.detail}
                  onChange={(detail) => change({ detail })}
                />
              </FieldGroup>
            </>
          ) : null}
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <Amount
              id="backdrop-grain"
              label="Grain"
              value={settings.grain}
              onChange={(grain) => change({ grain })}
            />
            <Amount
              id="backdrop-dim"
              label="Dim backdrop"
              value={settings.dim}
              max={85}
              onChange={(dim) => change({ dim })}
            />
          </FieldGroup>
          {settings.style !== "solid" ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => change({ seed: settings.seed + 1 })}
            >
              <ShuffleIcon data-icon="inline-start" /> Shuffle pattern
            </Button>
          ) : null}
        </>
      ) : null}
    </FieldGroup>
  );
}
