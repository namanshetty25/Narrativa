import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getChunks } from '@/lib/store';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY not set.' },
        { status: 500 }
      );
    }

    const { selectedSourceIds } = await req.json().catch(() => ({ selectedSourceIds: [] }));

    const availableChunks = await getChunks('', selectedSourceIds);

    if (availableChunks.length === 0) {
      return NextResponse.json(
        { error: 'No sources selected or available.' },
        { status: 400 }
      );
    }

    const allContent = availableChunks
      .map((c: { text: string }, i: number) => `[Section ${i + 1}]\n${c.text}`)
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
              text: `You are an expert at creating concise, well-structured executive summaries. Based on the following source material, create a one-page summary report.

You MUST use EXACTLY this structure with these section headers:

**Overview:** (2 sentences that capture the main topic and scope)

**Key Findings:**
- (3–5 bullet points, each a specific finding from the material)

**Evidence:** (2–4 cited data points, statistics, or direct claims from the sources that support the findings)

**Implications:** (2–3 sentences on what these findings mean and why they matter)

**Next Steps:**
- (2–3 actionable bullet points for follow-up)

RULES:
- Maximum 380 words total. Dense, professional, no filler.
- Every sentence must add value — no padding or repetition.
- Use markdown formatting (bold headers, bullets) for readability.
- Cite specific data from the sources where possible.

SOURCE MATERIAL:
${cappedContent}`,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 800,
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Summary generation error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
