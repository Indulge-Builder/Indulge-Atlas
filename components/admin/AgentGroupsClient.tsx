"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Search, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  renameGroup,
  setGroupActive,
  addMember,
  removeMember,
  type ActiveProfileOption,
} from "@/lib/actions/agent-groups";
import type { AgentGroupWithMembers } from "@/lib/types/database";

type GroupMember = AgentGroupWithMembers["members"][number];

export function AgentGroupsClient({
  initialGroups,
  allProfiles,
}: {
  initialGroups: AgentGroupWithMembers[];
  allProfiles: ActiveProfileOption[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [selectedId, setSelectedId] = useState<string | null>(initialGroups[0]?.id ?? null);
  const [memberSearch, setMemberSearch] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setGroups(initialGroups);
    setSelectedId((prev) =>
      prev && initialGroups.some((g) => g.id === prev) ? prev : (initialGroups[0]?.id ?? null),
    );
  }, [initialGroups]);

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0] ?? null;

  const memberIds = useMemo(
    () => new Set(selected?.members.map((m) => m.id) ?? []),
    [selected],
  );

  const candidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return allProfiles
      .filter((p) => !memberIds.has(p.id))
      .filter(
        (p) =>
          !q ||
          p.full_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [allProfiles, memberIds, memberSearch]);

  function resync() {
    router.refresh();
  }

  // ── group ops ────────────────────────────────────────────────────────────

  function onRename(id: string, value: string) {
    const name = value.trim();
    if (!name) return;
    const prev = groups;
    setGroups((g) => g.map((x) => (x.id === id ? { ...x, name } : x)));
    setRenaming(null);
    startTransition(async () => {
      const res = await renameGroup({ id, name });
      if (!res.success) {
        setGroups(prev);
        toast.error(res.error ?? "Could not rename group");
      } else {
        toast.success("Group renamed");
        resync();
      }
    });
  }

  function onToggleActive(id: string, isActive: boolean) {
    const prev = groups;
    setGroups((g) => g.map((x) => (x.id === id ? { ...x, is_active: isActive } : x)));
    startTransition(async () => {
      const res = await setGroupActive({ id, isActive });
      if (!res.success) {
        setGroups(prev);
        toast.error(res.error ?? "Could not update group");
      } else {
        resync();
      }
    });
  }

  // ── member ops ───────────────────────────────────────────────────────────

  function onAddMember(profile: ActiveProfileOption) {
    if (!selected) return;
    const groupId = selected.id;
    const newMember: GroupMember = {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      role_in_group: null,
    };
    const prev = groups;
    setGroups((g) =>
      g.map((x) =>
        x.id === groupId
          ? {
              ...x,
              members: [...x.members, newMember].sort((a, b) => a.full_name.localeCompare(b.full_name)),
              member_count: x.member_count + 1,
            }
          : x,
      ),
    );
    setMemberSearch("");
    startTransition(async () => {
      const res = await addMember({ groupId, profileId: profile.id });
      if (!res.success) {
        setGroups(prev);
        toast.error(res.error ?? "Could not add member");
      } else {
        toast.success(`${profile.full_name} added`);
        resync();
      }
    });
  }

  function onRemoveMember(profileId: string) {
    if (!selected) return;
    const groupId = selected.id;
    const prev = groups;
    setGroups((g) =>
      g.map((x) =>
        x.id === groupId
          ? {
              ...x,
              members: x.members.filter((m) => m.id !== profileId),
              member_count: Math.max(0, x.member_count - 1),
            }
          : x,
      ),
    );
    startTransition(async () => {
      const res = await removeMember({ groupId, profileId });
      if (!res.success) {
        setGroups(prev);
        toast.error(res.error ?? "Could not remove member");
      } else {
        resync();
      }
    });
  }

  const isQueendom = selected?.slug === "anishqa-queendom" || selected?.slug === "ananyshree-queendom";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Agent Groups</h1>
        <p className="text-sm text-neutral-500">
          The two Queendoms — Anishqa and Ananyshree. Adding a member also scopes that agent for
          concierge tickets.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* ── Group list ────────────────────────────────────────────── */}
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "flex flex-col p-3")}>
          <div className="space-y-1">
            {groups.map((g) => {
              const active = g.id === selected?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-brand-gold/10 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100",
                    !g.is_active && "opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] tabular-nums text-neutral-500">
                    {g.member_count}
                  </span>
                </button>
              );
            })}
            {groups.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-400">No Queendom groups found.</p>
            ) : null}
          </div>
        </div>

        {/* ── Group detail ──────────────────────────────────────────── */}
        {selected ? (
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div className="min-w-0 flex-1">
                {renaming?.id === selected.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id: selected.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRename(selected.id, renaming.value);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-8 max-w-xs"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => onRename(selected.id, renaming.value)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold text-neutral-900">{selected.name}</h2>
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: selected.id, value: selected.name })}
                      className="text-neutral-400 hover:text-neutral-700"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 capitalize">{selected.source}</span>
                  {selected.fd_group_id ? <span>FD #{selected.fd_group_id}</span> : null}
                  {isQueendom ? <span className="text-brand-gold">· scopes concierge tickets</span> : null}
                </div>
              </div>

              <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                <span>{selected.is_active ? "Active" : "Inactive"}</span>
                <Switch
                  checked={selected.is_active}
                  onCheckedChange={(v) => onToggleActive(selected.id, v)}
                />
              </label>
            </div>

            {/* Add member */}
            <div className="relative py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Add a member — search by name or email"
                  className="h-9 pl-9"
                />
              </div>
              {memberSearch.trim() ? (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-neutral-400">No matching active staff.</p>
                  ) : (
                    candidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onAddMember(p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-neutral-800">{p.full_name}</span>{" "}
                          <span className="text-neutral-400">{p.email}</span>
                        </span>
                        <span className="shrink-0 capitalize text-[11px] text-neutral-400">{p.role}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {/* Members */}
            <div className="space-y-1">
              {selected.members.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">No members yet. Add staff above.</p>
              ) : (
                selected.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-neutral-800">{m.full_name}</span>{" "}
                      <span className="text-neutral-400">{m.email}</span>
                    </span>
                    <span className="shrink-0 capitalize text-[11px] text-neutral-400">{m.role}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveMember(m.id)}
                      className="shrink-0 text-neutral-400 hover:text-red-500"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-8 text-center text-sm text-neutral-400")}>
            Select a Queendom to manage members.
          </div>
        )}
      </div>
    </div>
  );
}
