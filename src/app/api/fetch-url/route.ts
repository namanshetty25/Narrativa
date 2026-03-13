import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { addSourceAndChunks } from "@/lib/store";
import { generateEmbeddings } from "@/lib/embeddings";

export async function POST(req: NextRequest) {
  try {
    let { url, sessionId } = await req.json();

    if (url && typeof url === "string") {
      // Normalize protocol-relative URLs
      if (url.startsWith("//")) {
        url = `https:${url}`;
      }

      // Handle DuckDuckGo redirect URLs (e.g., https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.researchgate.net...)
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname.includes('duckduckgo.com') && parsedUrl.searchParams.has('uddg')) {
          url = decodeURIComponent(parsedUrl.searchParams.get('uddg') || url);
        }
      } catch (e) {
        // Ignore URL parsing errors, let it fail below if invalid
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    let text = "";
    let name = url;
    let type = "url";

    const isYouTube = /(?:youtube\.com|youtu\.be)/.test(url);

    // ------------------------------------------------
    // YOUTUBE TRANSCRIPT EXTRACTION
    // ------------------------------------------------
    if (isYouTube) {
      try {
        const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:&|\?|$)/);
        if (!videoIdMatch) {
          throw new Error("Could not extract Video ID from YouTube URL");
        }
        const videoId = videoIdMatch[1];

        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        const html = await response.text();

        let title = "YouTube Video";
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
          title = titleMatch[1].replace(" - YouTube", "");
        }

        const { exec } = await import("child_process");
        const path = await import("path");

        const pythonPath = path.join(process.cwd(), '.' + 'venv', process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
        const scriptPath = path.join(process.cwd(), "scripts/youtube_transcript.py");

        console.log(`🎬 Fetching transcript for ${videoId} using Python helper...`);

        try {
          text = await new Promise<string>((resolve, reject) => {
            exec(`"${pythonPath}" "${scriptPath}" "${videoId}"`, {
              encoding: "utf8",
              timeout: 30000
            }, (error, stdout, stderr) => {
              if (error) {
                reject(new Error(`Transcript extraction failed: ${stderr || error.message}`));
              } else {
                resolve(stdout);
              }
            });
          });
        } catch (execError: unknown) {
          const errorMessage = execError instanceof Error ? execError.message : String(execError);
          console.error("Python Helper Error:", errorMessage);
          throw execError;
        }

        if (!text || !text.trim()) {
          throw new Error("Transcript returned by helper is empty");
        }

        text = text
          .replace(/\[(.*?)\]/g, "")
          .replace(/\((.*?)\)/g, "")
          .replace(/\s+/g, " ")
          .trim();

        name = `YouTube: ${title}`;
        type = "youtube";
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("YouTube Logic Error:", e);
        return NextResponse.json(
          { error: `YouTube transcript failed: ${errorMessage}` },
          { status: 400 }
        );
      }
    }

    // ------------------------------------------------
    // WEBSITE SCRAPER
    // ------------------------------------------------
    else {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
        });

        if (!response.ok) {
          throw new Error(`Website request failed with status ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        $("script, style, nav, footer, iframe, noscript, header, aside").remove();

        let contentNodes = $("article, main, .content, #content, .post, .entry").find(
          "h1, h2, h3, h4, p, li"
        );

        if (contentNodes.length === 0) {
          contentNodes = $("h1, h2, h3, h4, p, li");
        }

        const contents: string[] = [];
        contentNodes.each((_, el) => {
          const txt = $(el).text().trim();
          if (txt && txt.length > 20) contents.push(txt);
        });

        text = contents.join("\n\n");
        name = $("title").text().trim() || url;
      } catch (e: any) {
        console.error("Scraper Logic Error:", e);
        return NextResponse.json(
          { error: `Website scraping failed: ${e.message}` },
          { status: 400 }
        );
      }
    }

    // ------------------------------------------------
    // VALIDATE TEXT
    // ------------------------------------------------
    if (!text.trim()) {
      return NextResponse.json(
        { error: "No readable text could be extracted from this source" },
        { status: 400 }
      );
    }

    // ------------------------------------------------
    // STORE SOURCE + CHUNKS (linked to session)
    // ------------------------------------------------
    const { source, chunks } = await addSourceAndChunks(sessionId, {
      id: crypto.randomUUID(),
      name: name.length > 60 ? name.substring(0, 57) + "..." : name,
      type,
      text,
    });

    // ------------------------------------------------
    // GENERATE EMBEDDINGS
    // ------------------------------------------------
    try {
      if (chunks.length > 0) {
        const chunkTexts = chunks.map((c) => c.text);
        const embeddings = await generateEmbeddings(chunkTexts);

        const { addVectors } = await import("@/lib/vector-store");
        const chunkIds = chunks.map((c) => c.id);
        addVectors(embeddings, chunkIds);

        console.log(`✅ Embedded ${embeddings.length} chunks from ${type}`);
      }
    } catch (embeddingError) {
      console.error(
        "Embedding generation failed (text still saved):",
        embeddingError
      );
    }

    return NextResponse.json({ success: true, source });

  } catch (error: any) {
    console.error("Global Error in fetch-url:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}