"use client";

import {
  FileAudioIcon,
  ImageIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type FileDropProps = {
  kind: "image" | "audio";
  file: File | null;
  onFile: (file: File) => void;
  compact?: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function FileDrop({
  kind,
  file,
  onFile,
  compact = false,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isImage = kind === "image";
  const Icon = isImage ? ImageIcon : FileAudioIcon;
  const label = isImage ? "photo" : "audio";

  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    if (
      isImage &&
      !candidate.type.startsWith("image/") &&
      !/\.(avif|heic|heif|jpe?g|png|webp)$/i.test(candidate.name)
    ) {
      return;
    }
    if (
      !isImage &&
      candidate.type &&
      !candidate.type.startsWith("audio/") &&
      !/\.(aac|aif|aiff|alac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(
        candidate.name,
      )
    ) {
      return;
    }
    onFile(candidate);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop is supplemental; the nested file input and button provide the keyboard path.
    <div
      className={cn(
        "rounded-xl border border-dashed transition-colors",
        dragging ? "border-primary bg-accent" : "border-border bg-muted/30",
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (
          !event.relatedTarget ||
          !event.currentTarget.contains(event.relatedTarget as Node)
        ) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={isImage ? "image/*,.heic,.heif" : "audio/*"}
        onChange={(event) => acceptFile(event.target.files?.[0])}
      />

      {file ? (
        <div className="flex items-center gap-3 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">{label}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Replace ${label}`}
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCwIcon />
          </Button>
        </div>
      ) : (
        <Empty className={cn("border-0", compact ? "p-4" : "min-h-52 p-6")}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>Choose your {label}</EmptyTitle>
            <EmptyDescription>
              {isImage
                ? "HEIC, JPEG, PNG, or WebP. Drag it here or browse your device."
                : "Use any audio format your browser and FFmpeg can decode."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon data-icon="inline-start" />
              Browse {isImage ? "photos" : "audio"}
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
