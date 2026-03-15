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

      const outputDir = process.env.VERCEL
        ? path.join('/tmp', 'slides', `topic-${Date.now()}`)
        : path.join(process.cwd(), 'public', 'slides', `topic-${Date.now()}`);
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
      select: { id: true, name: true, type: true, text: true, url: true },
    });

    if (sources.length === 0) {
      return NextResponse.json({ error: 'No sources found' }, { status: 404 });
    }

    // Check if any source is a PDF (use Python pipeline for PDFs)
    const pdfSource = sources.find((s: { type: string }) => s.type === 'pdf');

    if (pdfSource && sources.length === 1) {
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required for saving artifacts' }, { status: 400 });
      }
      // ================================================
      // PDF Pipeline (existing Python agent)
      // ================================================
      return await handlePdfSlides(pdfSource.id, sessionId, pdfSource.url || undefined);
    }

    // ================================================
    // Text Pipeline (YouTube, URL, txt, or mixed sources)
    // ================================================
    const combinedText = sources
      .map((s: { name: string; type: string; text: string }) => `--- Source: ${s.name} (${s.type}) ---\n${s.text}`)
      .join('\n\n');

    const primarySource = sources[0];
    const outputDir = process.env.VERCEL
      ? path.join('/tmp', 'slides', primarySource.id)
      : path.join(process.cwd(), 'public', 'slides', primarySource.id);

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
 * Handle PDF slide generation using the decoupled Python FastAPI server.
 */
async function handlePdfSlides(sourceId: string, sessionId: string, pdfUrl?: string | null) {

  console.log(`Generating slides for PDF ${sourceId} from ${pdfUrl || 'local storage'}...`);

  try {
    let pdfBuffer: ArrayBuffer;
    
    // 1. Fetch the PDF from Vercel Blob or local storage
    if (pdfUrl) {
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF from Blob: ${pdfResponse.statusText}`);
      }
      pdfBuffer = await pdfResponse.arrayBuffer();
    } else {
      // Fallback: Read from local filesystem (/tmp on Vercel, .data locally)
      const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), '.data', 'uploads');
      const localPdfPath = path.join(uploadDir, `${sourceId}.pdf`);
      if (!fs.existsSync(localPdfPath)) {
        throw new Error('PDF file not found in Blob or local storage.');
      }
      pdfBuffer = fs.readFileSync(localPdfPath).buffer.slice(
        fs.readFileSync(localPdfPath).byteOffset, 
        fs.readFileSync(localPdfPath).byteOffset + fs.readFileSync(localPdfPath).byteLength
      );
    }

    // 2. Send PDF to the Python FastAPI backend
    const backendUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    const formData = new FormData();
    formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }), 'input.pdf');
    // formData.append('page_range', ''); // Can add page range support here

    const apiResponse = await fetch(`${backendUrl}/api/generate-slides`, {
      method: 'POST',
      body: formData,
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}));
      throw new Error(`Python API failed: ${errorData.error || apiResponse.statusText}`);
    }

    // 3. Process the returned ZIP file containing slides & assets
    const zipBuffer = await apiResponse.arrayBuffer();
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipBuffer);

    const { put } = await import('@vercel/blob');
    let deckData: any = null;
    const assetUrlMap: Record<string, string> = {};

    // 4. Upload to Vercel Blob (or fallback to local public directory)
    const uploadPromises: Promise<void>[] = [];
    const localOutputDir = process.env.VERCEL
      ? path.join('/tmp', 'slides', sourceId)
      : path.join(process.cwd(), 'public', 'slides', sourceId);

    // Read the exact Vercel Blob Token status
    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;

    if (!hasBlobToken) {
       if (!fs.existsSync(localOutputDir)) {
         fs.mkdirSync(localOutputDir, { recursive: true });
       }
       const localAssetsDir = path.join(localOutputDir, 'assets');
       if (!fs.existsSync(localAssetsDir)) {
         fs.mkdirSync(localAssetsDir, { recursive: true });
       }
    }

    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        if (relativePath === 'deck.json') {
          // Keep deck.json to process its contents
          uploadPromises.push(
            zipEntry.async('string').then((content) => {
              deckData = JSON.parse(content);
              if (!hasBlobToken) {
                 fs.writeFileSync(path.join(localOutputDir, 'deck.json'), content);
              }
            })
          );
        } else if (relativePath.startsWith('assets/')) {
          uploadPromises.push(
            zipEntry.async('nodebuffer').then(async (buffer) => {
              const basename = path.basename(relativePath);
              
              if (hasBlobToken) {
                const blob = await put(`slides/${sourceId}/${basename}`, buffer, {
                  access: 'public',
                  addRandomSuffix: false, // Maintain exact filename to prevent duplicate uploads during generation
                });
                assetUrlMap[basename] = blob.url;
              } else {
                // Local fallback
                fs.writeFileSync(path.join(localOutputDir, 'assets', basename), buffer);
                // The browser will fetch relative to the output dir we pass back
                assetUrlMap[basename] = basename;
              }
            })
          );
        }
      }
    });

    await Promise.all(uploadPromises);

    if (!deckData || !deckData.slides || deckData.slides.length === 0) {
      throw new Error('No slides were generated in the deck, or deck.json is missing');
    }

    // 5. Update deck.json image paths with Vercel Blob URLs
    for (const slide of deckData.slides) {
      if (slide.images) {
        for (const img of slide.images) {
          if (img.path && assetUrlMap[img.path]) {
            img.path = assetUrlMap[img.path];
          }
        }
      }
    }

    // 6. Save final deck.json as an Artifact in the database!
    const { saveArtifact } = await import('@/lib/store');
    await saveArtifact(sessionId, {
      id: sourceId, // Reuse sourceId as artifact ID for convenience since slide generation is 1:1 currently
      type: 'slides',
      label: 'Generated Slides',
      sourceIds: [sourceId],
      content: JSON.stringify(deckData),
      timestamp: Date.now(),
    });

    // Instead of local filesystem, we serve the deck using the artifact endpoint in our pages
    return NextResponse.json({
      success: true,
      slideUrl: `/deck/${sourceId}`,
      slidesCount: deckData.slides.length
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Python Helper / Deployment Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
