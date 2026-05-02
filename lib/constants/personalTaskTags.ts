/** Tag on agent-owned SOP templates; excluded from pg_cron (migration 082). */
export const PERSONAL_SOP_SELF_TAG = "personal_sop_self" as const;

/** Quick-tag label stored on `tasks.tags` for ad-hoc / one-off work. */
export const AD_HOC_QUICK_TAG = "Ad-hoc" as const;

/** Presets inside the Tags popover (Ad-hoc has a dedicated toolbar button). */
export const PERSONAL_TASK_TAG_PRESETS_POPOVER = [
  "Client Request",
  "Admin",
  "Urgent",
] as const;

export function isHiddenPersonalTaskListTag(tag: string): boolean {
  return (
    tag === PERSONAL_SOP_SELF_TAG ||
    tag.startsWith("sop_tpl:") ||
    tag.startsWith("delegated_by:")
  );
}

export function visiblePersonalTaskTagsForList(
  tags: string[] | null | undefined,
): string[] {
  if (!tags?.length) return [];
  return tags.filter((t) => !isHiddenPersonalTaskListTag(t));
}
