import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import { saveResearchReport } from '@/lib/store';

type Paper = {
  title: string;
  url: string;
  snippet: string;
};

/**
 * Search Google Scholar for research papers on a topic.
 * Returns titles, URLs, and snippets.
 */
async function searchScholar(topic: string): Promise<Paper[]> {
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
    const papers: Paper[] = [];

    // Parse Google Scholar results
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
async function searchWebFallback(topic: string): Promise<Paper[]> {
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
    const papers: Paper[] = [];

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
async function fetchPaperContent(url: string): Promise<string> {
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

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY not set.' },
        { status: 500 }
      );
    }

    const { topic, sessionId } = await req.json();

    if (!topic || !topic.trim()) {
      return NextResponse.json(
        { error: 'Topic is required.' },
        { status: 400 }
      );
    }
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required.' },
        { status: 400 }
      );
    }

    console.log(`🔬 Searching for research papers on: "${topic}"`);

    // 1. Search for papers
    const papers = await searchScholar(topic);

    if (papers.length === 0) {
      return NextResponse.json(
        { error: 'Could not find any research papers on this topic. Try a different search term.' },
        { status: 400 }
      );
    }

    console.log(`📄 Found ${papers.length} papers. Fetching content...`);

    // 2. Fetch content from top papers (parallel, with timeout)
    const contentPromises = papers.slice(0, 5).map(async (paper) => {
      const content = await fetchPaperContent(paper.url);
      return { ...paper, fullContent: content };
    });

    const enrichedPapers = await Promise.all(contentPromises);

    // 3. Build context for Gemini
    const paperContext = enrichedPapers
      .map((p, i) => {
        const content = p.fullContent || p.snippet;
        return `--- PAPER ${i + 1} ---\nTitle: ${p.title}\nURL: ${p.url}\nContent:\n${content}\n`;
      })
      .join('\n\n');

    console.log('📝 Generating research summary report via Gemini...');

    // 4. Generate comprehensive report via Gemini
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an expert academic researcher. Based on the research papers and sources provided below, generate a comprehensive summary report on the topic: "${topic}".

FORMAT REQUIREMENTS:
- The report should be 2-3 pages long (approximately 1000-1500 words)
- Use proper markdown formatting

STRUCTURE:
1. **Title**: A clear, descriptive title for the report
2. **Abstract**: A 2-3 sentence overview of the topic and key findings
3. **Introduction**: Brief background on why this topic is important (1 paragraph)
4. **Key Findings**: The main body — organized into 3-5 subsections with clear headers
   - Each subsection should synthesize insights from multiple papers
   - Include specific data points, statistics, or findings where available
   - Cite papers by their titles in the text
5. **Current Trends & Future Directions**: What's emerging in this field
6. **Conclusion**: Summary of the most important takeaways
7. **References**: List all papers used, with titles and URLs

IMPORTANT:
- Write in a scholarly but accessible style
- Synthesize across papers — don't just summarize each one individually
- Highlight agreements and disagreements between researchers
- Include specific numbers, percentages, and data when available
- Make it informative enough for someone new to the topic

RESEARCH PAPERS:
${paperContext}`,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 4096,
      },
    });

    const reportContent = response.text?.trim();
    if (!reportContent) {
      return NextResponse.json(
        { error: 'Failed to generate report.' },
        { status: 500 }
      );
    }

    console.log(`✅ Research report generated (${reportContent.length} chars)`);

    // 5. Save to database
    const reportId = crypto.randomUUID();
    await saveResearchReport(sessionId, {
      id: reportId,
      topic: topic.trim(),
      content: reportContent,
      papers: papers.map(p => ({ title: p.title, url: p.url, snippet: p.snippet })),
    });

    return NextResponse.json({
      success: true,
      report: {
        id: reportId,
        topic: topic.trim(),
        content: reportContent,
        papers: papers.map(p => ({ title: p.title, url: p.url })),
      },
    });
  } catch (error: any) {
    console.error('Research report generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
