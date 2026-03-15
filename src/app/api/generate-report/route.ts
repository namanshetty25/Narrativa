import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { saveResearchReport } from '@/lib/store';
import { searchScholar, fetchPaperContent } from '@/lib/web-search';

type Paper = {
  title: string;
  url: string;
  snippet: string;
};

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

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json(
        { error: 'Topic is required.' },
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
              text: `You are an expert academic researcher. Based on the research papers and sources provided below, generate a comprehensive research report on the topic: "${topic}".

FORMAT — you MUST follow this exact structure:

## ${topic}
**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

### Abstract
(~100 words. A concise overview of the topic and key findings.)

### Background
(~200 words. Why this topic is important, historical context, and the current state of research.)

### Key Findings
(3–5 findings, each as a subsection with a bold header. Each finding MUST include:)
- A clear statement of the finding
- Supporting evidence with specific data points or statistics
- Citation to the paper(s) that support it

### Analysis
(~200 words. Your synthesis across all papers — highlight agreements, disagreements, and emerging patterns.)

### Conclusion
(~100 words. The most important takeaways and what they mean for the field.)

### References
(List ALL papers used with titles and URLs, numbered.)

CRITICAL RULES:
- Every sentence must carry information. No filler or padding.
- Every paragraph must contain at least one verifiable data point.
- Write in a scholarly but accessible style.
- Synthesize across papers — don't just summarize each one individually.
- Include specific numbers, percentages, and data when available.
- Total report: 1000–1500 words.

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

    // 5. Save to database (only if called from Notebook UI with a sessionId)
    const reportId = crypto.randomUUID();
    if (sessionId) {
      await saveResearchReport(sessionId, {
        id: reportId,
        topic: topic.trim(),
        content: reportContent,
        papers: papers.map((p: Paper) => ({ title: p.title, url: p.url, snippet: p.snippet })),
      });
    }

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
