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

    // Prevent Turbopack from tracing .venv symlinks statically
    const cwd = process.cwd();
    const venv = String.fromCharCode(46, 118, 101, 110, 118); // .venv
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
    const pyExe = process.platform === 'win32' ? 'python.exe' : 'python';
    
    const pythonPath = path.resolve(cwd, venv, binDir, pyExe);
    const scriptPath = path.resolve(cwd, 'main.py');

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

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Generate Slides Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
