# resmi-gazete-mcp

Model Context Protocol (MCP) sunucusu — Türkiye Cumhuriyeti Resmî Gazete (`resmigazete.gov.tr`) içeriğini LLM istemcilerine (Claude Desktop, Claude Code, vb.) araç çağrılarıyla sunar.

## Özellikler

Dört MCP aracı sağlar:

| Araç | Açıklama |
| --- | --- |
| `get_fihrist` | Belirli bir tarihin fihristini (bölümler ve madde URL'leri) döndürür. Mükerrer sayıları da dahildir. |
| `read_article` | Tekil bir `.htm` madde sayfasından başlık ve temizlenmiş düz metin çıkarır. |
| `search_gazette` | Tarih aralığı + anahtar kelime ile fihrist başlıklarında arama yapar (Türkçe normalize). |
| `extract_pdf_text` | `.pdf` URL'inden metin ve sayfa sayısı çıkarır. |

Tüm HTTP istekleri yerel diskte cache'lenir (`~/.cache/resmi-gazete-mcp/` — `RESMI_GAZETE_CACHE_DIR` ile değiştirilebilir).

## Kurulum

```bash
git clone https://github.com/emircanok/resmi-gazete-mcp.git
cd resmi-gazete-mcp
npm install
npm run build
```

Node.js ≥ 20 gerekir.

## Claude Desktop Konfigürasyonu

`claude_desktop_config.json` dosyanıza:

```json
{
  "mcpServers": {
    "resmi-gazete": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/resmi-gazete-mcp/dist/index.js"]
    }
  }
}
```

## Claude Code Konfigürasyonu

```bash
claude mcp add resmi-gazete -- node /ABSOLUTE/PATH/TO/resmi-gazete-mcp/dist/index.js
```

## Geliştirme

```bash
npm run dev        # tsx ile doğrudan çalıştır
npm run typecheck  # tip kontrolü
npm run build      # dist/ içine derle
```

### MCP Inspector ile Test

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Örnek Çağrılar

`get_fihrist`:
```json
{ "date": "2026-04-17", "includeMukerrer": true }
```

`read_article`:
```json
{ "url": "https://www.resmigazete.gov.tr/eskiler/2026/04/20260417-1.htm" }
```

`search_gazette`:
```json
{ "query": "vergi", "fromDate": "2026-04-01", "toDate": "2026-04-17", "maxResults": 20 }
```

`extract_pdf_text`:
```json
{ "url": "https://www.resmigazete.gov.tr/eskiler/2026/04/20260417-1.pdf" }
```

## Notlar

- Resmî Gazete Pazar günleri yayımlanmaz; `search_gazette` Pazar günlerini atlar.
- Site `User-Agent` başlığı olmadan 403 döndürür; sunucu uygun UA gönderir.
- Arama geniş aralıklarda yavaş olabilir — aynı gün tekrar sorgulandığında cache devreye girer.
- Maksimum arama aralığı 2 yıldır. PDF'ler için 25 MB sınırı vardır.

## Lisans

MIT
