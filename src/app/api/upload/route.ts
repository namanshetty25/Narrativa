import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { addSourceAndChunks } from '@/lib/store';
import { generateEmbeddings } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'GOOGLE_API_KEY not set. Cannot process PDFs.' }, { status: 500 });
      }

      const ai = new GoogleGenAI({ apiKey });
      const base64Data = buffer.toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Data,
                },
              },
              {
                text: 'Extract ALL text content from this PDF document. Return ONLY the raw text, preserving paragraphs and structure. Do not add any commentary or summaries.',
              },
            ],
          },
        ],
      });

      text = response.text ?? '';
    } else {
      text = buffer.toString('utf-8');
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 });
    }

    // Add source and create chunks (now linked to session)
    const { source, chunks } = await addSourceAndChunks(sessionId, {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.name.endsWith('.pdf') ? 'pdf' : 'txt',
      text: text,
    });

    // Save the PDF locally for the slide generator
    if (source.type === 'pdf') {
      const fs = await import('fs');
      const path = await import('path');
      const uploadDir = path.join(process.cwd(), '.data', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, `${source.id}.pdf`), buffer);
    }

    // Generate embeddings for all chunks and persist them
    try {
      const chunkTexts = chunks.map((c: { text: string }) => c.text);
      const embeddings = await generateEmbeddings(chunkTexts);

      const { addVectors } = await import('@/lib/vector-store');
      const chunkIds = chunks.map((c: { id: string }) => c.id);
      addVectors(embeddings, chunkIds);

      console.log(`✅ Generated embeddings for ${embeddings.length} chunks and stored in FAISS`);
    } catch (embeddingError) {
      console.error('Failed to generate embeddings (chunks stored without embeddings):', embeddingError);
    }

    return NextResponse.json({ success: true, source: { id: source.id, name: source.name, type: source.type } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Upload Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
