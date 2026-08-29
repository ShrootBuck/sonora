"use client";

import Konva from "konva";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";

import {
  type CompositionSettings,
  clampPan,
  FULL_DURATION_PRESETS,
  getBackgroundRect,
  getImageRect,
  getMotionTransform,
  motionLoopSeconds,
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryVisual,
} from "@/lib/media/composition";

export type StoryCanvasHandle = {
  exportVisual: () => Promise<StoryVisual>;
};

type StoryCanvasProps = {
  image: HTMLImageElement;
  motionDuration: number;
  settings: CompositionSettings;
  onSettingsChange: (settings: CompositionSettings) => void;
};

export const StoryCanvas = forwardRef<StoryCanvasHandle, StoryCanvasProps>(
  function StoryCanvas(
    { image, motionDuration, settings, onSettingsChange },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    const backgroundLayerRef = useRef<Konva.Layer>(null);
    const backgroundRef = useRef<Konva.Image>(null);
    const foregroundLayerRef = useRef<Konva.Layer>(null);
    const foregroundRef = useRef<Konva.Image>(null);
    const guideLayerRef = useRef<Konva.Layer>(null);
    const backgroundAnimationRef = useRef<Konva.Animation>(null);
    const pinchDistanceRef = useRef<number | null>(null);
    const pinchZoomRef = useRef(settings.zoom);
    const [displayWidth, setDisplayWidth] = useState(360);

    useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const resizeObserver = new ResizeObserver(([entry]) => {
        setDisplayWidth(entry.contentRect.width);
      });
      resizeObserver.observe(wrapper);
      return () => resizeObserver.disconnect();
    }, []);

    const foregroundRect = useMemo(
      () =>
        getImageRect(
          image.naturalWidth,
          image.naturalHeight,
          settings.mode,
          settings.zoom,
          settings.panX,
          settings.panY,
        ),
      [image, settings.mode, settings.panX, settings.panY, settings.zoom],
    );

    const backgroundRect = useMemo(
      () => getBackgroundRect(image.naturalWidth, image.naturalHeight),
      [image],
    );

    useEffect(() => {
      const background = backgroundRef.current;
      if (!background || settings.mode !== "fit") return;

      background.setAttrs({
        image,
        x: backgroundRect.x,
        y: backgroundRect.y,
        width: backgroundRect.width,
        height: backgroundRect.height,
        blurRadius: settings.blur,
      });
      background.clearCache();
      background.cache({ pixelRatio: 1 });
      background.getLayer()?.batchDraw();
    }, [backgroundRect, image, settings.blur, settings.mode]);

    useEffect(() => {
      const background = backgroundRef.current;
      const backgroundLayer = backgroundLayerRef.current;
      const foregroundLayer = foregroundLayerRef.current;
      backgroundAnimationRef.current?.stop();
      backgroundAnimationRef.current = null;
      if (!foregroundLayer) return;

      const resetMotion = () => {
        if (background) {
          background.position({ x: backgroundRect.x, y: backgroundRect.y });
          background.offset({ x: 0, y: 0 });
          background.scale({ x: 1, y: 1 });
          background.rotation(0);
        }
        foregroundLayer.position({ x: 0, y: 0 });
        foregroundLayer.offset({ x: 0, y: 0 });
        foregroundLayer.scale({ x: 1, y: 1 });
        foregroundLayer.rotation(0);
      };

      resetMotion();
      const animatedLayer =
        settings.mode === "fit" ? backgroundLayer : foregroundLayer;
      if (
        settings.motionPreset === "none" ||
        !animatedLayer ||
        (settings.mode === "fit" && !background)
      ) {
        backgroundLayer?.batchDraw();
        foregroundLayer.batchDraw();
        return;
      }

      const previewSeconds =
        FULL_DURATION_PRESETS.has(settings.motionPreset) && motionDuration > 0
          ? motionDuration
          : motionLoopSeconds(settings.motionSpeed);
      const frameCount = Math.max(2, previewSeconds * 60);
      const animation = new Konva.Animation((frame) => {
        if (!frame) return;
        const motionFrame = ((frame.time / 1000) * 60) % frameCount;
        const transform = getMotionTransform(
          settings.motionPreset,
          settings.motionStrength,
          motionFrame,
          frameCount,
        );
        const rotation = transform.rotation * (180 / Math.PI);

        if (settings.mode === "fit" && background) {
          const centerX = backgroundRect.x + backgroundRect.width / 2;
          const centerY = backgroundRect.y + backgroundRect.height / 2;
          background.offset({
            x: backgroundRect.width / 2,
            y: backgroundRect.height / 2,
          });
          background.position({
            x: centerX + transform.x,
            y: centerY + transform.y,
          });
          background.scale({ x: transform.scale, y: transform.scale });
          background.rotation(rotation);
        } else {
          foregroundLayer.offset({
            x: STORY_WIDTH / 2,
            y: STORY_HEIGHT / 2,
          });
          foregroundLayer.position({
            x: STORY_WIDTH / 2 + transform.x,
            y: STORY_HEIGHT / 2 + transform.y,
          });
          foregroundLayer.scale({ x: transform.scale, y: transform.scale });
          foregroundLayer.rotation(rotation);
        }
      }, animatedLayer);

      backgroundAnimationRef.current = animation;
      animation.start();
      return () => {
        animation.stop();
        if (backgroundAnimationRef.current === animation) {
          backgroundAnimationRef.current = null;
        }
        resetMotion();
        backgroundLayer?.batchDraw();
        foregroundLayer.batchDraw();
      };
    }, [
      backgroundRect,
      motionDuration,
      settings.mode,
      settings.motionPreset,
      settings.motionSpeed,
      settings.motionStrength,
    ]);

    useEffect(() => {
      pinchZoomRef.current = settings.zoom;
    }, [settings.zoom]);

    useImperativeHandle(
      ref,
      () => ({
        exportVisual: async () => {
          const stage = stageRef.current;
          const backgroundLayer = backgroundLayerRef.current;
          const foregroundLayer = foregroundLayerRef.current;
          const background = backgroundRef.current;
          const guideLayer = guideLayerRef.current;
          if (!stage) throw new Error("The story canvas is not ready yet.");

          const guidesWereVisible = guideLayer?.visible() ?? false;
          const animation = backgroundAnimationRef.current;
          animation?.stop();
          guideLayer?.visible(false);
          if (background && settings.mode === "fit") {
            background.position({ x: backgroundRect.x, y: backgroundRect.y });
            background.offset({ x: 0, y: 0 });
            background.scale({ x: 1, y: 1 });
            background.rotation(0);
          }
          foregroundLayer?.position({ x: 0, y: 0 });
          foregroundLayer?.offset({ x: 0, y: 0 });
          foregroundLayer?.scale({ x: 1, y: 1 });
          foregroundLayer?.rotation(0);
          stage.draw();

          const toPng = (node: Konva.Node) => {
            const canvas = node.toCanvas({
              x: 0,
              y: 0,
              width: STORY_WIDTH,
              height: STORY_HEIGHT,
              pixelRatio: 1,
            });
            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else
                  reject(new Error("The browser could not render the frame."));
              }, "image/png");
            });
          };

          try {
            if (
              settings.mode === "fit" &&
              settings.motionPreset !== "none" &&
              backgroundLayer &&
              foregroundLayer
            ) {
              const [backgroundBlob, foregroundBlob] = await Promise.all([
                toPng(backgroundLayer),
                toPng(foregroundLayer),
              ]);
              return {
                kind: "layers",
                background: backgroundBlob,
                foreground: foregroundBlob,
                motionPreset: settings.motionPreset,
                motionStrength: settings.motionStrength,
                loopSeconds: motionLoopSeconds(settings.motionSpeed),
              };
            }

            return {
              kind: "composite",
              frame: await toPng(stage),
              motionPreset: settings.motionPreset,
              motionStrength: settings.motionStrength,
              loopSeconds: motionLoopSeconds(settings.motionSpeed),
            };
          } finally {
            guideLayer?.visible(guidesWereVisible);
            stage.draw();
            animation?.start();
          }
        },
      }),
      [
        backgroundRect,
        settings.mode,
        settings.motionPreset,
        settings.motionSpeed,
        settings.motionStrength,
      ],
    );

    const updatePanFromNode = (node: Konva.Image) => {
      const centered = getImageRect(
        image.naturalWidth,
        image.naturalHeight,
        settings.mode,
        settings.zoom,
        0,
        0,
      );
      const next = clampPan(
        image.naturalWidth,
        image.naturalHeight,
        settings.mode,
        settings.zoom,
        node.x() - centered.x,
        node.y() - centered.y,
      );

      onSettingsChange({ ...settings, ...next });
    };

    const applyZoom = (zoom: number) => {
      const nextZoom = Math.max(1, Math.min(4, zoom));
      const nextPan = clampPan(
        image.naturalWidth,
        image.naturalHeight,
        settings.mode,
        nextZoom,
        settings.panX,
        settings.panY,
      );
      onSettingsChange({
        ...settings,
        zoom: nextZoom,
        ...nextPan,
      });
    };

    const displayScale = displayWidth / STORY_WIDTH;

    return (
      <div
        ref={wrapperRef}
        className="relative aspect-[9/16] w-full overflow-hidden rounded-[1.75rem] bg-story-canvas shadow-2xl ring-1 ring-foreground/10"
      >
        <Stage
          ref={stageRef}
          width={STORY_WIDTH}
          height={STORY_HEIGHT}
          style={{
            transform: `scale(${displayScale})`,
            transformOrigin: "top left",
          }}
          onWheel={(event) => {
            event.evt.preventDefault();
            applyZoom(settings.zoom * (event.evt.deltaY > 0 ? 0.94 : 1.06));
          }}
          onTouchMove={(event) => {
            const touches = event.evt.touches;
            if (touches.length !== 2) return;
            event.evt.preventDefault();
            const distance = Math.hypot(
              touches[0].clientX - touches[1].clientX,
              touches[0].clientY - touches[1].clientY,
            );
            if (pinchDistanceRef.current === null) {
              pinchDistanceRef.current = distance;
              pinchZoomRef.current = settings.zoom;
              foregroundRef.current?.stopDrag();
              return;
            }
            applyZoom(
              pinchZoomRef.current * (distance / pinchDistanceRef.current),
            );
          }}
          onTouchEnd={() => {
            pinchDistanceRef.current = null;
          }}
        >
          <Layer ref={backgroundLayerRef} listening={false}>
            <Rect
              x={0}
              y={0}
              width={STORY_WIDTH}
              height={STORY_HEIGHT}
              fill="#11100f"
            />
            {settings.mode === "fit" ? (
              <KonvaImage
                ref={backgroundRef}
                image={image}
                x={backgroundRect.x}
                y={backgroundRect.y}
                width={backgroundRect.width}
                height={backgroundRect.height}
                filters={[Konva.Filters.Blur]}
                blurRadius={settings.blur}
                listening={false}
                perfectDrawEnabled={false}
              />
            ) : null}
          </Layer>

          <Layer ref={foregroundLayerRef}>
            <KonvaImage
              ref={foregroundRef}
              image={image}
              x={foregroundRect.x}
              y={foregroundRect.y}
              width={foregroundRect.width}
              height={foregroundRect.height}
              draggable
              perfectDrawEnabled={false}
              onDragMove={(event) =>
                updatePanFromNode(event.target as Konva.Image)
              }
              onDragEnd={(event) =>
                updatePanFromNode(event.target as Konva.Image)
              }
              dragBoundFunc={(position) => {
                const centered = getImageRect(
                  image.naturalWidth,
                  image.naturalHeight,
                  settings.mode,
                  settings.zoom,
                  0,
                  0,
                );
                const next = clampPan(
                  image.naturalWidth,
                  image.naturalHeight,
                  settings.mode,
                  settings.zoom,
                  position.x - centered.x,
                  position.y - centered.y,
                );
                return {
                  x: centered.x + next.panX,
                  y: centered.y + next.panY,
                };
              }}
            />
          </Layer>

          <Layer
            ref={guideLayerRef}
            visible={settings.showGuides}
            listening={false}
          >
            <Rect
              x={0}
              y={0}
              width={STORY_WIDTH}
              height={184}
              fill="rgba(0,0,0,0.38)"
            />
            <Line
              points={[0, 184, STORY_WIDTH, 184]}
              stroke="rgba(255,255,255,0.72)"
              dash={[16, 14]}
            />
            <Text
              x={40}
              y={118}
              text="STORY UI"
              fill="rgba(255,255,255,0.84)"
              fontFamily="Arial"
              fontSize={26}
              letterSpacing={3}
            />
            <Rect
              x={0}
              y={1640}
              width={STORY_WIDTH}
              height={280}
              fill="rgba(0,0,0,0.38)"
            />
            <Line
              points={[0, 1640, STORY_WIDTH, 1640]}
              stroke="rgba(255,255,255,0.72)"
              dash={[16, 14]}
            />
            <Text
              x={40}
              y={1680}
              text="REPLY CONTROLS"
              fill="rgba(255,255,255,0.84)"
              fontFamily="Arial"
              fontSize={26}
              letterSpacing={3}
            />
          </Layer>
        </Stage>
      </div>
    );
  },
);
