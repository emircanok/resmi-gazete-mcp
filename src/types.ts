export interface FihristItem {
  title: string;
  url: string;
  pdfUrl?: string;
  type?: string;
}

export interface FihristSection {
  name: string;
  items: FihristItem[];
}

export interface Fihrist {
  date: string;
  sourceUrl: string;
  sections: FihristSection[];
  mukerrer?: Fihrist[];
}

export interface Article {
  url: string;
  title: string;
  text: string;
  html: string;
}

export interface SearchMatch {
  date: string;
  title: string;
  url: string;
  section: string;
  snippet: string;
}

export interface PdfResult {
  url: string;
  pageCount: number;
  text: string;
}
