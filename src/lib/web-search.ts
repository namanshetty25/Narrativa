import * as cheerio from 'cheerio';

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

/**
 * Search Google Scholar for research papers on a topic.
 * Returns titles, URLs, and snippets.
 */
export async function searchScholar(topic: string): Promise<SearchResult[]> {
  const query = encodeURIComponent(topic);
  const url = `https://scholar.google.com/scholar?q=${query}&hl=en&num=10`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`Google Scholar returned ${response.status}, trying fallback...`);
      return searchWebFallback(topic);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const papers: SearchResult[] = [];

    $('.gs_r.gs_or.gs_scl').each((_, el) => {
      const titleEl = $(el).find('.gs_rt a');
      const title = titleEl.text().trim();
      const link = titleEl.attr('href') || '';
      const snippet = $(el).find('.gs_rs').text().trim();

      if (title && snippet) {
        papers.push({
          title,
          url: link,
          snippet: snippet.substring(0, 500),
        });
      }
    });

    if (papers.length === 0) {
      return searchWebFallback(topic);
    }

    return papers.slice(0, 8);
  } catch (error) {
    console.error('Scholar search failed:', error);
    return searchWebFallback(topic);
  }
}

/**
 * Fallback: search regular web for academic content
 */
export async function searchWebFallback(topic: string): Promise<SearchResult[]> {
  const query = encodeURIComponent(`${topic} research paper site:arxiv.org OR site:researchgate.net OR site:pubmed.ncbi.nlm.nih.gov`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const papers: SearchResult[] = [];

    $('.result').each((_, el) => {
      const title = $(el).find('.result__title a').text().trim();
      const link = $(el).find('.result__title a').attr('href') || '';
      const snippet = $(el).find('.result__snippet').text().trim();

      if (title && snippet) {
        papers.push({
          title,
          url: link,
          snippet: snippet.substring(0, 500),
        });
      }
    });

    return papers.slice(0, 8);
  } catch (error) {
    console.error('Web fallback search failed:', error);
    return [];
  }
}

/**
 * Attempt to fetch full text from a paper URL for deeper analysis
 */
export async function fetchPaperContent(url: string): Promise<string> {
  try {
    if (!url || url.startsWith('#')) return '';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return '';

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove junk
    $('script, style, nav, footer, iframe, noscript, header, aside').remove();

    let content = '';
    $('article, main, .content, #content, .abstract, .paper-content, p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 50) content += text + '\n\n';
    });

    return content.substring(0, 8000); // Cap to avoid token limits
  } catch {
    return '';
  }
}
