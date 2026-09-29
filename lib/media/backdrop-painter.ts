import { drawBackdrop } from "@/lib/media/backdrop";
import type { BackdropSettings } from "@/lib/media/composition";

export type BackdropPainter = {
  draw: (
    context: CanvasRenderingContext2D,
    settings: BackdropSettings,
    progress: number,
  ) => void;
  dispose: () => void;
};

export async function createBackdropPainter(
  settings: Pick<BackdropSettings, "style" | "photoField">,
  thumbnail = false,
): Promise<BackdropPainter> {
  if (settings.style === "melt") {
    const { createPhotoMelt } = await import("@/lib/media/photo-melt");
    return createPhotoMelt(settings.photoField, thumbnail);
  }
  return { draw: drawBackdrop, dispose: () => {} };
}
