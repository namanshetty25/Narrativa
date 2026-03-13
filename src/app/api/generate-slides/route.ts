import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/db';
import { generateSlidesFromText } from '@/lib/generate-text-slides';
import { searchScholar, fetchPaperContent } from '@/lib/web-search';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceId, sourceIds, topic, sessionId } = body;

    // Determine which sources to use
    const idsToProcess: string[] = sourceIds
      ? sourceIds
      : sourceId
        ? [sourceId]
        : [];

    // ================================================
    // Mode 1: Topic-based generation (no existing source)
    // ================================================
    if (topic && sessionId) {
      console.log(`[TopicSlides] Researching topic: "${topic}"`);

      // Step 1 — Research: search for real, current information
      const searchResults = await searchScholar(topic);
      let researchContext = '';

      if (searchResults.length > 0) {
        // Fetch content from top results
        const enriched = await Promise.all(
          searchResults.slice(0, 4).map(async (result) => {
            const content = await fetchPaperContent(result.url);
            return { ...result, fullContent: content };
          })
        );

        researchContext = enriched
          .map((r, i) => `--- Source ${i + 1}: ${r.title} ---\nURL: ${r.url}\n${r.fullContent || r.snippet}`)
          .join('\n\n');

        // Append a references section
        researchContext += '\n\n--- REFERENCES ---\n' +
          searchResults.map((r, i) => `${i + 1}. ${r.title} - ${r.url}`).join('\n');
      }

      // Build the text: combine topic + research context
      const slideText = researchContext
        ? `Topic: ${topic}\n\nThe following research was gathered from academic papers and authoritative sources. Use this information to create factual, well-cited slides. Include a "References" slide at the end.\n\n${researchContext}`
        : topic;

      const outputDir = path.join(process.cwd(), 'public', 'slides', `topic-${Date.now()}`);
      const deck = await generateSlidesFromText(
        slideText,
        topic.length > 60 ? topic.substring(0, 57) + '...' : topic,
        'topic',
        outputDir,
      );

      const slideId = path.basename(outputDir);
      return NextResponse.json({
        success: true,
        slideUrl: `/deck/${slideId}`,
        slidesCount: deck.slides.length,
      });
    }

    // ================================================
    // Mode 2: Source-based generation
    // ================================================
    if (idsToProcess.length === 0) {
      return NextResponse.json({ error: 'sourceId, sourceIds, or topic is required' }, { status: 400 });
    }

    // Fetch sources from database
    const sources = await prisma.source.findMany({
      where: { id: { in: idsToProcess } },
      select: { id: true, name: true, type: true, text: true },
    });

    if (sources.length === 0) {
      return NextResponse.json({ error: 'No sources found' }, { status: 404 });
    }

    // Check if any source is a PDF (use Python pipeline for PDFs)
    const pdfSource = sources.find((s: { type: string }) => s.type === 'pdf');

    if (pdfSource && sources.length === 1) {
      // ================================================
      // PDF Pipeline (existing Python agent)
      // ================================================
      return await handlePdfSlides(pdfSource.id);
    }

    // ================================================
    // Text Pipeline (YouTube, URL, txt, or mixed sources)
    // ================================================
    const combinedText = sources
      .map((s: { name: string; type: string; text: string }) => `--- Source: ${s.name} (${s.type}) ---\n${s.text}`)
      .join('\n\n');

    const primarySource = sources[0];
    const outputDir = path.join(process.cwd(), 'public', 'slides', primarySource.id);

    const deck = await generateSlidesFromText(
      combinedText,
      primarySource.name,
      primarySource.type,
      outputDir,
    );

    return NextResponse.json({
      success: true,
      slideUrl: `/deck/${primarySource.id}`,
      slidesCount: deck.slides.length,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Generate Slides Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Handle PDF slide generation using the existing Python agent pipeline.
 */
async function handlePdfSlides(sourceId: string) {
  const pdfPath = path.join(process.cwd(), '.data', 'uploads', `${sourceId}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { error: 'PDF file not found. Please upload a PDF file first.' },
      { status: 404 }
    );
  }

  const outputDir = path.join(process.cwd(), 'public', 'slides', sourceId);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Prevent Turbopack from tracing .venv symlinks statically
  const cwd = process.cwd();
  const venv = String.fromCharCode(46, 118, 101, 110, 118); // .venv
  const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const pyExe = process.platform === 'win32' ? 'python.exe' : 'python';

  const pythonPath = path.resolve(cwd, venv, binDir, pyExe);
  const scriptPath = path.resolve(cwd, 'main.py');

  console.log(`Generating slides for PDF ${sourceId}...`);

  try {
    await new Promise<void>((resolve, reject) => {
      exec(`"${pythonPath}" "${scriptPath}" --pdf "${pdfPath}" --output "${outputDir}"`, {
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        timeout: 300000
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Slide generation failed: ${stderr || error.message}`));
        } else {
          resolve();
        }
      });
    });
  } catch (execError: unknown) {
    const errorMessage = execError instanceof Error ? execError.message : String(execError);
    console.error('Python Helper Error:', errorMessage);
    throw execError;
  }

  // Verify deck.json was generated
  const deckPath = path.join(outputDir, 'deck.json');
  if (!fs.existsSync(deckPath)) {
    throw new Error('Slide generation completed but deck.json not found');
  }

  const deckRaw = fs.readFileSync(deckPath, 'utf8');
  const deckData = JSON.parse(deckRaw);

  if (!deckData.slides || deckData.slides.length === 0) {
    throw new Error('No slides were generated in the deck');
  }

  return NextResponse.json({
    success: true,
    slideUrl: `/deck/${sourceId}`,
    slidesCount: deckData.slides.length
  });
}
