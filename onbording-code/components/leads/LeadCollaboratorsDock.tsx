"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AvatarStack } from "@/components/ui/avatar-stack";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";
import type { LeadCollaborator } from "@/lib/types/database";
import {
  addLeadCollaborator,
  listLeadCollaborators,
  removeLeadCollaborator,
  searchProfilesForCollaboration,
} from "@/lib/actions/leadCollaborators";
import { useLeadCollaboratorsRealtime } from "@/lib/hooks/useLeadCollaboratorsRealtime";

interface LeadCollaboratorsDockProps {
  leadId: string;
  /** Server-computed: assigned agent, domain manager, or admin/founder */
  canManage: boolean;
  initialRows: LeadCollaborator[];
}

export function LeadCollaboratorsDock({
  leadId,
  canManage,
  initialRows,
}: LeadCollaboratorsDockProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LeadCollaborator[]>(initialRows);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<
    Awaited<ReturnType<typeof searchProfilesForCollaboration>>
  >([]);
  const [pending, startTransition] = useTransition();
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const next = await listLeadCollaborators(leadId);
      setRows(next);
      router.refresh();
    });
  }, [leadId, router]);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useLeadCollaboratorsRealtime(leadId, refresh);

  useEffect(() => {
    if (!open || !canManage) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      if (query.trim().length < 2) {
        setSearchHits([]);
        return;
      }
      setSearching(true);
      void (async () => {
        const exclude = rows.map((r) => r.user_id);
        const hits = await searchProfilesForCollaboration({
          query,
          excludeUserIds: exclude,
        });
        setSearchHits(hits);
        setSearching(false);
      })();
    }, 280);
    return () => clearTimeout(t);
  }, [open, canManage, query, rows]);

  const stackPeople = useMemo(() => {
    const fromRows = rows
      .map((r) => r.profile)
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        full_name: p!.full_name ?? "Member",
      }));
    return fromRows;
  }, [rows]);

  const handleAdd = (userId: string) => {
    startTransition(async () => {
      const res = await addLeadCollaborator(leadId, userId);
      if (!res.success) {
        toast.error(res.error ?? "Could not add collaborator");
        return;
      }
      toast.success("Access granted");
      setQuery("");
      setSearchHits([]);
      await refresh();
    });
  };

  const handleRemove = (userId: string) => {
    startTransition(async () => {
      const res = await removeLeadCollaborator(leadId, userId);
      if (!res.success) {
        toast.error(res.error ?? "Could not remove");
        return;
      }
      toast.success("Access removed");
      await refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex items-center gap-2 rounded-full border border-[#E5E4DF] bg-white/90 py-1 pl-1 pr-3",
          "shadow-sm transition hover:border-[#D4AF37]/50 hover:shadow-md",
        )}
        aria-label="Collaborators"
      >
        {stackPeople.length > 0 ? (
          <AvatarStack assignees={stackPeople} maxVisible={4} size="sm" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            <Users className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="text-xs font-medium tracking-wide text-[#6B6560]">
          Collaborators
          {rows.length > 0 ? (
            <span className="ml-1 tabular-nums text-[#B5A99A]">({rows.length})</span>
          ) : null}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full max-w-md flex-col border-l border-[#E5E4DF] bg-[#FDFCFA] p-0">
          <SheetHeader className="space-y-1 border-b border-[#E5E4DF] px-6 py-5 text-left">
            <SheetTitle
              className="font-serif text-xl font-semibold text-[#1A1814]"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              Collaborators
            </SheetTitle>
            <SheetDescription className="text-sm text-[#7A7268]">
              {canManage
                ? "Invite teammates from any department to this dossier. They gain read access only to this lead."
                : "People with explicit access to this dossier."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B5A99A]">
                On this lead
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-[#9A9288]">No additional collaborators yet.</p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row) => {
                    const p = row.profile;
                    const label = p?.full_name ?? "Member";
                    return (
                      <li
                        key={row.id}
                        className="flex items-center justify-between rounded-xl border border-[#ECEAE6] bg-white px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#1A1814]">{label}</p>
                          <p className="truncate text-xs text-[#9A9288]">
                            {[p?.department, p?.domain].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-[#B5A99A] hover:text-red-700"
                            disabled={pending}
                            onClick={() => handleRemove(row.user_id)}
                            aria-label={`Remove ${label}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {canManage ? (
              <div className="space-y-3 border-t border-[#ECEAE6] pt-5">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B5A99A]">
                  <UserPlus className="h-3.5 w-3.5" />
                  Add by name or email
                </p>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search anyone in Atlas…"
                  className="border-[#E5E4DF] bg-white"
                />
                {searching ? (
                  <p className="text-xs text-[#B5A99A]">Searching…</p>
                ) : searchHits.length > 0 ? (
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[#ECEAE6] bg-white p-1">
                    {searchHits.map((hit) => (
                      <li key={hit.id}>
                        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#1A1814]">
                              {hit.full_name}
                            </p>
                            <p className="truncate text-xs text-[#9A9288]">
                              {[hit.department, hit.domain].filter(Boolean).join(" · ") ||
                                hit.email ||
                                "—"}
                            </p>
                          </div>
                          <IndulgeButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-[#E5E4DF] text-xs"
                            loading={pending}
                            onClick={() => handleAdd(hit.id)}
                          >
                            Add
                          </IndulgeButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 ? (
                  <p className="text-xs text-[#B5A99A]">No matches.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
