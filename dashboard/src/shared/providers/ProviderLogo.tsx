import { providerConfig } from "./catalog";

// Rounded badge carrying the provider's favicon on a neutral tile; agents
// outside the catalog fall back to a brand-tinted monogram so untracked
// providers stay visually distinct from misconfigured ones.
export function ProviderLogo({
  agent,
  size = 20,
  color,
}: {
  agent: string;
  size?: number;
  /** Overrides the monogram tile color, e.g. to match a project's chart color. */
  color?: string;
}) {
  const config = providerConfig(agent);
  const tileColor = color ?? config.color;
  if (!config.website) {
    return (
      <span
        aria-hidden="true"
        className="inline-grid shrink-0 place-items-center font-bold text-white"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, Math.round(size * 0.31)),
          backgroundColor: tileColor,
          fontSize: Math.max(8, Math.round(size * 0.46)),
        }}
      >
        {(config.name.slice(0, 1) || "?").toUpperCase()}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center overflow-hidden bg-card"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.31)),
      }}
    >
      <img
        src={`/providers/${config.id}.png`}
        alt=""
        draggable={false}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
