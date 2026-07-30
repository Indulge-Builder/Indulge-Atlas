"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { createTicket } from "@/lib/actions/concierge-tickets";
import {
  CONCIERGE_TICKET_PRIORITIES,
  CONCIERGE_PRIORITY_LABELS,
  CONCIERGE_GROUP_LABELS,
  CONCIERGE_ESCALATION_STATUSES,
  CONCIERGE_ESCALATION_STATUS_LABELS,
  type ConciergeGroup,
  type ConciergeTicketPriority,
  type ConciergeEscalationStatus,
} from "@/lib/types/database";
import type { ClientOption, NewTicketFormProps } from "@/components/concierge/tickets/panelTypes";
import { ClientRequesterSearch } from "./ClientRequesterSearch";
import { TicketTagsInput } from "./TicketTagsInput";

const UNASSIGNED = "__unassigned__";
const TAG_PRESETS = ["VIP", "Travel", "Retail", "Dining", "Urgent"];

type FieldErrors = Partial<
  Record<"requester" | "title" | "categoryId" | "group", string>
>;

export function NewTicketForm({
  initialClients,
  categories,
  agents,
  defaultGroup,
  canPickGroup,
  groupOptions,
}: NewTicketFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [requester, setRequester] = useState<ClientOption | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [priority, setPriority] = useState<ConciergeTicketPriority>("medium");
  const [group, setGroup] = useState<ConciergeGroup | "">(defaultGroup ?? "");
  const [assignedTo, setAssignedTo] = useState<string>(UNASSIGNED);
  const [escalationStatus, setEscalationStatus] =
    useState<ConciergeEscalationStatus>("not_escalated");
  const [scheduledOn, setScheduledOn] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = (k: keyof FieldErrors) => setErrors((e) => ({ ...e, [k]: undefined }));

  const topLevelCategories = categories.filter((c) => !c.parent_id);
  const subcategories = categories.filter((c) => c.parent_id === categoryId);
  const effectiveGroup: ConciergeGroup | "" = group || defaultGroup || "";
  const assignableAgents = agents.filter(
    (a) => !effectiveGroup || a.groups.includes(effectiveGroup),
  );

  function onSelectRequester(client: ClientOption | null) {
    setRequester(client);
    clearError("requester");
    // Auto-fill Group from the client's queendom when Group is still empty.
    if (client?.group && !group) {
      setGroup(client.group);
      setAssignedTo(UNASSIGNED);
    }
  }

  function onChangeGroup(next: ConciergeGroup) {
    setGroup(next);
    setAssignedTo(UNASSIGNED); // agents are queendom-scoped
    clearError("group");
  }

  function onChangeCategory(next: string) {
    setCategoryId(next);
    setSubcategoryId("");
    clearError("categoryId");
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!requester) next.requester = "Select a requester";
    if (!title.trim()) next.title = "Subject is required";
    if (!categoryId) next.categoryId = "Type is required";
    if (!effectiveGroup) next.group = "Group is required";
    return next;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = validate();
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await createTicket({
        clientId: requester!.id,
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        group: (effectiveGroup || undefined) as ConciergeGroup | undefined,
        priority,
        assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
        tags,
        escalationStatus,
        scheduledOn: scheduledOn || undefined,
      });

      if (res.success && res.data) {
        toast.success(`Ticket #${res.data.refNumber} created`);
        router.push(`/concierge/tickets/${res.data.id}`);
        return;
      }
      const message = res.error ?? "Could not create the ticket";
      toast.error(message);
      if (res.field === "group") setErrors((prev) => ({ ...prev, group: message }));
      else if (res.field === "categoryId" || res.field === "subcategoryId")
        setErrors((prev) => ({ ...prev, categoryId: message }));
      else if (res.field === "assignedTo") toast.error(message);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-4xl space-y-4 py-2">
      <header className="space-y-1">
        <Link
          href="/concierge/tickets"
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
        >
          ← Tickets
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">New Ticket</h1>
      </header>

      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-5 lg:col-span-2">
            <IndulgeField label="Requester" required error={errors.requester} htmlFor="ticket-requester">
              <ClientRequesterSearch
                value={requester}
                onSelect={onSelectRequester}
                initial={initialClients}
                error={errors.requester}
              />
            </IndulgeField>

            <IndulgeField label="Subject" required error={errors.title} htmlFor="ticket-subject">
              <Input
                id="ticket-subject"
                value={title}
                error={!!errors.title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError("title");
                }}
                placeholder="Short summary of the request"
              />
            </IndulgeField>

            <IndulgeField label="Description" htmlFor="ticket-description">
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={9}
                placeholder="Details of the request…"
              />
            </IndulgeField>

            <IndulgeField label="Tags" htmlFor="ticket-tags" hint="Enter or comma to add">
              <TicketTagsInput value={tags} onChange={setTags} presets={TAG_PRESETS} />
            </IndulgeField>
          </div>

          {/* Properties column */}
          <div className="space-y-4 lg:col-span-1">
            <IndulgeField label="Type" required error={errors.categoryId} htmlFor="ticket-type">
              <Select value={categoryId || undefined} onValueChange={onChangeCategory}>
                <SelectTrigger id="ticket-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {topLevelCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>

            {subcategories.length > 0 ? (
              <IndulgeField label="Subcategory" htmlFor="ticket-subtype">
                <Select value={subcategoryId || undefined} onValueChange={setSubcategoryId}>
                  <SelectTrigger id="ticket-subtype">
                    <SelectValue placeholder="Select a subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </IndulgeField>
            ) : null}

            <IndulgeField label="Status" hint="New tickets start Open">
              <div className="flex h-9 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-600">
                Open
              </div>
            </IndulgeField>

            <IndulgeField label="Priority" htmlFor="ticket-priority">
              <Select value={priority} onValueChange={(v) => setPriority(v as ConciergeTicketPriority)}>
                <SelectTrigger id="ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCIERGE_TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {CONCIERGE_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>

            <IndulgeField label="Group" required error={errors.group} htmlFor="ticket-group">
              {canPickGroup ? (
                <Select value={group || undefined} onValueChange={(v) => onChangeGroup(v as ConciergeGroup)}>
                  <SelectTrigger id="ticket-group">
                    <SelectValue placeholder="Select a queendom" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions.map((g) => (
                      <SelectItem key={g} value={g}>
                        {CONCIERGE_GROUP_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-600">
                  {effectiveGroup ? CONCIERGE_GROUP_LABELS[effectiveGroup] : "—"}
                </div>
              )}
            </IndulgeField>

            <IndulgeField label="Agent" htmlFor="ticket-agent">
              <div className="space-y-1.5">
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger id="ticket-agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {assignableAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveGroup && assignableAgents.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    No agents assigned to {CONCIERGE_GROUP_LABELS[effectiveGroup]} yet.{" "}
                    {canPickGroup ? (
                      <Link
                        href="/admin"
                        className="font-medium text-brand-gold underline underline-offset-2"
                      >
                        Assign Queendoms in Admin → User Management
                      </Link>
                    ) : (
                      <span>Ask an admin to assign Queendoms in User Management.</span>
                    )}
                  </p>
                ) : null}
              </div>
            </IndulgeField>

            <IndulgeField label="Escalation Status" htmlFor="ticket-escalation">
              <Select
                value={escalationStatus}
                onValueChange={(v) => setEscalationStatus(v as ConciergeEscalationStatus)}
              >
                <SelectTrigger id="ticket-escalation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCIERGE_ESCALATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CONCIERGE_ESCALATION_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>

            <IndulgeField
              label="Scheduled on"
              htmlFor="ticket-scheduled"
              hint="Optional — the day this ticket is scheduled for"
            >
              <Input
                id="ticket-scheduled"
                type="date"
                value={scheduledOn}
                onChange={(e) => setScheduledOn(e.target.value)}
              />
            </IndulgeField>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/concierge/tickets">Cancel</Link>
        </Button>
        <IndulgeButton type="submit" variant="gold" loading={isPending}>
          Create Ticket
        </IndulgeButton>
      </div>
    </form>
  );
}
