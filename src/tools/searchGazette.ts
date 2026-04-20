import { getFihrist } from "./getFihrist.js";
import type { Fihrist, SearchMatch } from "../types.js";

const MAX_RANGE_DAYS = 2 * 365;
const CONCURRENCY = 5;

function assertIsoDate(date: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ${field} (expected YYYY-MM-DD): ${date}`);
  }
}

function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function* iterateDates(from: string, to: string): Generator<string> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (start > end) return;
  const cursor = new Date(start);
  while (cursor <= end) {
    // Skip Sundays (Resmî Gazete is not published). Day 0 = Sunday.
    if (cursor.getUTCDay() !== 0) {
      yield cursor.toISOString().slice(0, 10);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function extractMatches(fihrist: Fihrist, normalizedQuery: string): SearchMatch[] {
  const out: SearchMatch[] = [];
  for (const section of fihrist.sections) {
    for (const item of section.items) {
      const haystack = normalize(item.title);
      const idx = haystack.indexOf(normalizedQuery);
      if (idx === -1) continue;
      const snippetStart = Math.max(0, idx - 40);
      const snippetEnd = Math.min(haystack.length, idx + normalizedQuery.length + 80);
      out.push({
        date: fihrist.date,
        title: item.title,
        url: item.url,
        section: section.name,
        snippet: item.title.slice(snippetStart, snippetEnd),
      });
    }
  }
  return out;
}

export async function searchGazette(args: {
  query: string;
  fromDate: string;
  toDate: string;
  maxResults?: number;
}): Promise<{ matches: SearchMatch[]; scannedDays: number; truncated: boolean }> {
  const { query, fromDate, toDate } = args;
  const maxResults = args.maxResults ?? 50;

  if (!query || !query.trim()) throw new Error("query must not be empty");
  assertIsoDate(fromDate, "fromDate");
  assertIsoDate(toDate, "toDate");

  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 0) throw new Error("fromDate must be <= toDate");
  if (diffDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range too wide; limit is ${MAX_RANGE_DAYS} days`);
  }

  const normalizedQuery = normalize(query);
  const dates = Array.from(iterateDates(fromDate, toDate));
  const matches: SearchMatch[] = [];
  let truncated = false;

  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((d) => getFihrist(d, true)),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const main = r.value;
      const all = [main, ...(main.mukerrer ?? [])];
      for (const f of all) {
        matches.push(...extractMatches(f, normalizedQuery));
        if (matches.length >= maxResults) {
          truncated = true;
          return {
            matches: matches.slice(0, maxResults),
            scannedDays: i + batch.length,
            truncated,
          };
        }
      }
    }
  }

  return { matches, scannedDays: dates.length, truncated };
}
