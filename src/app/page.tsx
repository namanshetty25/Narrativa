"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Headphones, FileBarChart, Presentation, BookOpen, Search, Trash2, Clock, Sparkles } from 'lucide-react';
import styles from './page.module.css';

type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
};

export default function LandingPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [notebooksVisible, setNotebooksVisible] = useState(false);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const featuresRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Trigger hero animation
    requestAnimationFrame(() => setHeroVisible(true));
    setTimeout(() => setNotebooksVisible(true), 600);

    // Intersection Observer for features section
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setFeaturesVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });

    if (featuresRef.current) {
      observer.observe(featuresRef.current);
    }

    // Fetch sessions
    (async () => {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        setSessions(data.sessions || []);
      } catch (err) {
        console.error('Failed to load sessions', err);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => observer.disconnect();
  }, []);

  const handleCreateNotebook = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/notebook/${data.sessionId}`);
      }
    } catch (err) {
      console.error('Failed to create notebook', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const getTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const features = [
    { icon: <Headphones size={28} />, title: 'Audio Overview', desc: 'Transform your sources into an engaging dual-host podcast conversation', color: '#6366f1' },
    { icon: <FileBarChart size={28} />, title: 'Executive Summary', desc: 'Generate a structured one-page overview with key findings and next steps', color: '#8b5cf6' },
    { icon: <Presentation size={28} />, title: 'Slides Generator', desc: 'Turn any document into beautiful, presentation-ready slide decks', color: '#a855f7' },
    { icon: <Search size={28} />, title: 'Topic to Slides', desc: 'Research any topic from the web and create data-driven presentations', color: '#c084fc' },
    { icon: <BookOpen size={28} />, title: 'Research Report', desc: 'Deep-dive research with academic citations, analysis, and references', color: '#e879f9' },
  ];

  return (
    <div className={styles.landing}>
      {/* ===== HERO SECTION ===== */}
      <section className={styles.heroSection}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlowSecondary} />

        <div className={`${styles.heroContent} ${heroVisible ? styles.heroVisible : ''}`}>
          <div className={styles.heroBadge}>
            <Sparkles size={14} />
            <span>AI-Powered Research Notebook</span>
          </div>
          <h1 className={styles.heroTitle}>
            Welcome to <span className={styles.heroGradient}>Narrativa</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Upload documents, ask questions, and let AI generate summaries, podcasts, slides, and research reports — all from your sources.
          </p>
        </div>
      </section>

      {/* ===== NOTEBOOKS SECTION ===== */}
      <section className={`${styles.notebooksSection} ${notebooksVisible ? styles.sectionVisible : ''}`}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Your Notebooks</h2>
          </div>

          {isLoading ? (
            <div className={styles.loadingGrid}>
              {[1, 2, 3].map(i => (
                <div key={i} className={styles.skeletonCard} />
              ))}
            </div>
          ) : sessions.length > 0 ? (
            <div className={styles.notebooksGrid}>
              {/* Create new card */}
              <button className={`${styles.createCard} ${!isCreating ? styles.createCardPulse : ''}`} onClick={handleCreateNotebook} disabled={isCreating}>
                <div className={styles.createCardIcon}>
                  <Plus size={32} />
                </div>
                <span className={styles.createCardLabel}>Create New Notebook</span>
              </button>

              {/* Existing notebooks */}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={styles.notebookCard}
                  onClick={() => router.push(`/notebook/${session.id}`)}
                >
                  <div className={styles.notebookCardHeader}>
                    <FileText size={20} className={styles.notebookCardIcon} />
                    <button
                      className={styles.notebookDeleteBtn}
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      title="Delete notebook"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3 className={styles.notebookCardTitle}>{session.title}</h3>
                  <div className={styles.notebookCardMeta}>
                    <Clock size={12} />
                    <span>{getTimeAgo(session.updatedAt)}</span>
                    {session._count && <span>• {session._count.messages} messages</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyNotebooks}>
              <div className={styles.emptyIcon}>
                <FileText size={48} />
              </div>
              <h3>No notebooks yet</h3>
              <p>Create your first notebook to get started with AI-powered research</p>
              <button className={styles.createButtonLarge} onClick={handleCreateNotebook} disabled={isCreating}>
                <Plus size={20} />
                <span>Create Your First Notebook</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section ref={featuresRef} className={`${styles.featuresSection} ${featuresVisible ? styles.sectionVisible : ''}`}>
        <div className={styles.sectionContainer}>
          <div className={`${styles.featuresSectionHeader} ${featuresVisible ? styles.featureHeaderVisible : ''}`}>
            <h2 className={styles.sectionTitle}>Powered by AI</h2>
            <p className={styles.featuresSubtitle}>Five studio tools to transform your research into actionable outputs</p>
          </div>

          <div className={styles.featuresGrid}>
            {features.map((feature, i) => (
              <div
                key={i}
                className={`${styles.featureCard} ${featuresVisible ? styles.featureCardVisible : ''}`}
                style={{ transitionDelay: `${0.1 * i}s`, '--feature-color': feature.color } as React.CSSProperties}
              >
                <div className={styles.featureCardIcon}>
                  {feature.icon}
                </div>
                <h3 className={styles.featureCardTitle}>{feature.title}</h3>
                <p className={styles.featureCardDesc}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className={styles.footer}>
        <p>Built with Gemini AI • Narrativa</p>
      </footer>
    </div>
  );
}
