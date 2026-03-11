import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const { sourceId } = await req.json();

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
    }

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

    const pythonPath = path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
    const scriptPath = path.join(process.cwd(), 'main.py');

    console.log(`Generating slides for ${sourceId}...`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`"${pythonPath}" "${scriptPath}" --pdf "${pdfPath}" --output "${outputDir}"`, {
          encoding: 'utf8',
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
          timeout: 300000 // 5 minutes timeout for AI processing
        }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Slide generation failed: ${stderr || error.message}`));
          } else {
            resolve();
          }
        });
      });
    } catch (execError: any) {
      console.error('Python Helper Error:', execError.message);
      throw execError;
    }

    // Verify deck.json was generated
    const deckPath = path.join(outputDir, 'deck.json');
    if (!fs.existsSync(deckPath)) {
      throw new Error('Slide generation completed but deck.json not found');
    }

    // Read the deck to count slides (optional, but good for validation)
    const deckRaw = fs.readFileSync(deckPath, 'utf8');
    const deckData = JSON.parse(deckRaw);

    if (!deckData.slides || deckData.slides.length === 0) {
      throw new Error('No slides were generated in the deck');
    }

    // Return the URL path to the dynamic Next.js viewer
    return NextResponse.json({ 
      success: true, 
      slideUrl: `/deck/${sourceId}`,
      slidesCount: deckData.slides.length
    });

  } catch (error: any) {
    console.error('Generate Slides Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
