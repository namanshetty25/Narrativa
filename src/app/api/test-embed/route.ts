import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/embeddings';

export async function GET() {
  try {
    console.log('Testing embedding generation...');
    const embedding = await generateEmbedding('What is quantum computing?');
    console.log('Embedding generated! Dim:', embedding.length);
    return NextResponse.json({ 
      success: true, 
      dimension: embedding.length, 
      sample: embedding.slice(0, 5) 
    });
  } catch (error: any) {
    console.error('Embedding test error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack?.slice(0, 500)
    }, { status: 500 });
  }
}
