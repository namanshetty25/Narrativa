/**
 * generate-text-slides.ts
 * 
 * Gemini-powered text-to-slides pipeline for non-PDF sources.
 * Transforms raw text (from YouTube transcripts, website scrapes, or topics)
 * into a structured deck.json compatible with the Reveal.js viewer.
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
  return new GoogleGenAI({ apiKey });
}

// ================================================================
// Types
// ================================================================

interface SlideImage {
  path: string;
  size: string;
  position: string;
}

interface SlidePlan {
  title: string;
  content: string[];
  layout: string;
  images: SlideImage[];
  styles: Record<string, string | number>;
}

interface DeckJSON {
  title: string;
  slides: SlidePlan[];
}

// ================================================================
// Default theme (matches the Python pipeline's education theme)
// ================================================================

const DEFAULT_THEME = {
  font_family: "'Inter', 'Segoe UI', system-ui, sans-serif",
  heading_color: '#0F172A',
  body_color: '#334155',
  accent_color: '#6366F1',
  accent_soft: '#EEF2FF',
  bg_color: '#FFFFFF',
  bg_alt: '#F8FAFC',
  banner_bg: '#0F172A',
  banner_text: '#FFFFFF',
  h1_size: 64,
  h2_size: 40,
  body_size: 26,
  border_radius: '14px',
  shadow: '0 10px 30px rgba(0,0,0,0.1)',
};

// ================================================================
// Main entry point
// ================================================================

/**
 * Generate slides from raw text content using Gemini.
 * 
 * @param text - The source text content
 * @param sourceName - Display name of the source
 * @param sourceType - 'youtube' | 'url' | 'topic' | 'txt'
 * @param outputDir - Directory to write deck.json and assets
 * @returns The generated deck data
 */
export async function generateSlidesFromText(
  text: string,
  sourceName: string,
  sourceType: string,
  outputDir: string,
): Promise<DeckJSON> {
  // Ensure output directories exist
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });

  console.log(`[TextSlides] Generating slides from ${sourceType}: "${sourceName}"`);

  // Step 1: Analyze and structure the content into a narrative arc
  const narrative = await buildNarrativeArc(text, sourceName, sourceType);

  // Step 2: Plan individual slides
  const slidePlans = await planSlides(narrative, sourceName, sourceType);

  // Step 3: Generate context-aware images for key slides
  const slidesWithImages = await generateSlideImages(slidePlans, outputDir);

  // Step 4: Apply theme and build deck.json
  const deck: DeckJSON = {
    title: narrative.presentationTitle,
    slides: slidesWithImages.map(slide => ({
      ...slide,
      styles: { ...DEFAULT_THEME },
    })),
  };

  // Write deck.json
  const deckPath = path.join(outputDir, 'deck.json');
  fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2), 'utf-8');
  console.log(`[TextSlides] Generated ${deck.slides.length} slides -> ${deckPath}`);

  return deck;
}

// ================================================================
// Step 1: Narrative Arc Builder
// ================================================================

interface NarrativeArc {
  presentationTitle: string;
  sections: {
    sectionTitle: string;
    keyPoints: string[];
    suggestedVisual: string;
  }[];
}

