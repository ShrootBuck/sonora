import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  thumbLabels,
  ...props
}: SliderPrimitive.Root.Props & { thumbLabels?: string[] }) {
  const _values =
    value !== undefined
      ? Array.isArray(value)
        ? value
        : [value]
      : defaultValue !== undefined
        ? Array.isArray(defaultValue)
          ? defaultValue
          : [defaultValue]
        : [min];
  const thumbIds = Array.from(
    { length: _values.length },
    (_, index) => `thumb-${index}`,
  );

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-foreground/10 select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {thumbIds.map((thumbId, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={thumbId}
            index={index}
            aria-labelledby={ariaLabelledBy}
            getAriaLabel={
              thumbLabels?.[index] || ariaLabel
                ? () =>
                    thumbLabels?.[index] ??
                    (thumbIds.length > 1
                      ? `${ariaLabel} ${index + 1}`
                      : (ariaLabel ?? ""))
                : undefined
            }
            className="relative block size-3.5 shrink-0 rounded-full bg-foreground shadow-sm ring-primary/40 transition-[color,box-shadow,transform] select-none after:absolute after:-inset-2 hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden active:ring-4 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
