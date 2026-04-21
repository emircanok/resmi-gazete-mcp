import { request } from "undici";
import { getFromCache, putInCache } from "./cache.js";

const USER_AGENT = "Mozilla/5.0 (compatible; ResmiGazeteMCP/0.1; +https://github.com/emircanok/resmi-gazete-mcp)";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

export interface FetchOptions {
  asBinary?: boolean;
  timeoutMs?: number;
  ttlMs?: number;
  retries?: number;
  allow404?: boolean;
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  bytes?: Buffer;
  fromCache: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const CHARSET_HEADER_RE = /charset\s*=\s*["']?([^"';\s]+)/i;
const META_CHARSET_RE = /<meta\s+charset\s*=\s*["']?([^"'\s/>]+)/i;
const META_HTTP_EQUIV_RE = /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*charset\s*=\s*["']?([^"'\s/>]+)/i;

function detectCharset(contentType: string, sample: Buffer): string {
  const fromHeader = contentType.match(CHARSET_HEADER_RE);
  if (fromHeader) return fromHeader[1].toLowerCase();

  // Sniff the opening of the document as latin1 so byte values survive intact.
  const head = sample.subarray(0, 2048).toString("latin1");
  const metaCharset = head.match(META_CHARSET_RE);
  if (metaCharset) return metaCharset[1].toLowerCase();
  const httpEquiv = head.match(META_HTTP_EQUIV_RE);
  if (httpEquiv) return httpEquiv[1].toLowerCase();

  return "utf-8";
}

function decodeTextBody(bytes: Buffer, contentType: string): string {
  const charset = detectCharset(contentType, bytes);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

export async function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    asBinary = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ttlMs,
    retries = 3,
    allow404 = false,
  } = opts;

  const cached = await getFromCache(url, ttlMs);
  if (cached) {
    return {
      url,
      status: 200,
      contentType: cached.contentType,
      body: cached.binary ? "" : cached.body,
      bytes: cached.binary ? Buffer.from(cached.body, "base64") : undefined,
      fromCache: true,
    };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await request(url, {
          method: "GET",
          headers: {
            "user-agent": USER_AGENT,
            accept: asBinary
              ? "application/pdf,*/*"
              : "text/html,application/xhtml+xml,*/*",
            "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
          },
          signal: controller.signal,
          maxRedirections: 5,
        });
        const status = res.statusCode;

        if (status === 404 && allow404) {
          return { url, status, contentType: "", body: "", fromCache: false };
        }
        if (status >= 400 && status < 500 && status !== 429) {
          throw new Error(`HTTP ${status} for ${url}`);
        }
        if (status >= 500 || status === 429) {
          throw new Error(`Retryable HTTP ${status} for ${url}`);
        }

        const contentType = String(res.headers["content-type"] ?? "");
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of res.body) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buf.length;
          if (total > MAX_BODY_BYTES) {
            throw new Error(`Response exceeds ${MAX_BODY_BYTES} bytes`);
          }
          chunks.push(buf);
        }
        const bytes = Buffer.concat(chunks);

        if (asBinary) {
          await putInCache(url, {
            body: bytes.toString("base64"),
            contentType,
            fetchedAt: Date.now(),
            binary: true,
          });
          return { url, status, contentType, body: "", bytes, fromCache: false };
        }

        const body = decodeTextBody(bytes, contentType);
        await putInCache(url, {
          body,
          contentType,
          fetchedAt: Date.now(),
        });
        return { url, status, contentType, body, fromCache: false };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }
  throw new Error(
    `Failed to fetch ${url} after ${retries} attempts: ${(lastError as Error)?.message ?? lastError}`,
  );
}
