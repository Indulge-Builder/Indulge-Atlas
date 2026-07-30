import fs from "node:fs";
import path from "node:path";
import { searchContactsByName, listTicketsForRequester } from "../lib/freshdesk/client";

function applyEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const names = process.argv.slice(2);
  for (const name of names) {
    process.stdout.write(`\n=== "${name}" ===\n`);
    try {
      const found = await searchContactsByName(name);
      process.stdout.write(`  autocomplete returned ${found.length} contact(s)\n`);
      for (const c of found.slice(0, 5)) {
        process.stdout.write(`    #${c.id}  name="${c.name}"  phone=${(c as any).phone ?? "-"}  mobile=${(c as any).mobile ?? "-"}\n`);
      }
    } catch (e) {
      process.stdout.write(`  ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

main();
