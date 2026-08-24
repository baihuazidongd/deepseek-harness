/**
 * DuckDuckGo search provider: keyless, free web search through the public
 * HTML endpoint. The HTML is parsed for title/url/snippet triplets; no API key
 * and no self-hosted instance are required. The endpoint is rate-limited and
 * its markup can change, so parse failures return an empty result rather than
 * inventing sources.
 * @module @deepseek-ai/dsh-web-search-duckduckgo/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under. */
export const DUCKDUCKGO_PROVIDER_ID = 'duckduckgo'

/** Keyless HTML search endpoint (scrape-friendly "Lite" form). */
const ENDPOINT = 'https://html.duckduckgo.com/html/'

/** Attribution header; bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** One title/url pair from a `result__a` anchor. */
const TITLE_RE = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g

/** One snippet from a `result__snippet` anchor. */
const SNIPPET_RE = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

/** Decode the entities and drop tags from one scraped fragment. */
function cleanText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/** Decode a `&amp;`-escaped href. */
function cleanUrl(href: string): string {
  return href.replaceAll('&amp;', '&')
}

/** Parse title/url/snippet triplets from the DuckDuckGo HTML. */
function parseSources(html: string): WebSearchSource[] {
  const titles = [...html.matchAll(TITLE_RE)].map(match => ({
    url: cleanUrl(match[1]!),
    title: cleanText(match[2]!),
  }))
  const snippets = [...html.matchAll(SNIPPET_RE)].map(match => cleanText(match[1]!))
  // Pair each title with the snippet at the same position; DuckDuckGo renders
  // one snippet per result, so index alignment is stable.
  return titles.map((entry, index) => ({
    url: entry.url,
    ...(entry.title.length > 0 ? { title: entry.title } : {}),
    ...(snippets[index] !== undefined ? { snippet: snippets[index] } : {}),
  }))
}

/** Keyless DuckDuckGo search backend. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = DUCKDUCKGO_PROVIDER_ID

  /** DuckDuckGo needs no credential or local state, so it is always usable. */
  available(): boolean {
    return true
  }

  /**
   * Run one search against the public HTML endpoint and parse the result list.
   * @param request - the query and optional result bound.
   * @param signal - cancellation signal forwarded to the fetch.
   * @returns parsed sources; an unparsable page yields an empty result, not an error.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const url = `${ENDPOINT}?q=${encodeURIComponent(request.query)}`
    let response: Response
    try {
      response = await fetch(url, { signal: signal ?? null, headers: { 'user-agent': USER_AGENT } })
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      throw new WebError('duckduckgo-network', `DuckDuckGo search failed: ${String(error)}`, { cause: error })
    }
    if (!response.ok) {
      throw new WebError('duckduckgo-http', `DuckDuckGo search failed: HTTP ${response.status}`)
    }
    const html = await response.text()
    return { sources: parseSources(html), truncated: false }
  }
}
