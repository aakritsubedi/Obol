import type { Report, Summary } from "@shared/api";
import { formatCurrency, heroFontSize } from "@shared/lib/format";
import { CLOSE, DOWNLOAD, Icon } from "@shared/ui/icons";
import { buttonGhost, buttonIcon, buttonPrimary } from "@shared/ui/tokens";
import { useMemo, useState } from "react";
import { exportContributionImage } from "../canvas/drawContributionImage";
import { exportShareImage } from "../canvas/drawShareImage";
import {
  buildShareData,
  SHARE_ADDITIONAL_MODEL_COUNT,
  SHARE_TOP_MODEL_COUNT,
  type ShareRange,
  shareRanges,
  usageComments,
} from "../model/shareData";
import ModelComment from "./ModelComment";
import ModelRow from "./ModelRow";

export {
  SHARE_COLUMN_GAP,
  SHARE_CONTENT_PAD,
  SHARE_MIN_WIDTH,
  SHARE_MODEL_ICON_STEP,
  SHARE_MODEL_METRIC_GAP,
  shareImageWidth,
} from "../canvas/layout";
// Keep the feature's pure public surface available at its component boundary
// while the implementation lives in model/canvas modules.
export {
  buildShareData,
  type ModelTotals,
  rankShareModels,
  SHARE_ADDITIONAL_MODEL_COUNT,
  SHARE_COST_WEIGHT,
  SHARE_TOKEN_WEIGHT,
  SHARE_TOP_MODEL_COUNT,
  type ShareData,
  type ShareModel,
  visibleShareModels,
  weightedModelScore,
} from "../model/shareData";

interface Props {
  report: Report | null;
  summary: Summary;
  onClose: () => void;
}

export default function ShareDialog({ report, summary, onClose }: Props) {
  const [range, setRange] = useState<ShareRange>("today");
  const data = useMemo(() => buildShareData(report, summary, range), [range, report, summary]);
  const topModels = data.models.slice(0, SHARE_TOP_MODEL_COUNT);
  const additionalModels = data.models.slice(
    SHARE_TOP_MODEL_COUNT,
    SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT,
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The modal backdrop intentionally closes on pointer release.
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[980px] overflow-hidden rounded-card border border-hairline bg-card text-ink shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Share usage</p>
            <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em]" id="share-dialog-title">
              Create a social card
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={buttonGhost}
              type="button"
              onClick={() => void exportContributionImage(data.dailyRows)}
            >
              <Icon path={DOWNLOAD} className="h-3.5 w-3.5 shrink-0" />
              Contribution graph
            </button>
            <button className={buttonIcon} type="button" onClick={onClose} aria-label="Close share dialog">
              <Icon path={CLOSE} />
            </button>
          </div>
        </div>
        <div className="grid gap-10 p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="overflow-hidden rounded-card bg-[#111216] font-mono text-[#f5f6f8] shadow-pop">
            <div className="flex h-11 items-center gap-2 bg-[#1d1f25] px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f06b60]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f1bd4a]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#59bf55]" />
              <span className="ml-3 rounded-md bg-[#2a2d35] px-3 py-1 text-[10px] font-semibold text-[#cdd1da]">
                usage/{data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md
              </span>
              <span className="ml-auto text-[9px] text-[#737987]">OBOL / USAGE</span>
            </div>
            <div className="grid grid-cols-[.85fr_1.15fr] max-[640px]:grid-cols-1 [&>div]:min-w-0">
              <div className="p-5 [container-type:inline-size] sm:p-6">
                <div className="text-[12px] text-[#858b98]">{`// ${data.dateLabel.toLowerCase()}`}</div>
                <div
                  className="mt-5 font-bold leading-[1.05] tracking-[-0.06em]"
                  style={{ fontSize: heroFontSize(formatCurrency(data.cost), 48) }}
                >
                  {formatCurrency(data.cost)}
                </div>
                <div className="mt-1 text-[13px] text-[#858b98]">total_spend</div>
                <div className="mt-7 flex flex-wrap gap-1">
                  <div className="block text-[11px] text-[#858b98]">{"// total usage"}</div>
                  <div className="flex flex-wrap gap-2">
                    {usageComments(data).map((part) => (
                      <div className="block text-[11px] text-[#858b98]" key={part.label}>
                        {"//\u00a0"}
                        <span className="text-green-300">{part.value}</span>&nbsp;
                        {part.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-5 text-[10px] font-semibold text-[#858b98]">{"// top models"}</div>
                <div className="space-y-3">
                  {topModels.length ? (
                    topModels.map((model) => (
                      <ModelRow key={`${model.provider}-${model.model}`} model={model} />
                    ))
                  ) : (
                    <div className="text-xs text-[#858b98]">No model detail available yet.</div>
                  )}
                </div>
              </div>
              {additionalModels.length > 0 && (
                <div className="col-span-full border-t border-[#343840] px-5 pb-5 pt-4 sm:px-6">
                  <div className="mb-2 text-[10px] font-semibold text-[#858b98]">
                    {"// other models used"}
                  </div>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-2 min-[520px]:grid-cols-2 [&>span]:min-w-0">
                    {additionalModels.map((model) => (
                      <ModelComment key={`${model.provider}-${model.model}`} model={model} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex h-fit items-center justify-between gap-4 border-t border-[#343840] px-5 py-2.5 text-[10px] sm:px-6">
              <span className="inline-flex items-center gap-2 font-semibold">
                <img src="/favicon-32.png" alt="" className="h-4 w-4 rounded-[4px]" /> obol
              </span>
              <span className="text-[#858b98]">
                {data.rangeLabel === "Total"
                  ? `tracked_since: ${data.trackedSince}`
                  : "local · UTF-8 · usage snapshot"}
              </span>
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <div>
              <p className="text-[13px] font-semibold tracking-[-0.01em]">Choose a window</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                Pick the story you want to share. The image stays local until you download it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {shareRanges.map((item) => (
                <button
                  className={`rounded-control border px-3 py-2.5 text-left text-[11px] transition ${range === item.value ? "border-ink bg-ink font-semibold text-surface" : "border-hairline text-subtle hover:border-subtle hover:text-ink"}`}
                  type="button"
                  key={item.value}
                  onClick={() => setRange(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <button
                className={`h-10 justify-center ${buttonPrimary}`}
                type="button"
                onClick={() => void exportShareImage(data)}
              >
                <Icon path={DOWNLOAD} className="h-3.5 w-3.5 shrink-0" />
                Download PNG
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
