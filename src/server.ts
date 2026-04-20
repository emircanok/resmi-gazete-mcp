import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getFihrist } from "./tools/getFihrist.js";
import { readArticle } from "./tools/readArticle.js";
import { searchGazette } from "./tools/searchGazette.js";
import { extractPdfText } from "./tools/extractPdf.js";

const getFihristSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  includeMukerrer: z.boolean().optional(),
});

const readArticleSchema = z.object({
  url: z.string().url(),
});

const searchSchema = z.object({
  query: z.string().min(1),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxResults: z.number().int().positive().max(500).optional(),
});

const extractPdfSchema = z.object({
  url: z.string().url(),
});

const TOOLS = [
  {
    name: "get_fihrist",
    description:
      "Belirli bir tarihteki Resmi Gazete fihristini (bölüm ve madde listesi) döndürür. Mükerrer (ek) sayıları da döndürür.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD formatında tarih" },
        includeMukerrer: {
          type: "boolean",
          description: "Mükerrer fasikülleri de dahil et (varsayılan true)",
          default: true,
        },
      },
      required: ["date"],
    },
  },
  {
    name: "read_article",
    description:
      "Resmi Gazete üzerindeki tekil bir madde/yayın HTML sayfasından başlık ve temizlenmiş metin çıkarır.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "resmigazete.gov.tr üzerindeki .htm URL (örn. https://www.resmigazete.gov.tr/eskiler/2026/04/20260417-1.htm)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_gazette",
    description:
      "Verilen tarih aralığındaki Resmi Gazete fihristlerinde anahtar kelime araması yapar (Türkçe normalize edilerek). Eşleşen madde başlıklarını, URL'leri ve bağlam kesitlerini döndürür.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Aranacak anahtar kelime/ifade" },
        fromDate: { type: "string", description: "Başlangıç tarihi (YYYY-MM-DD)" },
        toDate: { type: "string", description: "Bitiş tarihi (YYYY-MM-DD)" },
        maxResults: {
          type: "integer",
          description: "Döndürülecek en fazla eşleşme (varsayılan 50, üst sınır 500)",
          default: 50,
        },
      },
      required: ["query", "fromDate", "toDate"],
    },
  },
  {
    name: "extract_pdf_text",
    description:
      "Resmi Gazete üzerindeki bir PDF belgesini (tekil madde veya fasikül) indirir, metnini ve sayfa sayısını döndürür. 25 MB üstü reddedilir.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "resmigazete.gov.tr üzerindeki .pdf URL" },
      },
      required: ["url"],
    },
  },
];

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createServer(): Server {
  const server = new Server(
    {
      name: "resmi-gazete-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "get_fihrist": {
          const { date, includeMukerrer } = getFihristSchema.parse(args);
          const result = await getFihrist(date, includeMukerrer ?? true);
          return jsonResult(result);
        }
        case "read_article": {
          const { url } = readArticleSchema.parse(args);
          const result = await readArticle(url);
          return jsonResult({
            url: result.url,
            title: result.title,
            text: result.text,
          });
        }
        case "search_gazette": {
          const parsed = searchSchema.parse(args);
          const result = await searchGazette(parsed);
          return jsonResult(result);
        }
        case "extract_pdf_text": {
          const { url } = extractPdfSchema.parse(args);
          const result = await extractPdfText(url);
          return jsonResult(result);
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  });

  return server;
}
