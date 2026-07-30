import * as fs from "fs";
import type { ChettoGroup } from "@/lib/actions/chetto";

export type ChettoMetadataCacheFile = {
  updatedAt: string;
  groupIdsListed: string[];
  loaded: Record<string, ChettoGroup>;
  failed: string[];
  aggressiveRetryCompleted?: boolean;
};

export const DEFAULT_CHETTO_METADATA_CACHE_PATH = "scripts/chetto-metadata-cache.json";

export function loadChettoMetadataCache(
  filePath: string,
): ChettoMetadataCacheFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as ChettoMetadataCacheFile;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.loaded || typeof parsed.loaded !== "object") return null;
    if (!Array.isArray(parsed.failed)) return null;
    if (!Array.isArray(parsed.groupIdsListed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveChettoMetadataCache(
  filePath: string,
  data: ChettoMetadataCacheFile,
): void {
  const dir = filePath.replace(/[/\\][^/\\]+$/, "");
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2),
  );
}

export function cacheToLoadedGroups(cache: ChettoMetadataCacheFile): ChettoGroup[] {
  return Object.values(cache.loaded);
}
