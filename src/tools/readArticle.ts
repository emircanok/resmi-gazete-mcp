import { fetchUrl } from "../http.js";
import { parseArticle } from "../parse/article.js";
import type { Article } from "../types.js";

const RESMI_GAZETE_HOST = "www.resmigazete.gov.tr";

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.hostname !== RESMI_GAZETE_HOST) {
    throw new Error(`URL host must be ${RESMI_GAZETE_HOST}: got ${parsed.hostname}`);
  }
  if (!/\.(htm|html)$/i.test(parsed.pathname)) {
    throw new Error(`URL must point to an HTML article: ${url}`);
  }
}

export async function readArticle(url: string): Promise<Article> {
  validateUrl(url);
  const res = await fetchUrl(url);
  return parseArticle(res.body, url);
}
