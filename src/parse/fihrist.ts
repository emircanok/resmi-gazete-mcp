import * as cheerio from "cheerio";
import type { Fihrist, FihristItem, FihristSection } from "../types.js";

const BASE = "https://www.resmigazete.gov.tr";

export function buildFihristUrl(date: string, mukerrerIndex = 0): string {
  const [y, m, d] = date.split("-");
  const stem = `${y}${m}${d}`;
  const suffix = mukerrerIndex > 0 ? `M${mukerrerIndex}` : "";
  return `${BASE}/eskiler/${y}/${m}/${stem}${suffix}.htm`;
}

function absolutize(href: string, pageUrl: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE}${href}`;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return href;
  }
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function parseFihrist(html: string, date: string, sourceUrl: string): Fihrist {
  const $ = cheerio.load(html);
  const sections: FihristSection[] = [];
  let current: FihristSection | null = null;

  const container = $("body");

  container.find("*").each((_, el) => {
    const $el = $(el);
    const tag = ("tagName" in el ? (el as { tagName?: string }).tagName ?? "" : "").toLowerCase();

    // Section headings — Resmi Gazete uses bold/italic headers like "YÜRÜTME VE İDARE BÖLÜMÜ"
    if (tag === "b" || tag === "strong" || /fihrist[-_ ]?baslik/i.test($el.attr("class") ?? "")) {
      const text = cleanText($el.text());
      if (
        text &&
        /BÖLÜM[Ü]?$|İLÂN BÖLÜMÜ|İLAN BÖLÜMÜ/i.test(text) &&
        text.length < 120
      ) {
        current = { name: text, items: [] };
        sections.push(current);
        return;
      }
    }

    if (tag === "a") {
      const href = $el.attr("href") ?? "";
      if (!href || !/\.(htm|html|pdf)(\?|$)/i.test(href)) return;
      if (/fihrist|index|default\.aspx|main\.aspx/i.test(href)) return;

      const full = absolutize(href, sourceUrl);
      // Only same-day article links
      const match = full.match(/eskiler\/\d{4}\/\d{2}\/(\d{8})(M\d+)?-\d+\.(htm|html|pdf)/i);
      if (!match) return;

      const isPdf = /\.pdf(\?|$)/i.test(full);
      const title = cleanText($el.text()) || cleanText($el.closest("tr, p, div").text());
      if (!title) return;

      const section = current ?? (() => {
        const s: FihristSection = { name: "Genel", items: [] };
        sections.push(s);
        current = s;
        return s;
      })();

      // Dedupe: if same base article already listed, attach PDF
      const base = full.replace(/\.pdf(\?|$)/i, ".htm");
      const existing = section.items.find((it) => it.url === base);
      if (isPdf) {
        if (existing) existing.pdfUrl = full;
        else section.items.push({ title, url: base, pdfUrl: full });
      } else {
        if (existing && !existing.title) existing.title = title;
        else if (!existing) section.items.push({ title, url: full });
      }
    }
  });

  return { date, sourceUrl, sections };
}