async function buildNarrativeArc(
  text: string,
  sourceName: string,
  sourceType: string,
): Promise<NarrativeArc> {
  const ai = getAI();

  // Truncate very long text to avoid token limits
  const maxChars = 30000;
  const truncatedText = text.length > maxChars
    ? text.slice(0, maxChars) + '\n\n[Content truncated for processing...]'
    : text;

  const sourceContext = sourceType === 'youtube'
    ? 'a YouTube video transcript'
    : sourceType === 'url'
      ? 'a website article'
      : sourceType === 'topic'
        ? 'a research topic'
        : 'a text document';

  const prompt = `You are an elite presentation designer working at Apple / TED / Stanford.

Analyze the following content from ${sourceContext} titled "${sourceName}" and create a structured narrative arc for a BEAUTIFUL, MODERN presentation.

CRITICAL RULES:
- Create 5-12 logical sections that flow as a coherent story
- Each section should capture ONE key idea (minimal, not text-heavy)
- Distill key insights, data points, and compelling facts
- Each section should flow naturally into the next
- Suggest a visual type for each section (chart, diagram, illustration, icon, or "none")
- The presentation title should be compelling and concise

Return ONLY valid JSON:
{
  "presentationTitle": "A compelling title",
  "sections": [
    {
      "sectionTitle": "Section heading",
      "keyPoints": ["Concise point 1", "Concise point 2"],
      "suggestedVisual": "bar chart showing growth trends"
    }
  ]
}

CONTENT:
${truncatedText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const raw = response.text ?? '';
  return parseJSON<NarrativeArc>(raw, 'NarrativeArc');
}

// ================================================================
// Step 2: Slide Planner
// ================================================================

async function planSlides(
  narrative: NarrativeArc,
  sourceName: string,
  sourceType: string,
): Promise<SlidePlan[]> {
  const ai = getAI();

  const sectionsStr = narrative.sections
    .map((s, i) => `Section ${i + 1}: ${s.sectionTitle}\nPoints: ${s.keyPoints.join(' | ')}\nVisual: ${s.suggestedVisual}`)
    .join('\n\n');

  const prompt = `You are an elite presentation designer working at Apple / TED / Stanford.

Convert these narrative sections into BEAUTIFUL, MINIMAL slide plans.

PRESENTATION: "${narrative.presentationTitle}"
SOURCE TYPE: ${sourceType}

SECTIONS:
${sectionsStr}

CRITICAL DESIGN RULES:

1. ONE IDEA PER SLIDE - Never overload.
2. TEXT LIMITS: Max 6 bullets, 12 words per bullet, 40 words per slide.
3. TYPOGRAPHY: "# Heading" for headline, "## Subheading" for supporting idea, "- " for bullets.
4. First slide = hero/title. Last slide = summary/conclusion.
5. DO NOT include the slide title in the "content" array.
6. Keep each slide focused and visually clean.

Available layouts:
- hero_image: Large image with title overlay (opening slides)
- big_number: One key statistic, centered and bold
- visual_focus: Large diagram center, minimal text
- text_left_image_right_large: 50/50 split, image right
- text_right_image_left_large: Mirror of above
- comparison: Two columns for comparing concepts
- step_process: 3-4 steps horizontally
- text_only: Full text with strong visual hierarchy (use when no images)
- full_image: Full background image with overlay text

Return ONLY a valid JSON array:
[
  {
    "title": "Slide title",
    "content": ["## Subheading", "- Key point 1", "- Key point 2"],
    "layout": "text_only",
    "needs_image": false,
    "image_prompt": ""
  }
]`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const raw = response.text ?? '';
  const plans = parseJSON<{ title: string; content: string[]; layout: string; needs_image?: boolean; image_prompt?: string }[]>(raw, 'SlidePlanner');

  return plans.map(plan => ({
    title: plan.title,
    content: plan.content,
    layout: plan.layout || 'text_only',
    images: [],
    styles: {},
  }));
}

// ================================================================
// Step 3: Image Generator (AI-generated visuals for key slides)
// ================================================================

async function generateSlideImages(
  slides: SlidePlan[],
  outputDir: string,
): Promise<SlidePlan[]> {
  // For now, return slides as-is without generated images.
  // AI image generation can be added in Phase 3 using Gemini's image generation API.
  // The slides will use text_only layouts which work well for text-based sources.
  return slides;
}

// ================================================================
// JSON Parser (robust, handles LLM markdown fences)
// ================================================================

function parseJSON<T>(raw: string, label: string): T {
  if (!raw || !raw.trim()) {
    throw new Error(`[${label}] LLM returned empty output`);
  }

  let cleaned = raw.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Extract JSON object or array
  const match = cleaned.match(/([\[{][\s\S]*[\]}])/);
  if (!match) {
    throw new Error(`[${label}] No JSON found in LLM output`);
  }

  try {
    return JSON.parse(match[1]) as T;
  } catch (e) {
    throw new Error(`[${label}] Invalid JSON: ${e}`);
  }
}
