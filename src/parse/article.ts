import * as cheerio from "cheerio";
import type { Article } from "../types.js";

export function parseArticle(html: string, url: string): Article {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("b").first().text().trim() ||
    "";

  const bodyHtml = $("body").html() ?? html;
  const text = $("body").text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();

  return {
    url,
    title: title.slice(0, 500),
    text,
    html: bodyHtml,
  };
}
