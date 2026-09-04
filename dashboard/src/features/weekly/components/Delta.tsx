import { deltaKind } from "@features/weekly/model/weekly";
import { formatPercentMagnitude } from "@shared/lib/format";

export default function Delta({
  ratio,
  baseline,
  format,
}: {
  ratio: number | null;
  baseline: number;
  format: (value: number) => string;
}) {
  const kind = deltaKind(ratio);
  if (kind === "first-week") {
    return (
      <span className="text-[10px] font-medium text-muted" title="Nothing in the same days last week">
        new
      </span>
    );
  }
  if (kind === "negligible") {
    return (
      <span
        className="text-[10px] font-medium text-muted"
        title={`Up from ${format(baseline)} in the same days last week — too small a base for a useful percentage`}
      >
        ▲ from ~0
      </span>
    );
  }
  if (kind === "unchanged") {
    return <span className="text-[10px] font-medium text-muted">±0%</span>;
  }
  return (
    <span className={`text-[10px] font-semibold ${kind === "down" ? "text-ok-strong" : "text-muted"}`}>
      {kind === "down" ? "▼" : "▲"} {formatPercentMagnitude(ratio, 1)}
    </span>
  );
}
