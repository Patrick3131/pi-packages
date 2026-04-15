export type BraveSearchSafeSearch = "off" | "moderate" | "strict";
export type BraveSearchFreshness = "pd" | "pw" | "pm" | "py";

export interface BraveSearchToolParams {
  query: string;
  count?: number;
  offset?: number;
  country?: string;
  searchLang?: string;
  uiLang?: string;
  safesearch?: BraveSearchSafeSearch;
  freshness?: BraveSearchFreshness;
  extraSnippets?: boolean;
}

export interface BraveWebSearchResult {
  title: string;
  url: string;
  description?: string;
  language?: string;
  age?: string;
  pageAge?: string;
}

export interface BraveWebSearchApiItem {
  title?: string;
  url?: string;
  description?: string;
  language?: string;
  age?: string;
  page_age?: string;
}

export interface BraveWebSearchApiResponse {
  query?: {
    original?: string;
    altered?: string;
    show_strict_warning?: boolean;
  };
  web?: {
    results?: BraveWebSearchApiItem[];
  };
}
