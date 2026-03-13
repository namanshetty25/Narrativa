import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { retrieveRelevantChunks } from '@/lib/retrieval';
import { getChunks, addMessage } from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    interface ChatMessage {
      role: 'user' | 'ai' | 'model';
      content: string;
    }

    const { messages, selectedSourceIds, sessionId } = (await req.json()) as {
      messages: ChatMessage[];
      selectedSourceIds: string[];
      sessionId: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const lastMessage = messages[messages.length - 1];
    const query = lastMessage.content;

    // Save user message to database
    if (sessionId) {
      await addMessage(sessionId, 'user', query);
    }

    // 1. Retrieve relevant context from uploaded documents
    const availableChunks = await getChunks('', selectedSourceIds);
    let contextText = '';

    if (availableChunks.length > 0) {
      const retrievedChunks = await retrieveRelevantChunks(query, 8, selectedSourceIds);
      if (retrievedChunks.length > 0) {
        contextText = retrievedChunks.map((c: { text: string }, i: number) => `[Excerpt ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
      } else {
        contextText = availableChunks.slice(0, 8).map((c: { text: string }, i: number) => `[Excerpt ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
      }
    }

    // 2. Build the system instruction
    const systemInstruction = contextText
      ? `You are Narrativa, an intelligent research assistant similar to NotebookLM. Answer the user's questions based ONLY on the provided source document excerpts below.

IMPORTANT RULES:
- Answer ONLY from the provided sources. Never introduce facts from outside these sources.
- Cite which source supports each claim using inline citations: (Source-1), (Source-2), etc.
- If multiple sources conflict, surface the conflict: "Source-1 states X, while Source-2 argues Y."
- If the answer is not in any source, say: "This is not covered in your current sources."
- Keep answers focused. Do not pad. Do not repeat the question back.

FORMATTING RULES:
- Use proper LaTeX notation for ALL mathematical expressions. Use $...$ for inline math and $$...$$ for display math.
- Use markdown formatting: **bold**, *italic*, headers, bullet points, code blocks where appropriate.
- Be detailed, clear, and well-structured in your explanations.

SOURCE EXCERPTS:\n${contextText}`
      : `You are Narrativa, an intelligent research assistant. The user has not uploaded any source documents yet. Politely remind them to upload documents first so you can answer questions based on them.`;

    // 3. Convert chat history to Gemini format
    const chatHistory = messages.slice(0, -1)
      .filter((msg: ChatMessage) => msg.content && msg.content.trim())
      .map((msg: ChatMessage) => ({
        role: msg.role === 'ai' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

    // 4. Call Gemini with streaming
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: query }] }
      ],
      config: {
        systemInstruction: systemInstruction,
      }
    });

    // 5. Transform async iterator to Web ReadableStream and collect full response
    const encoder = new TextEncoder();
    let fullAiResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              fullAiResponse += chunk.text;
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
          // Save AI response to database after streaming completes
          if (sessionId && fullAiResponse) {
            await addMessage(sessionId, 'ai', fullAiResponse);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
