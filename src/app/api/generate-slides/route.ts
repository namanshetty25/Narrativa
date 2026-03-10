import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
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

    const pythonPath = path.join(process.cwd(), '.venv', 'bin', 'python');
    const scriptPath = path.join(process.cwd(), 'main.py');

    console.log(`🎨 Generating slides for ${sourceId}...`);
    
    try {
      execSync(`${pythonPath} ${scriptPath} --pdf "${pdfPath}" --output "${outputDir}"`, {
        encoding: 'utf8',
        timeout: 300000 // 5 minutes timeout for AI processing
      });
    } catch (execError: any) {
      const stderr = execError.stderr?.toString() || '';
      console.error('Python Helper Error:', stderr);
      throw new Error(`Slide generation failed: ${stderr || execError.message}`);
    }

    // Verify slide files were generated
    const slidesDir = path.join(outputDir, 'slides');
    if (!fs.existsSync(slidesDir)) {
      throw new Error('Slide generation completed but output directory not found');
    }

    const slides = fs.readdirSync(slidesDir)
      .filter(file => file.endsWith('.html'))
      .sort(); // Usually they are named like 001_slide.html

    if (slides.length === 0) {
      throw new Error('No slide HTML files were generated');
    }

    // Return the URL path to the first slide
    const firstSlideUrl = `/slides/${sourceId}/slides/${slides[0]}`;

    return NextResponse.json({ 
      success: true, 
      slideUrl: firstSlideUrl,
      slidesCount: slides.length
    });

  } catch (error: any) {
    console.error('Generate Slides Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
