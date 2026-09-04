import type { WidgetConfig } from "@shared/api";
import { CLOSE, Icon } from "@shared/ui/icons";
import { buttonIcon } from "@shared/ui/tokens";
import BudgetSettings from "./BudgetSettings";

export default function SettingsDialog({
  config,
  onSaved,
  onClose,
}: {
  config: WidgetConfig;
  onSaved: (config: WidgetConfig) => void;
  onClose: () => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The modal backdrop intentionally closes on pointer release.
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 px-4 py-8 backdrop-blur-sm max-[760px]:py-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[720px] overflow-hidden rounded-card border border-hairline bg-card text-ink shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Preferences</p>
            <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em]" id="settings-dialog-title">
              Budget and data settings
            </h2>
          </div>
          <button className={buttonIcon} type="button" onClick={onClose} aria-label="Close settings">
            <Icon path={CLOSE} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <BudgetSettings config={config} inDialog onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
