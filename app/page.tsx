import { LockKeyholeIcon, Music2Icon } from "lucide-react";

import { SonoraEditor } from "@/components/sonora-editor";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="flex-1">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="/"
            className="flex items-center gap-2"
            aria-label="Sonora home"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Music2Icon className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              sonora.party
            </span>
          </a>
          <Badge variant="secondary">
            <LockKeyholeIcon data-icon="inline-start" />
            Local-only
          </Badge>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <section className="flex max-w-3xl flex-col gap-4">
          <Badge variant="outline">Dynamic picture stories • 60 FPS</Badge>
          <div className="flex flex-col gap-3">
            <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Make one photo feel alive.
            </h1>
            <p className="max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
              Frame it, give it motion, cut the exact audio, and export a
              high-quality 1080 × 1920 video at 60 FPS. No upload, account,
              queue, or fake duration limit.
            </p>
          </div>
        </section>

        <SonoraEditor />

        <footer className="flex flex-col justify-between gap-2 border-t py-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            Sonora processes every photo, audio file, and video in your browser.
          </p>
          <p>sonora.party</p>
        </footer>
      </div>
    </main>
  );
}
