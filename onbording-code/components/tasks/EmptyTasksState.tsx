import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";

interface EmptyTasksStateProps {
  title:       string;
  description: string;
  ctaLabel?:   string;
  onCta?:      () => void;
  className?:  string;
  /** Variant controls the illustration used */
  variant?:    "tasks" | "search" | "archived";
}

function IllustrationTasks() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="#F9F7F2" stroke="#E8E0C8" strokeWidth="1.5" />
      {/* Clipboard */}
      <rect x="34" y="28" width="52" height="64" rx="6" fill="white" stroke="#D4AF37" strokeWidth="1.5" />
      <rect x="44" y="22" width="32" height="12" rx="4" fill="#F3EDD5" stroke="#D4AF37" strokeWidth="1.5" />
      {/* Check lines */}
      <line x1="46" y1="50" x2="74" y2="50" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="62" x2="68" y2="62" stroke="#E8E0C8" strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="74" x2="71" y2="74" stroke="#E8E0C8" strokeWidth="2" strokeLinecap="round" />
      {/* Checkmark */}
      <circle cx="40" cy="50" r="4" fill="#D4AF37" />
      <polyline points="37.5,50 39.5,52 43,47.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="62" r="4" fill="#F3EDD5" stroke="#D4AF37" strokeWidth="1.5" />
      <circle cx="40" cy="74" r="4" fill="#F3EDD5" stroke="#D4AF37" strokeWidth="1.5" />
    </svg>
  );
}

function IllustrationSearch() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="#F9F7F2" stroke="#E8E0C8" strokeWidth="1.5" />
      {/* Magnifying glass */}
      <circle cx="52" cy="52" r="20" fill="white" stroke="#D4AF37" strokeWidth="2" />
      <line x1="66" y1="66" x2="84" y2="84" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
      {/* No results x */}
      <line x1="44" y1="44" x2="60" y2="60" stroke="#E8E0C8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="44" x2="44" y2="60" stroke="#E8E0C8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationArchived() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="#F9F7F2" stroke="#E8E0C8" strokeWidth="1.5" />
      {/* Box */}
      <rect x="28" y="52" width="64" height="40" rx="4" fill="white" stroke="#D4AF37" strokeWidth="1.5" />
      <rect x="28" y="38" width="64" height="16" rx="4" fill="#F3EDD5" stroke="#D4AF37" strokeWidth="1.5" />
      {/* Handle */}
      <rect x="50" y="61" width="20" height="6" rx="3" fill="#D4AF37" />
    </svg>
  );
}

const ILLUSTRATIONS = {
  tasks:    IllustrationTasks,
  search:   IllustrationSearch,
  archived: IllustrationArchived,
};

export function EmptyTasksState({
  title,
  description,
  ctaLabel,
  onCta,
  className,
  variant = "tasks",
}: EmptyTasksStateProps) {
  const Illustration = ILLUSTRATIONS[variant];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        className,
      )}
      role="status"
      aria-label={title}
    >
      <Illustration />

      <div className="space-y-1.5 max-w-xs">
        <h3 className="font-serif text-lg font-semibold text-zinc-800">{title}</h3>
        <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      </div>

      {ctaLabel && onCta && (
        <IndulgeButton
          variant="gold"
          size="sm"
          onClick={onCta}
          className="mt-1"
        >
          {ctaLabel}
        </IndulgeButton>
      )}
    </div>
  );
}
