"use client";

import { useEffect, useRef } from 'react';
import Reveal from 'reveal.js';
import 'reveal.js/dist/reveal.css';
// We'll use a custom Narrativa theme, but we can base it on simple
import 'reveal.js/dist/theme/simple.css'; 
import styles from './deck.module.css';

// Import Markdown renderers for tables/headings in the JSON
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface SlidePlan {
  title?: string;
  content?: string[];
  layout?: string;
  images?: { path: string; size: string; position: string }[];
  styles?: any;
}

interface DeckData {
  title: string;
  slides: SlidePlan[];
}

export default function DeckClient({ deck, sourceId }: { deck: DeckData, sourceId: string }) {
  const deckRef = useRef<HTMLDivElement>(null);
  const revealInstance = useRef<Reveal.Api | null>(null);

  useEffect(() => {
    let deck: Reveal.Api | null = null;
    let isMounted = true;

    // Small timeout ensures React has fully painted the DOM nodes before Reveal touches them
    const timer = setTimeout(() => {
      if (deckRef.current && isMounted) {
        deck = new Reveal(deckRef.current, {
          controls: true,
          progress: true,
          center: true,
          hash: true,
          transition: 'slide',
          width: 1920,
          height: 1080,
          margin: 0.04,
          minScale: 0.2,
          maxScale: 2.0,
          embedded: true, // VERY IMPORTANT for React/iframes to prevent body classList crashes
          keyboardCondition: 'focused', // Only capture keyboard when iframe is focused
        });

        deck.initialize().then(() => {
          // Additional safety: Reveal sometimes adds injected background divs that React hates.
          // In an iframe, this is mostly fine, but `embedded: true` prevents most conflicts.
        }).catch(err => console.warn('Reveal initialization warning:', err));
      }
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      try {
        if (deck) {
          deck.destroy();
        }
      } catch (e) {
        console.warn("Reveal.js destroy cleanup:", e);
      }
    };
  }, []);

  // Helper to render markdown content
  const renderContent = (contentArr: string[] = []) => {
    return contentArr.map((item, idx) => (
      <div key={idx} className={styles.contentBlock}>
        <ReactMarkdown 
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        >
          {item}
        </ReactMarkdown>
      </div>
    ));
  };

  // Helper to get image URL from path
  // On production, images are Vercel Blob URLs (full https://... URLs)
  // On local dev, images are relative filenames served from /slides/
  const getImageUrl = (filepath: string) => {
    if (filepath.startsWith('http://') || filepath.startsWith('https://')) {
      return filepath; // Already a full Blob URL
    }
    return `/slides/${sourceId}/assets/${filepath}`;
  };

  // Renderer for Layout Types
  const renderSlideLayout = (slide: SlidePlan) => {
    let layout = slide.layout || 'text_only';
    const content = renderContent(slide.content);
    const images = slide.images || [];

    // Force an image layout if the agent sent images but picked text_only
    if (images.length > 0 && layout === 'text_only') {
      layout = 'text_left_image_right_medium';
    }

    if (layout === 'full_image' && images.length > 0) {
      return (
        <div className={`${styles.slideContainer} ${styles.fullImageLayout}`}>
          <img src={getImageUrl(images[0].path)} alt="Background" className={styles.fullImageBg} />
          <div className={styles.overlayContent}>
            {content}
          </div>
        </div>
      );
    }

    if (layout.includes('text_left_image_right')) {
      const sizeClass = layout.includes('large') ? styles.imgLarge : styles.imgMedium;
      return (
        <div className={`${styles.slideContainer} ${styles.splitLayout}`}>
          <div className={styles.leftHalf}>
            {content}
          </div>
          <div className={`${styles.rightHalf} ${styles.imageHalf}`}>
            {images[0] && <img src={getImageUrl(images[0].path)} className={sizeClass} alt="Asset" />}
          </div>
        </div>
      );
    }

    if (layout.includes('text_right_image_left')) {
      const sizeClass = layout.includes('large') ? styles.imgLarge : styles.imgMedium;
      return (
        <div className={`${styles.slideContainer} ${styles.splitLayout}`}>
          <div className={`${styles.leftHalf} ${styles.imageHalf}`}>
            {images[0] && <img src={getImageUrl(images[0].path)} className={sizeClass} alt="Asset" />}
          </div>
          <div className={styles.rightHalf}>
            {content}
          </div>
        </div>
      );
    }

    // Default: text_only
    return (
      <div className={`${styles.slideContainer} ${styles.textOnlyLayout}`}>
        {content}
      </div>
    );
  };

  return (
    <div className={styles.deckWrapper}>
      <div className="reveal" ref={deckRef}>
        <div className="slides">
          {deck.slides.map((slide, i) => {
            // Apply custom theming from the slide data if needed
            const hColor = slide.styles?.heading_color || '#1a365d';
            
            return (
              <section 
                key={i} 
                className={styles.narrativaSlide}
                style={{ '--h-color': hColor } as React.CSSProperties}
              >
                {/* Title Banner */}
                {slide.title && (
                  <div className={styles.titleBanner}>
                    <h1>{slide.title}</h1>
                  </div>
                )}
                
                {/* Content Area */}
                <div className={styles.slideBody}>
                  {renderSlideLayout(slide)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
