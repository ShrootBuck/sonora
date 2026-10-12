"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatTime, parseTime } from "@/lib/media/time";
import type { StudioOption } from "@/lib/studio/options";
import { cn } from "@/lib/utils";

const COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/** One explanation line that previews the hovered or focused choice and
 * otherwise describes the current one, so people can learn without clicking. */
export function OptionNote<T extends string>({
  id,
  options,
  value,
}: {
  id: string;
  options: readonly StudioOption<T>[];
  value: T;
}) {
  const option = options.find((o) => o.value === value);
  if (!option) return null;
  return (
    <FieldDescription id={id} className="studio-option-note">
      <span className="font-medium text-foreground">
        {option.title ?? option.label}.
      </span>{" "}
      {option.description}
    </FieldDescription>
  );
}

export function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  art,
  columns,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: readonly StudioOption<T>[];
  onChange: (value: T) => void;
  /** Renders a visual example above each option's label. */
  art?: (value: T) => ReactNode;
  columns?: number;
}) {
  const id = useId();
  const [preview, setPreview] = useState<T | null>(null);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        aria-label={label}
        aria-describedby={`${id}-note`}
        value={[value]}
        onValueChange={(v) => {
          if (v[0]) onChange(v[0] as T);
        }}
        onPointerLeave={() => setPreview(null)}
        variant="outline"
        spacing={1}
        className={cn(
          "w-full",
          art
            ? cn(
                // Stretch so every tile in a row matches the tallest artwork.
                "grid items-stretch gap-1.5",
                COLUMNS[columns ?? Math.min(options.length, 3)],
              )
            : options.length > 5
              ? "grid grid-cols-3"
              : "flex flex-wrap",
        )}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className={cn(
              "flex-1",
              art && "studio-option h-auto min-w-0 flex-col gap-1.5 px-1 py-2",
            )}
            onPointerEnter={() => setPreview(o.value)}
            onFocus={() => setPreview(o.value)}
            onBlur={() => setPreview(null)}
          >
            {art ? (
              <>
                <span className="studio-art-box">{art(o.value)}</span>
                <span className="studio-option-label">{o.label}</span>
              </>
            ) : (
              o.label
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <OptionNote
        id={`${id}-note`}
        options={options}
        value={preview ?? value}
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export function Amount({
  label,
  hint,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="studio-value">
          {Number(value.toFixed(2))}
          {suffix}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(n) => {
          if (typeof n === "number") onChange(n);
        }}
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export function TimeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(formatTime(value));
  useEffect(() => {
    setText(formatTime(value));
  }, [value]);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseTime(text);
          if (n !== null && n >= 0) onChange(n);
          else setText(formatTime(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
