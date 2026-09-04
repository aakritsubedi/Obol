import type { Summary } from "@shared/api";
import { formatCurrency } from "@shared/lib/format";
import { providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import { useEffect, useRef, useState } from "react";

interface Props {
  summary: Summary;
}

export default function Ticker({ summary }: Props) {
  const total = summary.today.totalCost;
  const providers = [...summary.agents].sort((a, b) => b.totalCost - a.totalCost);
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [duration, setDuration] = useState(24);

  // The bar hugs its content until it hits the max width; past that the
  // entries loop in a marquee so every provider stays visible.
  useEffect(() => {
    void providers;
    const element = trackRef.current;
    if (!element) return;
    const update = () => {
      const clipped = element.scrollWidth > element.clientWidth + 1;
      setOverflowing(clipped);
      if (clipped) {
        const seconds = Math.min(60, Math.max(14, Math.round(element.scrollWidth / 45)));
        setDuration(seconds);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [providers]);

  const entries = (hidden: boolean) =>
    providers.map((provider) => {
      const share = total > 0 ? Math.max(0, provider.totalCost / total) : 0;
      // Share is composition, not a good/bad signal, so it stays neutral gray.
      // Green/red are reserved for cost deltas (green = cheaper).
      return (
        <span
          aria-hidden={hidden || undefined}
          className="flex shrink-0 items-center gap-1.5 text-[10px] text-surface/70"
          key={`${hidden ? "clone-" : ""}${provider.agent}`}
        >
          <ProviderLogo agent={provider.agent} size={14} />
          <strong className="font-semibold text-surface">{providerName(provider.agent)}</strong>
          <span>{formatCurrency(provider.totalCost)}</span>
          <em className="not-italic tabular-nums">{Math.round(share * 100)}%</em>
        </span>
      );
    });

  return (
    <aside
      className="mx-auto flex h-10 w-full min-w-[240px] max-w-[1180px] items-center gap-3.5 overflow-hidden rounded-full bg-ink px-4 text-surface"
      aria-label="Today's provider spend"
    >
      <span className="flex h-full shrink-0 items-center border-r border-surface/20 pr-3.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-surface/60">
        Today
      </span>
      <div ref={trackRef} className="flex min-w-0 flex-1 items-center overflow-hidden">
        <div
          className={`flex w-max items-center gap-[18px] ${overflowing ? "obol-marquee" : ""}`}
          style={overflowing ? ({ "--marquee-duration": `${duration}s` } as React.CSSProperties) : undefined}
        >
          {entries(false)}
          {overflowing && entries(true)}
        </div>
      </div>
    </aside>
  );
}
