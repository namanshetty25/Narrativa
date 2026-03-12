"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, FileText, Send, Loader2, Sparkles, User, Trash2, Headphones, Play, Pause, Volume2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Presentation, FileBarChart, Link as LinkIcon, Package, MessageSquarePlus, Clock, Search, BookOpen, SquarePen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import styles from './page.module.css';

type Source = {
  id: string;
  name: string;
  type: string;
};

type Message = {
  role: 'ai' | 'user';
  content: string;
};

type Artifact = {
  id: string;
  type: 'audio' | 'summary' | 'slides';
  label: string;
  sourceIds: string[];
  url?: string;
  content?: string;
  script?: string;
  timestamp: number;
};

type SessionListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
};

type ResearchReport = {
  id: string;
  topic: string;
  content: string;
  papers: { title: string; url: string }[];
  createdAt: string;
};

type ActiveModal = {
  type: 'audio' | 'summary' | 'slides' | 'report';
  artifact?: Artifact;
  report?: ResearchReport;
} | null;

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Home() {
  // ===== SESSION STATE =====
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // ===== EXISTING STATE =====
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'Welcome to **Narrativa**! Upload your documents using the sidebar, then ask me anything about them. I\'ll answer based strictly on your sources.' }
  ]);
  const [input, setInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isUrlAdding, setIsUrlAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  // Generation loading states
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioGenerationStatus, setAudioGenerationStatus] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Research report
  const [reportTopic, setReportTopic] = useState('');
  const [reports, setReports] = useState<ResearchReport[]>([]);

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' | 'info' } | null>(null);

  // Artifacts & Modal state
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ===== SESSION MANAGEMENT =====

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
        // Auto-select the most recent session if no active session
        if (data.sessions.length > 0 && !activeSessionId) {
          await loadSession(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (data.session) {
        setActiveSessionId(sessionId);
        setSources(data.session.sources || []);
        setSelectedSourceIds([]);
        setArtifacts(data.session.artifacts || []);
        setReports(data.session.reports || []);

        if (data.session.messages && data.session.messages.length > 0) {
          setMessages(data.session.messages);
        } else {
          setMessages([
            { role: 'ai', content: 'Welcome to **Narrativa**! Upload your documents using the sidebar, then ask me anything about them. I\'ll answer based strictly on your sources.' }
          ]);
        }
      }
    } catch (err) {
      console.error('Failed to load session', err);
    }
  };

  const handleNewChat = async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      if (data.sessionId) {
        setActiveSessionId(data.sessionId);
        setSources([]);
        setSelectedSourceIds([]);
        setArtifacts([]);
        setReports([]);
        setMessages([
          { role: 'ai', content: 'Welcome to **Narrativa**! Upload your documents using the sidebar, then ask me anything about them. I\'ll answer based strictly on your sources.' }
        ]);
        // Reload sessions list
        const sessRes = await fetch('/api/sessions');
        const sessData = await sessRes.json();
        if (sessData.sessions) setSessions(sessData.sessions);
      }
    } catch (err) {
      console.error('Failed to create session', err);
      showToast('Failed to create new chat', 'error');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          await loadSession(remaining[0].id);
        } else {
          await handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  // Helper: build a human-readable label from selected source indices
  const getSourceLabel = (ids: string[]): string => {
    const indices = ids.map(id => {
      const idx = sources.findIndex(s => s.id === id);
      return idx >= 0 ? idx + 1 : null;
    }).filter(Boolean);
    if (indices.length === 0) return 'Sources';
    return `Source-${indices.join(', ')}`;
  };

  // Helper: find existing artifact matching type + sourceIds
  const findExistingArtifact = (type: Artifact['type'], sourceIds: string[]): Artifact | undefined => {
    const sorted = [...sourceIds].sort();
    return artifacts.find(a =>
      a.type === type &&
      a.sourceIds.length === sorted.length &&
      [...a.sourceIds].sort().every((id, i) => id === sorted[i])
    );
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Audio time update
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => {
      setDuration(audio.duration);
      audio.playbackRate = 1.12;
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [activeModal]);

  // ===== GENERATION HANDLERS =====

  const handleGenerateAudio = async () => {
    if (isGeneratingAudio || selectedSourceIds.length === 0) return;

    const existing = findExistingArtifact('audio', selectedSourceIds);
    if (existing) {
      setActiveModal({ type: 'audio', artifact: existing });
      return;
    }

    setIsGeneratingAudio(true);
    setAudioGenerationStatus('Generating script from your sources...');

    try {
      const res = await fetch('/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSourceIds })
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to generate audio', 'error');
        setIsGeneratingAudio(false);
        setAudioGenerationStatus('');
        return;
      }

      setAudioGenerationStatus('Creating audio...');
      const data = await res.json();

      if (data.success) {
        const artifact: Artifact = {
          id: crypto.randomUUID(),
          type: 'audio',
          label: `${getSourceLabel(selectedSourceIds)} Audio`,
          sourceIds: [...selectedSourceIds],
          url: data.audioUrl,
          script: data.script,
          timestamp: Date.now(),
        };

        // Save to database
        await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...artifact, sessionId: activeSessionId })
        });

        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'audio', artifact });
        setAudioGenerationStatus('');
      } else {
        showToast(data.error || 'Audio generation failed', 'error');
        setAudioGenerationStatus('');
      }
    } catch (err) {
      console.error('Audio generation error:', err);
      showToast('Connection error. Please try again.', 'error');
      setAudioGenerationStatus('');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = fraction * duration;
  };

  const handleGenerateSummary = async () => {
    if (isGeneratingSummary || selectedSourceIds.length === 0) return;

    const existing = findExistingArtifact('summary', selectedSourceIds);
    if (existing) {
      setActiveModal({ type: 'summary', artifact: existing });
      return;
    }

    setIsGeneratingSummary(true);

    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSourceIds })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const artifact: Artifact = {
          id: crypto.randomUUID(),
          type: 'summary',
          label: `${getSourceLabel(selectedSourceIds)} Summary`,
          sourceIds: [...selectedSourceIds],
          content: data.summary,
          timestamp: Date.now(),
        };

        await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...artifact, sessionId: activeSessionId })
        });

        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'summary', artifact });
      } else {
        showToast(data.error || 'Failed to generate summary', 'error');
      }
    } catch (err) {
      console.error('Summary error:', err);
      showToast('Connection error. Please try again.', 'error');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateSlides = async () => {
    const selectedPdfs = sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id));
    if (isGeneratingSlides || selectedPdfs.length === 0) return;

    const source = selectedPdfs[0];

    const existing = findExistingArtifact('slides', [source.id]);
    if (existing && existing.url) {
      window.open(existing.url, '_blank');
      return;
    }

    setIsGeneratingSlides(true);

    try {
      const res = await fetch('/api/generate-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const artifact: Artifact = {
          id: crypto.randomUUID(),
          type: 'slides',
          label: `${getSourceLabel([source.id])} Slides`,
          sourceIds: [source.id],
          url: data.slideUrl,
          timestamp: Date.now(),
        };

        await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...artifact, sessionId: activeSessionId })
        });

        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'slides', artifact });
      } else {
        showToast(data.error || 'Failed to generate slides', 'error');
      }
    } catch (err) {
      console.error('Slide generation error:', err);
      showToast('Connection error. Please try again.', 'error');
    } finally {
      setIsGeneratingSlides(false);
    }
  };

  // ===== RESEARCH REPORT HANDLER =====
  const handleGenerateReport = async () => {
    if (isGeneratingReport || !reportTopic.trim() || !activeSessionId) return;

    setIsGeneratingReport(true);

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: reportTopic, sessionId: activeSessionId })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const report: ResearchReport = {
          id: data.report.id,
          topic: data.report.topic,
          content: data.report.content,
          papers: data.report.papers,
          createdAt: new Date().toISOString(),
        };

        setReports(prev => [report, ...prev]);
        setActiveModal({ type: 'report', report });
        setReportTopic('');
        showToast('Research report generated!', 'success');
      } else {
        showToast(data.error || 'Failed to generate report', 'error');
      }
    } catch (err) {
      console.error('Report generation error:', err);
      showToast('Connection error. Please try again.', 'error');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // ===== CHAT HANDLER =====

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending || !activeSessionId) return;
    const userMessage = input.trim();
    setInput('');
    setIsSending(true);

    // Auto-title session on first user message
    if (messages.length <= 1) {
      const title = userMessage.length > 40 ? userMessage.substring(0, 37) + '...' : userMessage;
      fetch(`/api/sessions/${activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then(() => {
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, title } : s
        ));
      }).catch(() => {});
    }

    const updatedMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    const withPlaceholder: Message[] = [
      ...updatedMessages,
      { role: 'ai', content: '' },
    ];
    setMessages(withPlaceholder);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, selectedSourceIds, sessionId: activeSessionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'ai', content: `⚠️ Error: ${data.error}` };
          return copy;
        });
        setIsSending(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setIsSending(false); return; }

      let aiResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        aiResponse += chunk;

        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'ai', content: aiResponse };
          return copy;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'ai', content: "⚠️ Connection error. Please try again." };
        return copy;
      });
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, messages, activeSessionId, selectedSourceIds]);

  // ===== SOURCE HANDLERS =====

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSessionId) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', activeSessionId);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.source) {
        setSources(prev => [...prev, data.source]);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: `📄 **${data.source.name}** has been uploaded and indexed. You can now ask questions about it!`
        }]);
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading file', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || isUrlAdding || !activeSessionId) return;
    setIsUrlAdding(true);

    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, sessionId: activeSessionId }),
      });
      const data = await res.json();
      if (data.success && data.source) {
        setSources(prev => [...prev, data.source]);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: `🔗 **${data.source.name}** has been fetched and indexed. You can now ask questions about it!`
        }]);
        setUrlInput('');
      } else {
        showToast(data.error || 'Failed to fetch URL', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error fetching URL', 'error');
    } finally {
      setIsUrlAdding(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      setSources(prev => prev.filter(s => s.id !== id));
      setSelectedSourceIds(prev => prev.filter(sId => sId !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // ===== MODAL CLOSE =====
  const closeModal = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setShowTranscript(false);
    setActiveModal(null);
  };

  return (
    <div className={styles.dashboard}>

      {/* ===== LEFT SIDEBAR: History + Sources ===== */}
      <aside className={`${styles.sidebar} ${styles.leftSidebar} ${!leftOpen ? styles.sidebarCollapsed : ''}`}>
        {leftOpen && (
          <>
            <div className={styles.sidebarHeader}>
              <h1>📓 Narrativa</h1>
              <p className={styles.sidebarSubtitle}>Your AI Research Notebook</p>
            </div>

            {/* New Chat Button */}
            <button
              className={styles.newChatButton}
              onClick={handleNewChat}
              disabled={isCreatingSession}
            >
              {isCreatingSession ? <Loader2 size={18} className={styles.spin} /> : <SquarePen size={18} />}
              <span>New Chat</span>
            </button>

            {/* History Section */}
            <div className={styles.historySection}>
              <div className={styles.historySectionTitle}>
                <Clock size={14} />
                <span>History</span>
              </div>
              <div className={styles.historyList}>
                {isLoadingSessions ? (
                  <div className={styles.emptyState}>
                    <Loader2 size={20} className={styles.spin} />
                    <span>Loading...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <MessageSquarePlus size={24} style={{ opacity: 0.3 }} />
                    <span>No conversations yet</span>
                  </div>
                ) : (
                  sessions.map(session => (
                    <div
                      key={session.id}
                      className={`${styles.historyItem} ${session.id === activeSessionId ? styles.historyItemActive : ''}`}
                      onClick={() => loadSession(session.id)}
                    >
                      <div className={styles.historyItemContent}>
                        <span className={styles.historyItemTitle}>{session.title}</span>
                        <span className={styles.historyItemTime}>{formatDate(session.updatedAt)}</span>
                      </div>
                      <button
                        className={styles.historyDeleteButton}
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        title="Delete chat"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ===== Sources Section (within active session) ===== */}
            <div className={styles.sourceSection}>
              <span className={styles.sourceSectionTitle}>Sources ({sources.length})</span>
            </div>

            <div className={styles.sourceList}>
              {sources.map((source, index) => (
                <div key={source.id} className={styles.sourceItem}>
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.includes(source.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedSourceIds(prev => [...prev, source.id]);
                      else setSelectedSourceIds(prev => prev.filter(id => id !== source.id));
                    }}
                    className={styles.sourceCheckbox}
                  />
                  <FileText size={16} className={styles.sourceIcon} />
                  <span className={styles.sourceName}>
                    <span className={styles.sourceLabel}>Source-{index + 1}:</span> {source.name}
                  </span>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDeleteSource(source.id)}
                    title="Remove source"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {sources.length === 0 && !isUploading && (
                <div className={styles.emptyState}>
                  <FileText size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                  <span>No sources yet</span>
                  <span style={{ fontSize: '0.75rem' }}>Upload PDFs or text files</span>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.txt,.md"
              onChange={handleFileChange}
            />

            <div className={styles.addSourceSection}>
              <div className={styles.urlInputWrapper}>
                <input
                  type="url"
                  className={styles.urlInput}
                  placeholder="Paste Youtube or Web Link..."
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddUrl();
                  }}
                  disabled={isUrlAdding || !activeSessionId}
                />
                <button
                  className={styles.urlAddButton}
                  onClick={handleAddUrl}
                  disabled={isUrlAdding || !urlInput.trim() || !activeSessionId}
                  title="Add Link"
                >
                  {isUrlAdding ? <Loader2 size={16} className={styles.spin} /> : <LinkIcon size={16} />}
                </button>
              </div>

              <div className={styles.divider}>
                 <span>OR</span>
              </div>

              <button
                className={styles.uploadButton}
                onClick={handleUploadClick}
                disabled={isUploading || !activeSessionId}
              >
                {isUploading
                  ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Plus size={18} />
                }
                <span>{isUploading ? 'Uploading...' : 'Upload Document'}</span>
              </button>
            </div>
          </>
        )}

        <button
          className={styles.collapseToggle}
          onClick={() => setLeftOpen(!leftOpen)}
          title={leftOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>

      {/* ===== CENTER: Chat ===== */}
      <main className={styles.mainArea}>
        <div className={styles.chatContainer}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.message} ${styles[msg.role]}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className={styles.messageAvatar}>
                {msg.role === 'ai' ? <Sparkles size={16} /> : <User size={16} />}
              </div>
              <div className={styles.messageContent}>
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isSending && messages[messages.length - 1]?.content === '' && (
            <div className={styles.typingIndicator}>
              <span></span><span></span><span></span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className={styles.chatInputWrapper}>
          <div className={styles.chatInputBox}>
            <textarea
              className={styles.textarea}
              placeholder={activeSessionId ? "Ask questions about your sources..." : "Create a new chat to get started..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              disabled={!activeSessionId}
            />
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!input.trim() || isSending || !activeSessionId}
            >
              {isSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </main>

      {/* ===== RIGHT SIDEBAR: Studio + Artifacts + Research ===== */}
      <aside className={`${styles.sidebar} ${styles.rightSidebar} ${!rightOpen ? styles.sidebarCollapsed : ''}`}>
        <button
          className={`${styles.collapseToggle} ${styles.collapseToggleRight}`}
          onClick={() => setRightOpen(!rightOpen)}
          title={rightOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {rightOpen && (
          <>
            <div className={styles.sidebarHeader}>
              <h1>🧰 Studio</h1>
              <p className={styles.sidebarSubtitle}>AI-powered tools</p>
            </div>

            <div className={styles.featureList}>
              {/* --- AUDIO BUTTON --- */}
              <button
                className={styles.featureItem}
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio || selectedSourceIds.length === 0}
                title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Audio"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingAudio ? <Loader2 size={20} className={styles.spin} /> : <Headphones size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Audio Overview</span>
                  <span className={styles.featureDesc}>{isGeneratingAudio ? audioGenerationStatus : 'Listen to sources'}</span>
                </div>
              </button>

              {/* --- SUMMARY BUTTON --- */}
              <button
                className={styles.featureItem}
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary || selectedSourceIds.length === 0}
                title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Summary"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingSummary ? <Loader2 size={20} className={styles.spin} /> : <FileBarChart size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Summary</span>
                  <span className={styles.featureDesc}>{isGeneratingSummary ? 'Generating...' : 'One-page report'}</span>
                </div>
              </button>

              {/* --- SLIDES BUTTON --- */}
              <button
                className={styles.featureItem}
                onClick={handleGenerateSlides}
                disabled={isGeneratingSlides || sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id)).length === 0}
                title={sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id)).length === 0 ? "Select at least one PDF source" : "Generate Slides"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingSlides ? <Loader2 size={20} className={styles.spin} /> : <Presentation size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Slides Generator</span>
                  <span className={styles.featureDesc}>{isGeneratingSlides ? 'Generating...' : 'Turn PDFs into interactive deck'}</span>
                </div>
              </button>
            </div>

            {/* --- RESEARCH REPORT SECTION --- */}
            <div className={styles.researchSection}>
              <div className={styles.researchSectionTitle}>
                <BookOpen size={16} />
                <span>Research Report</span>
              </div>
              <p className={styles.researchDesc}>Search the web for papers and generate a 2-3 page summary report</p>
              <div className={styles.researchInputWrapper}>
                <input
                  type="text"
                  className={styles.researchInput}
                  placeholder="Enter a research topic..."
                  value={reportTopic}
                  onChange={e => setReportTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerateReport();
                  }}
                  disabled={isGeneratingReport || !activeSessionId}
                />
                <button
                  className={styles.researchGenerateButton}
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport || !reportTopic.trim() || !activeSessionId}
                  title="Generate Research Report"
                >
                  {isGeneratingReport ? <Loader2 size={16} className={styles.spin} /> : <Search size={16} />}
                </button>
              </div>
              {isGeneratingReport && (
                <div className={styles.researchStatus}>
                  <Loader2 size={14} className={styles.spin} />
                  <span>Searching papers & generating report...</span>
                </div>
              )}

              {/* Past reports list */}
              {reports.length > 0 && (
                <div className={styles.reportsList}>
                  {reports.map(report => (
                    <button
                      key={report.id}
                      className={styles.reportCard}
                      onClick={() => setActiveModal({ type: 'report', report })}
                    >
                      <BookOpen size={14} />
                      <div className={styles.reportCardInfo}>
                        <span className={styles.reportCardTitle}>{report.topic}</span>
                        <span className={styles.reportCardTime}>
                          {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* --- ARTIFACTS SECTION --- */}
            {artifacts.length > 0 && (
              <div className={styles.artifactsSection}>
                <div className={styles.artifactsSectionTitle}>
                  <Package size={16} />
                  <span>Artifacts ({artifacts.length})</span>
                </div>
                <div className={styles.artifactsList}>
                  {artifacts.map(artifact => (
                    <button
                      key={artifact.id}
                      className={styles.artifactCard}
                      onClick={() => {
                        if (artifact.url || artifact.content) {
                          setActiveModal({ type: artifact.type, artifact });
                        }
                      }}
                    >
                      <div className={styles.artifactIcon}>
                        {artifact.type === 'audio' && <Headphones size={14} />}
                        {artifact.type === 'summary' && <FileBarChart size={14} />}
                        {artifact.type === 'slides' && <Presentation size={14} />}
                      </div>
                      <div className={styles.artifactInfo}>
                        <span className={styles.artifactName}>{artifact.label}</span>
                        <span className={styles.artifactTime}>
                          {new Date(artifact.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </aside>

      {/* ===== AUDIO MODAL ===== */}
      {activeModal?.type === 'audio' && activeModal.artifact?.url && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}>
              <X size={20} />
            </button>
            <h2 className={styles.modalTitle}>
              <Headphones size={22} /> {activeModal.artifact.label}
            </h2>

            <audio ref={audioRef} src={activeModal.artifact.url} preload="metadata" />

            <div className={styles.audioPlayerModal}>
              <button className={styles.playPauseButton} onClick={togglePlayPause}>
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <div className={styles.audioProgress} onClick={handleSeek}>
                <div
                  className={styles.audioProgressFill}
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
              </div>

              <div className={styles.audioTime}>
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>

              <Volume2 size={18} className={styles.volumeIcon} />
            </div>

            {activeModal.artifact.script && (
              <>
                <button
                  className={styles.transcriptToggle}
                  onClick={() => setShowTranscript(!showTranscript)}
                >
                  <span>Transcript</span>
                  {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showTranscript && (
                  <div className={styles.transcriptContent}>
                    {activeModal.artifact.script}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== SUMMARY MODAL ===== */}
      {activeModal?.type === 'summary' && activeModal.artifact?.content && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`${styles.modalContent} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}>
              <X size={20} />
            </button>
            <h2 className={styles.modalTitle}>
              <FileBarChart size={22} /> {activeModal.artifact.label}
            </h2>
            <div className={styles.summaryBody}>
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {activeModal.artifact.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* ===== SLIDES MODAL ===== */}
      {activeModal?.type === 'slides' && activeModal.artifact?.url && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`${styles.modalContent} ${styles.modalFullscreen}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal} title="Close Slides">
              <X size={20} />
            </button>
            
            <div className={styles.iframeHeader}>
              <h2 className={styles.modalTitle} style={{ margin: 0, padding: 0 }}>
                <Presentation size={22} /> {activeModal.artifact.label}
              </h2>
              <span className={styles.iframeHint}>
                Press <strong>F</strong> or double-click to enter Fullscreen
              </span>
            </div>

            <div className={styles.iframeContainer}>
              <iframe 
                src={activeModal.artifact.url} 
                className={styles.slidesIframe} 
                allowFullScreen
                title="Slides Viewer"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== RESEARCH REPORT MODAL ===== */}
      {activeModal?.type === 'report' && activeModal.report && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`${styles.modalContent} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}>
              <X size={20} />
            </button>
            <h2 className={styles.modalTitle}>
              <BookOpen size={22} /> Research Report: {activeModal.report.topic}
            </h2>
            <div className={styles.summaryBody}>
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {activeModal.report.content}
              </ReactMarkdown>
            </div>
            {activeModal.report.papers && activeModal.report.papers.length > 0 && (
              <div className={styles.reportPapers}>
                <h3 className={styles.reportPapersTitle}>Sources Used ({activeModal.report.papers.length} papers)</h3>
                <div className={styles.reportPapersList}>
                  {activeModal.report.papers.map((paper, i) => (
                    <a
                      key={i}
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.reportPaperLink}
                    >
                      <FileText size={14} />
                      <span>{paper.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TOAST NOTIFICATION ===== */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
