/** Export still-unmapped clients to txt (reads DB). */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function applyEnv(f: string) {
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

async function main() {
  applyEnv(path.join(process.cwd(), ".env.local"));
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await supabase
    .from("clients")
    .select("id, first_name, last_name, queendom")
    .is("chetto_group_id", null)
    .order("first_name");
  const rows = data ?? [];
  const lines = [
    `Chetto unmapped clients (${rows.length})`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "# | Client name | Queendom | Client ID | Atlas URL",
    "--|-------------|----------|-----------|----------",
  ];
  rows.forEach((c, i) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    lines.push(
      `${i + 1} | ${name} | ${c.queendom ?? "Unassigned"} | ${c.id} | /clients/${c.id}`,
    );
  });
  const out = path.join(process.cwd(), "scripts/chetto-unmapped-remaining.txt");
  fs.writeFileSync(out, lines.join("\n"));
  const { count: mapped } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .not("chetto_group_id", "is", null);
  console.log(JSON.stringify({ unmapped: rows.length, mapped, file: out }));
}

main().catch(console.error);
