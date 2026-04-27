# Atlas Tasks — Manual Integration Verification

Use this checklist after deployments or schema changes (Realtime publication, RLS). Sign in as the described role and watch the cited UI surfaces **without** relying on hard refresh unless the test expects it.

---

### 1. Subtask marked done → badge + index completion

**Precondition:** Master task with ≥2 subtasks; you are assigned to one subtask.

**Steps:**

1. Open Atlas Tasks (`/tasks`), note completion % on the relevant `MasterTaskCard`.
2. Open the Master Task detail (`/tasks/[masterTaskId]`); open Subtask Modal for one subtask.
3. Set status to Done (Zone A or Log Update flow per your role).

**Expected:**

- Modal shows Done status badge before close.
4. Close modal; accordion / list row shows Done for that subtask.
5. Return to `/tasks`: `MasterTaskCard` completion percentage increases (Realtime refresh on index or acceptable delay ≤ few seconds).

---

### 2. Zone B timeline entry — live, no duplicate system row

**Precondition:** Subtask open in modal; Zone B Log Update available.

**Steps:**

1. Post a short update in Zone B; submit.
2. Observe timeline in the same modal without reloading.

**Expected:**

- New remark appears at top with your name and `agent` semantics.
3. Inspect DB or timeline: **no** extra line with Atlas System / `source=system` for the same text (only your agent remark).

---

### 3. Admin reassign subtask → system timeline + assignee dashboard

**Precondition:** Two agents in same domain/project; Master Task membership allows reassignment.

**Steps:**

1. As admin/manager: open subtask modal; assign to Agent B (Zone A).
2. Agent A: stays on Agent Dashboard `/`.
3. Agent B: open dashboard `/`.

**Expected:**

- Timeline shows a **system** line describing reassignment (`source=system`).
- Agent B’s **My Tasks** widget gains the task (may require navigation or rely on `revalidatePath('/')` — no stale “never appears”).

---

### 4. CSV import — count, batch row, completion

**Precondition:** Permission to `/tasks/import`; spreadsheet with ~20 mapped rows.

**Steps:**

1. Run Import Wizard targeting a Master Task group.
2. Complete import.

**Expected:**

- All rows appear under the chosen group (`/tasks/[id]` board/list).
3. `import_batches` has a completed row tied to master task id.
4. Master Task completion % reflects new subtasks (aggregate).

---

### 5. Checklist persistence

**Precondition:** Subtask with checklist items.

**Steps:**

1. Toggle one checklist item in Zone A.
2. Close modal; reopen same subtask.

**Expected:**

- Checkbox state persists.

---

### 6. Cross-tab timeline live

**Precondition:** Same user, two browser tabs on **same** `/tasks/[masterTaskId]` detail.

**Steps:**

1. Tab A: open subtask modal; post Zone B remark.
2. Tab B: same subtask modal already open **or** open after a few seconds.

**Expected:**

- Remark appears in Tab B without manual refresh (Realtime `task_remarks`).

---

### 7. Dashboard My Tasks after completing from Atlas Tasks

**Precondition:** Agent with an assigned subtask visible on `/` widget.

**Steps:**

1. Split view: Dashboard `/` + Atlas Tasks `/tasks/[id]` (or sequential).
2. Mark that subtask done from Atlas Tasks UI.

**Expected:**

- Within a short delay, widget updates (via `revalidatePath('/')`): task drops from “due” sections without forcing full page reload on `/`.

---

### 8. Analytics panel responds to completions

**Precondition:** Detail page open; Task Analytics visible.

**Steps:**

1. Note completion ring / status breakdown.
2. Mark three subtasks done (same session).

**Expected:**

- Ring % increases; breakdown shifts (wired to `refreshSignal`/realtime bump — no full reload required).

---

### 9. Archive master task — index updates

**Precondition:** Privileged role; unused or test Master Task.

**Steps:**

1. From `/tasks` Master Tasks index, archive the Master Task.

**Expected:**

- Row disappears from active list or moves per product filter **without** manual reload (Realtime on master row + router refresh patterns).

---

### 10. Second user sees new subtask quickly

**Precondition:** Two authenticated users with access to same Master Task.

**Steps:**

1. User 1 creates a new subtask (board or list).
2. User 2 keeps list/board open on same master task.

**Expected:**

- Within ~3 seconds, User 2 sees new subtask (Realtime `tasks` INSERT on `project_id`).

---

**Sign-off**

| Date | Tester | Environment | Pass/Fail | Notes |
|------|--------|-------------|-------------|-------|
|      |        |             |             |       |
