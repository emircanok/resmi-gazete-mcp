import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_DIR = path.join(homedir(), ".cache", "resmi-gazete-mcp");

export interface CacheEntry {
  body: string;
  contentType: string;
  fetchedAt: number;
  binary?: boolean;
}

function cacheDir(): string {
  return process.env.RESMI_GAZETE_CACHE_DIR ?? DEFAULT_DIR;
}

function keyFor(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

function pathFor(url: string): string {
  const key = keyFor(url);
  return path.join(cacheDir(), key.slice(0, 2), `${key}.json`);
}

export async function getFromCache(url: string, ttlMs?: number): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(pathFor(url), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (ttlMs !== undefined && Date.now() - entry.fetchedAt > ttlMs) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function putInCache(url: string, entry: CacheEntry): Promise<void> {
  const file = pathFor(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(entry), "utf8");
}
