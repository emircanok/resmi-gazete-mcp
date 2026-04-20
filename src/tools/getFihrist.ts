import { fetchUrl } from "../http.js";
import { buildFihristUrl, parseFihrist } from "../parse/fihrist.js";
import type { Fihrist } from "../types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function assertIsoDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  }
}

async function fetchOne(date: string, mukerrerIndex: number): Promise<Fihrist | null> {
  const url = buildFihristUrl(date, mukerrerIndex);
  const res = await fetchUrl(url, { ttlMs: ONE_DAY_MS, allow404: true });
  if (res.status === 404 || !res.body) return null;
  return parseFihrist(res.body, date, url);
}

export async function getFihrist(
  date: string,
  includeMukerrer = true,
): Promise<Fihrist> {
  assertIsoDate(date);
  const main = await fetchOne(date, 0);
  if (!main) {
    throw new Error(`No gazette found for ${date}`);
  }

  if (!includeMukerrer) return main;

  const mukerrer: Fihrist[] = [];
  for (let i = 1; i <= 5; i++) {
    const mk = await fetchOne(date, i);
    if (!mk) break;
    mukerrer.push(mk);
  }
  if (mukerrer.length > 0) main.mukerrer = mukerrer;
  return main;
}
