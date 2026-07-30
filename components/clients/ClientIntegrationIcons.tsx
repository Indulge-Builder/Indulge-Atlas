import { Ticket, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientWithProfile } from "@/lib/actions/clients";

interface ClientIntegrationIconsProps {
  client: ClientWithProfile;
  className?: string;
}

/**
 * Inline Freshdesk + Chetto integration status icons.
 * - Freshdesk = mapped when phone_number is set (phone is the Freshdesk lookup key).
 * - Chetto = mapped when chetto_group_id is set.
 * Mapped renders a colored pill; unmapped renders muted gray.
 */
export function ClientIntegrationIcons({
  client,
  className,
}: ClientIntegrationIconsProps) {
  const freshdeskMapped = Boolean(client.phone_number?.trim());
  const chettoMapped = Boolean(client.chetto_group_id);

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1", className)}
      aria-hidden
    >
      <span
        title={
          freshdeskMapped
            ? "Freshdesk mapped (phone set)"
            : "Freshdesk not mapped (no phone)"
        }
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full",
          freshdeskMapped
            ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
            : "bg-stone-100 text-stone-400 ring-1 ring-stone-200",
        )}
      >
        <Ticket className="h-2.5 w-2.5" />
      </span>
      <span
        title={
          chettoMapped
            ? "Chetto mapped (group linked)"
            : "Chetto not mapped (no group)"
        }
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full",
          chettoMapped
            ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200"
            : "bg-stone-100 text-stone-400 ring-1 ring-stone-200",
        )}
      >
        <MessageCircle className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}
