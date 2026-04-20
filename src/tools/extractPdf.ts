import pdfParse from "pdf-parse";
import { fetchUrl } from "../http.js";
import type { PdfResult } from "../types.js";

const RESMI_GAZETE_HOST = "www.resmigazete.gov.tr";

function validatePdfUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.hostname !== RESMI_GAZETE_HOST) {
    throw new Error(`URL host must be ${RESMI_GAZETE_HOST}: got ${parsed.hostname}`);
  }
  if (!/\.pdf$/i.test(parsed.pathname)) {
    throw new Error(`URL must end with .pdf: ${url}`);
  }
}

export async function extractPdfText(url: string): Promise<PdfResult> {
  validatePdfUrl(url);
  const res = await fetchUrl(url, { asBinary: true });
  if (!res.bytes) {
    throw new Error(`Empty PDF response from ${url}`);
  }
  const parsed = await pdfParse(res.bytes);
  return {
    url,
    pageCount: parsed.numpages,
    text: parsed.text,
  };
}
