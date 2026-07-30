/**
 * Revert incorrect chetto_group_id assignments and apply verified manual mappings.
 *   npx tsx scripts/fix-chetto-mappings.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function applyEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Clear wrong auto-matches from single-hit pass. */
const REVERT_IDS = [
  "5405a345-ea14-430c-8523-cd566a6f0033", // Aman Agrawal → Vishal (wrong)
  "601d2bb9-c172-42c1-8640-361b66b9fc51", // Arnav Agrawal
  "b3c768cb-e8d6-4d12-8447-366665e8e722", // Arpit Agrawal
  "30419c1d-228e-45da-960a-bd5a8113242d", // Nipun Agrawal
  "9915a598-005f-4331-b992-0abb6850e7c2", // Saurabh Agrawal
  "62dde6e2-0c73-4e69-8c54-0e16de05a352", // Pratiyancha → Piyush (wrong)
  "6789d555-b9b6-4cae-8b41-c6661dc2b245", // Sakshi Singh (wrong)
  "6e2da7ff-44d9-4466-90c3-e2024d1b3379", // Azara - Arjun Finance (uncertain)
  "ed5ee480-fa52-45b6-a186-bf638ff06f09", // Harsh Jain/Binani duplicate group if needed - skip
];

/** Verified client_id → chetto_group_id */
const APPLY: Record<string, string> = {
  "6421f7c6-dde2-44ec-97df-e7f11b5bae2b": "120363368173427025", // Ramakrishna B K
  "d5e39c7e-a07d-4c31-8b84-bf6ce6d50556": "120363407711507275", // Aniket Bharadia
  "cf066ad6-8d6f-40d6-b908-721a86526592": "120363425405106980", // Chandershekhar Chaurasia
};

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let reverted = 0;
  for (const id of REVERT_IDS) {
    const { error } = await supabase
      .from("clients")
      .update({ chetto_group_id: null })
      .eq("id", id);
    if (!error) reverted += 1;
    else console.error(`Revert failed ${id}:`, error.message);
  }

  let applied = 0;
  for (const [clientId, groupId] of Object.entries(APPLY)) {
    const { error } = await supabase
      .from("clients")
      .update({ chetto_group_id: groupId })
      .eq("id", clientId)
      .is("chetto_group_id", null);
    if (!error) applied += 1;
    else console.error(`Apply failed ${clientId}:`, error.message);
  }

  const { count: unmapped } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .is("chetto_group_id", null);

  const { count: mapped } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .not("chetto_group_id", "is", null);

  console.log(JSON.stringify({ reverted, applied, mapped, unmapped }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
