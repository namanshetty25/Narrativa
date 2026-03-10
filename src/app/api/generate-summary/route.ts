import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { loadStore } from '@/lib/store';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not set.' },
        { status: 500 }
      );
    }

    const { selectedSourceIds } = await req.json().catch(() => ({ selectedSourceIds: [] }));

    const store = loadStore();
    let availableChunks = store.chunks;
    if (selectedSourceIds && selectedSourceIds.length > 0) {
      availableChunks = availableChunks.filter(c => selectedSourceIds.includes(c.sourceId));
    }

    if (availableChunks.length === 0) {
      return NextResponse.json(
        { error: 'No sources selected or available.' },
        { status: 400 }
      );
    }

    // Gather all source content
    const allContent = availableChunks
      .map((c, i) => `[Section ${i + 1}]\n${c.text}`)
      .join('\n\n---\n\n');

    const cappedContent = allContent.slice(0, 40000);

    console.log('📝 Generating summary via Gemini...');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an expert at creating concise, well-structured summaries. Based on the following source material, create a one-page executive summary report.

FORMAT:
- Start with a bold title that captures the main topic
- Write a brief 1-2 sentence overview/abstract
- Cover all KEY points organized into clear sections with headers
- Use bullet points for key takeaways
- End with a "Key Takeaways" or "Conclusion" section
- Use markdown formatting (headers, bold, bullets) for readability
- Keep the entire summary to roughly one page (400-600 words)
- Be precise and informative — every sentence should add value

SOURCE MATERIAL:
${cappedContent}`,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 1200,
      },
    });

    const summary = response.text?.trim();
    if (!summary) {
      return NextResponse.json(
        { error: 'Failed to generate summary.' },
        { status: 500 }
      );
    }

    console.log(`✅ Summary generated (${summary.length} chars)`);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error('Summary generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
