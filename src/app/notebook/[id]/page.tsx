"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, FileText, Send, Loader2, Sparkles, User, Trash2, Headphones, Play, Pause, Volume2, ChevronDown, ChevronUp, X, Presentation, FileBarChart, Link as LinkIcon, Package, Clock, Search, BookOpen, ArrowLeft } from 'lucide-react';
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

export default function NotebookPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // ===== STATE =====
  const [sessionTitle, setSessionTitle] = useState('Loading...');
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
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  // Generation loading states
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioGenerationStatus, setAudioGenerationStatus] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isGeneratingTopicSlides, setIsGeneratingTopicSlides] = useState(false);
  const [slideTopic, setSlideTopic] = useState('');

  // Research report
  const [reportTopic, setReportTopic] = useState('');
  const [reports, setReports] = useState<ResearchReport[]>([]);

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' | 'info' } | null>(null);
  const [showReportSources, setShowReportSources] = useState(false);

  // Artifacts & Modal state
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ===== LOAD SESSION ON MOUNT =====
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        if (data.session) {
          setSessionTitle(data.session.title || 'Notebook');
          setSources(data.session.sources || []);
          setArtifacts(data.session.artifacts || []);
          setReports(data.session.reports || []);
          if (data.session.messages && data.session.messages.length > 0) {
            setMessages(data.session.messages);
          }
        }
      } catch (err) {
        console.error('Failed to load session', err);
        showToast('Failed to load notebook', 'error');
      }
    })();
  }, [sessionId]);

  // Helper: build label from selected source indices
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => { setDuration(audio.duration); audio.playbackRate = 1.12; };
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
    if (existing) { setActiveModal({ type: 'audio', artifact: existing }); return; }
    setIsGeneratingAudio(true);
    setAudioGenerationStatus('Generating script from your sources...');
    try {
      const res = await fetch('/api/generate-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSourceIds })
      });
      if (!res.ok) { const data = await res.json(); showToast(data.error || 'Failed to generate audio', 'error'); return; }
      setAudioGenerationStatus('Creating audio...');
      const data = await res.json();
      if (data.success) {
        const artifact: Artifact = {
          id: crypto.randomUUID(), type: 'audio', label: `${getSourceLabel(selectedSourceIds)} Audio`,
          sourceIds: [...selectedSourceIds], url: data.audioUrl, script: data.script, timestamp: Date.now(),
        };
        await fetch('/api/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...artifact, sessionId }) });
        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'audio', artifact });
      } else { showToast(data.error || 'Audio generation failed', 'error'); }
    } catch { showToast('Connection error. Please try again.', 'error'); }
    finally { setIsGeneratingAudio(false); setAudioGenerationStatus(''); }
  };

  const togglePlayPause = () => { if (!audioRef.current) return; if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying); };
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => { if (!audioRef.current || !duration) return; const rect = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration; };

  const handleGenerateSummary = async () => {
    if (isGeneratingSummary || selectedSourceIds.length === 0) return;
    const existing = findExistingArtifact('summary', selectedSourceIds);
    if (existing) { setActiveModal({ type: 'summary', artifact: existing }); return; }
    setIsGeneratingSummary(true);
    try {
      const res = await fetch('/api/generate-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedSourceIds }) });
      const data = await res.json();
      if (res.ok && data.success) {
        const artifact: Artifact = { id: crypto.randomUUID(), type: 'summary', label: `${getSourceLabel(selectedSourceIds)} Summary`, sourceIds: [...selectedSourceIds], content: data.summary, timestamp: Date.now() };
        await fetch('/api/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...artifact, sessionId }) });
        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'summary', artifact });
      } else { showToast(data.error || 'Failed to generate summary', 'error'); }
    } catch { showToast('Connection error. Please try again.', 'error'); }
    finally { setIsGeneratingSummary(false); }
  };

  const handleGenerateSlides = async () => {
    if (isGeneratingSlides || selectedSourceIds.length === 0) return;
    const existing = findExistingArtifact('slides', selectedSourceIds);
    if (existing && existing.url) { window.open(existing.url, '_blank'); return; }
    setIsGeneratingSlides(true);
    try {
      const res = await fetch('/api/generate-slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceIds: selectedSourceIds, sessionId }) });
      const data = await res.json();
      if (res.ok && data.success) {
        const artifact: Artifact = { id: crypto.randomUUID(), type: 'slides', label: `${getSourceLabel(selectedSourceIds)} Slides`, sourceIds: [...selectedSourceIds], url: data.slideUrl, timestamp: Date.now() };
        await fetch('/api/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...artifact, sessionId }) });
        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'slides', artifact });
      } else { showToast(data.error || 'Failed to generate slides', 'error'); }
    } catch { showToast('Connection error. Please try again.', 'error'); }
    finally { setIsGeneratingSlides(false); }
  };

  const handleGenerateTopicSlides = async () => {
    if (isGeneratingTopicSlides || !slideTopic.trim()) return;
    setIsGeneratingTopicSlides(true);
    try {
      const res = await fetch('/api/generate-slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: slideTopic, sessionId }) });
      const data = await res.json();
      if (res.ok && data.success) {
        const artifact: Artifact = { id: crypto.randomUUID(), type: 'slides', label: `Topic: ${slideTopic.length > 30 ? slideTopic.substring(0, 27) + '...' : slideTopic}`, sourceIds: [], url: data.slideUrl, timestamp: Date.now() };
        await fetch('/api/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...artifact, sessionId }) });
        setArtifacts(prev => [...prev, artifact]);
        setActiveModal({ type: 'slides', artifact });
        setSlideTopic('');
        showToast('Slides generated from topic!', 'success');
      } else { showToast(data.error || 'Failed to generate slides', 'error'); }
    } catch { showToast('Connection error. Please try again.', 'error'); }
    finally { setIsGeneratingTopicSlides(false); }
  };

  const handleGenerateReport = async () => {
    if (isGeneratingReport || !reportTopic.trim()) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch('/api/generate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: reportTopic, sessionId }) });
      const data = await res.json();
      if (res.ok && data.success) {
        const report: ResearchReport = { id: data.report.id, topic: data.report.topic, content: data.report.content, papers: data.report.papers, createdAt: new Date().toISOString() };
        setReports(prev => [report, ...prev]);
        setActiveModal({ type: 'report', report });
        setReportTopic('');
        showToast('Research report generated!', 'success');
      } else { showToast(data.error || 'Failed to generate report', 'error'); }
    } catch { showToast('Connection error. Please try again.', 'error'); }
    finally { setIsGeneratingReport(false); }
  };

  // ===== CHAT HANDLER =====
  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    const userMessage = input.trim();
    setInput('');
    setIsSending(true);

    // Auto-title on first user message
    if (messages.length <= 1) {
      const title = userMessage.length > 40 ? userMessage.substring(0, 37) + '...' : userMessage;
      fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
        .then(() => setSessionTitle(title)).catch(() => {});
    }

    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    const withPlaceholder: Message[] = [...updatedMessages, { role: 'ai', content: '' }];
    setMessages(withPlaceholder);

    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: updatedMessages, selectedSourceIds, sessionId }) });
      if (!res.ok) {
        const data = await res.json();
        setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'ai', content: `⚠️ Error: ${data.error}` }; return copy; });
        setIsSending(false); return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setIsSending(false); return; }
      let aiResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiResponse += decoder.decode(value, { stream: true });
        setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'ai', content: aiResponse }; return copy; });
      }
    } catch { setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'ai', content: "⚠️ Connection error. Please try again." }; return copy; }); }
    finally { setIsSending(false); }
  }, [input, isSending, messages, sessionId, selectedSourceIds]);

  // ===== SOURCE HANDLERS =====
  const autoNameSession = async (sourceName: string) => {
    if (sessionTitle !== 'New Chat' && sessionTitle !== 'Loading...') return;
    const cleanName = sourceName.replace(/\.(pdf|txt|md)$/i, '').trim();
    const title = cleanName.length > 50 ? cleanName.substring(0, 47) + '...' : cleanName;
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      setSessionTitle(title);
    } catch {}
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.source) {
        const isFirstSource = sources.length === 0;
        setSources(prev => [...prev, data.source]);
        await autoNameSession(data.source.name);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: isFirstSource
            ? `📓 Notebook created: **${data.source.name.replace(/\.(pdf|txt|md)$/i, '')}**. You can now ask questions or use Studio tools.`
            : `📄 **${data.source.name}** has been uploaded and indexed. You can now ask questions about it!`
        }]);
      } else { showToast(data.error || 'Upload failed', 'error'); }
    } catch { showToast('Error uploading file', 'error'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || isUrlAdding) return;
    setIsUrlAdding(true);
    try {
      const res = await fetch('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlInput, sessionId }) });
      const data = await res.json();
      if (data.success && data.source) {
        const isFirstSource = sources.length === 0;
        setSources(prev => [...prev, data.source]);
        await autoNameSession(data.source.name);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: isFirstSource
            ? `📓 Notebook created: **${data.source.name}**. You can now ask questions or use Studio tools.`
            : `🔗 **${data.source.name}** has been fetched and indexed. You can now ask questions about it!`
        }]);
        setUrlInput('');
      } else { showToast(data.error || 'Failed to fetch URL', 'error'); }
    } catch { showToast('Error fetching URL', 'error'); }
    finally { setIsUrlAdding(false); }
  };

  const handleDeleteSource = async (id: string) => {
    try { await fetch(`/api/sources/${id}`, { method: 'DELETE' }); setSources(prev => prev.filter(s => s.id !== id)); setSelectedSourceIds(prev => prev.filter(sId => sId !== id)); } catch {}
  };

  const closeModal = () => { if (audioRef.current) audioRef.current.pause(); setIsPlaying(false); setCurrentTime(0); setDuration(0); setShowTranscript(false); setActiveModal(null); };

  // Keep modal scrolled to top when it opens (avoids showing only the "Sources Used" list)
  useEffect(() => {
    if (activeModal) {
      modalContentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (activeModal.type === 'report') {
        setShowReportSources(false);
      }
    }
  }, [activeModal]);

  return (
    <div className={styles.dashboard}>

      {/* ===== LEFT SIDEBAR: Sources ===== */}
      <aside className={`${styles.sidebar} ${styles.leftSidebar}`}>
        <div className={styles.sidebarHeader}>
          <button className={styles.backButton} onClick={() => router.push('/')} title="Back to notebooks">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className={styles.notebookTitle}>{sessionTitle}</h1>
            <p className={styles.sidebarSubtitle}>Notebook</p>
          </div>
        </div>

        {/* Sources Section */}
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
              <button className={styles.deleteButton} onClick={() => handleDeleteSource(source.id)} title="Remove source">
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

        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.txt,.md" onChange={handleFileChange} />

        <div className={styles.addSourceSection}>
          <div className={styles.urlInputWrapper}>
            <input type="url" className={styles.urlInput} placeholder="Paste Youtube or Web Link..." value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }} disabled={isUrlAdding} />
            <button className={styles.urlAddButton} onClick={handleAddUrl} disabled={isUrlAdding || !urlInput.trim()} title="Add Link">
              {isUrlAdding ? <Loader2 size={16} className={styles.spin} /> : <LinkIcon size={16} />}
            </button>
          </div>
          <div className={styles.divider}><span>OR</span></div>
          <button className={styles.uploadButton} onClick={handleUploadClick} disabled={isUploading}>
            {isUploading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} />}
            <span>{isUploading ? 'Uploading...' : 'Upload Document'}</span>
          </button>
        </div>
      </aside>

      {/* ===== CENTER: Chat ===== */}
      <main className={styles.mainArea}>
        <div className={styles.chatContainer}>
          {messages.map((msg, i) => (
            <div key={i} className={`${styles.message} ${styles[msg.role]}`} style={{ animationDelay: `${i * 0.05}s` }}>
              <div className={styles.messageAvatar}>
                {msg.role === 'ai' ? <Sparkles size={16} /> : <User size={16} />}
              </div>
              <div className={styles.messageContent}>
                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isSending && messages[messages.length - 1]?.content === '' && (
            <div className={styles.typingIndicator}><span></span><span></span><span></span></div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className={styles.chatInputWrapper}>
          <div className={styles.chatInputBox}>
            <textarea className={styles.textarea} placeholder="Ask questions about your sources..."
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1} />
            <button className={styles.sendButton} onClick={handleSend} disabled={!input.trim() || isSending}>
              {isSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </main>

      {/* ===== RIGHT SIDEBAR: Studio + Artifacts ===== */}
      <aside className={`${styles.sidebar} ${styles.rightSidebar}`} style={{ overflowY: 'auto' }}>
        <div className={styles.sidebarHeader}>
          <h1>🧰 Studio</h1>
          <p className={styles.sidebarSubtitle}>AI-powered tools</p>
        </div>

        <div className={styles.featureList}>
          <button className={styles.featureItem} onClick={handleGenerateAudio} disabled={isGeneratingAudio || selectedSourceIds.length === 0}
            title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Audio"}>
            <div className={styles.featureIconWrap}>{isGeneratingAudio ? <Loader2 size={20} className={styles.spin} /> : <Headphones size={20} />}</div>
            <div className={styles.featureInfo}>
              <span className={styles.featureName}>Audio Overview</span>
              <span className={styles.featureDesc}>{isGeneratingAudio ? audioGenerationStatus : 'Listen to sources'}</span>
            </div>
          </button>
          <button className={styles.featureItem} onClick={handleGenerateSummary} disabled={isGeneratingSummary || selectedSourceIds.length === 0}
            title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Summary"}>
            <div className={styles.featureIconWrap}>{isGeneratingSummary ? <Loader2 size={20} className={styles.spin} /> : <FileBarChart size={20} />}</div>
            <div className={styles.featureInfo}>
              <span className={styles.featureName}>Summary</span>
              <span className={styles.featureDesc}>{isGeneratingSummary ? 'Generating...' : 'One-page report'}</span>
            </div>
          </button>
          <button className={styles.featureItem} onClick={handleGenerateSlides} disabled={isGeneratingSlides || selectedSourceIds.length === 0}
            title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Slides"}>
            <div className={styles.featureIconWrap}>{isGeneratingSlides ? <Loader2 size={20} className={styles.spin} /> : <Presentation size={20} />}</div>
            <div className={styles.featureInfo}>
              <span className={styles.featureName}>Slides Generator</span>
              <span className={styles.featureDesc}>{isGeneratingSlides ? 'Generating...' : 'Turn any source into slides'}</span>
            </div>
          </button>
        </div>

        {/* Topic-to-Slides */}
        <div className={styles.researchSection}>
          <div className={styles.researchSectionTitle}><Presentation size={16} /><span>Topic to Slides</span></div>
          <p className={styles.researchDesc}>Generate a full presentation from any topic - no sources needed</p>
          <div className={styles.researchInputWrapper}>
            <input type="text" className={styles.researchInput} placeholder="Enter a topic for slides..." value={slideTopic}
              onChange={e => setSlideTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateTopicSlides(); }}
              disabled={isGeneratingTopicSlides} />
            <button className={styles.researchGenerateButton} onClick={handleGenerateTopicSlides}
              disabled={isGeneratingTopicSlides || !slideTopic.trim()} title="Generate Slides from Topic">
              {isGeneratingTopicSlides ? <Loader2 size={16} className={styles.spin} /> : <Presentation size={16} />}
            </button>
          </div>
        </div>

        {/* Research Report */}
        <div className={styles.researchSection}>
          <div className={styles.researchSectionTitle}><BookOpen size={16} /><span>Research Report</span></div>
          <p className={styles.researchDesc}>Search the web for papers and generate a summary report</p>
          <div className={styles.researchInputWrapper}>
            <input type="text" className={styles.researchInput} placeholder="Enter a research topic..." value={reportTopic}
              onChange={e => setReportTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateReport(); }}
              disabled={isGeneratingReport} />
            <button className={styles.researchGenerateButton} onClick={handleGenerateReport}
              disabled={isGeneratingReport || !reportTopic.trim()} title="Generate Research Report">
              {isGeneratingReport ? <Loader2 size={16} className={styles.spin} /> : <Search size={16} />}
            </button>
          </div>
          {isGeneratingReport && (
            <div className={styles.researchStatus}><Loader2 size={14} className={styles.spin} /><span>Searching papers & generating report...</span></div>
          )}
          {reports.length > 0 && (
            <div className={styles.reportsList}>
              {reports.map(report => (
                <button key={report.id} className={styles.reportCard} onClick={() => setActiveModal({ type: 'report', report })}>
                  <BookOpen size={14} />
                  <div className={styles.reportCardInfo}>
                    <span className={styles.reportCardTitle}>{report.topic}</span>
                    <span className={styles.reportCardTime}>{new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <div className={styles.artifactsSection}>
            <div className={styles.artifactsSectionTitle}><Package size={16} /><span>Artifacts ({artifacts.length})</span></div>
            <div className={styles.artifactsList}>
              {artifacts.map(artifact => (
                <button key={artifact.id} className={styles.artifactCard}
                  onClick={() => { if (artifact.url || artifact.content) setActiveModal({ type: artifact.type, artifact }); }}>
                  <div className={styles.artifactIcon}>
                    {artifact.type === 'audio' && <Headphones size={14} />}
                    {artifact.type === 'summary' && <FileBarChart size={14} />}
                    {artifact.type === 'slides' && <Presentation size={14} />}
                  </div>
                  <div className={styles.artifactInfo}>
                    <span className={styles.artifactName}>{artifact.label}</span>
                    <span className={styles.artifactTime}>{new Date(artifact.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ===== MODALS ===== */}
      {activeModal?.type === 'audio' && activeModal.artifact?.url && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div ref={modalContentRef} className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}><X size={20} /></button>
            <h2 className={styles.modalTitle}><Headphones size={22} /> {activeModal.artifact.label}</h2>
            <audio ref={audioRef} src={activeModal.artifact.url} preload="metadata" />
            <div className={styles.audioPlayerModal}>
              <button className={styles.playPauseButton} onClick={togglePlayPause}>{isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
              <div className={styles.audioProgress} onClick={handleSeek}><div className={styles.audioProgressFill} style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} /></div>
              <div className={styles.audioTime}><span>{formatTime(currentTime)}</span><span>/</span><span>{formatTime(duration)}</span></div>
              <Volume2 size={18} className={styles.volumeIcon} />
            </div>
            {activeModal.artifact.script && (
              <>
                <button className={styles.transcriptToggle} onClick={() => setShowTranscript(!showTranscript)}>
                  <span>Transcript</span>{showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showTranscript && <div className={styles.transcriptContent}>{activeModal.artifact.script}</div>}
              </>
            )}
          </div>
        </div>
      )}

      {activeModal?.type === 'summary' && activeModal.artifact?.content && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div ref={modalContentRef} className={`${styles.modalContent} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}><X size={20} /></button>
            <h2 className={styles.modalTitle}><FileBarChart size={22} /> {activeModal.artifact.label}</h2>
            <div className={styles.summaryBody}>
              <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{activeModal.artifact.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {activeModal?.type === 'slides' && activeModal.artifact?.url && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div ref={modalContentRef} className={`${styles.modalContent} ${styles.modalFullscreen}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal} title="Close Slides"><X size={20} /></button>
            <div className={styles.iframeHeader}>
              <h2 className={styles.modalTitle} style={{ margin: 0, padding: 0 }}><Presentation size={22} /> {activeModal.artifact.label}</h2>
              <span className={styles.iframeHint}>Press <strong>F</strong> or double-click to enter Fullscreen</span>
            </div>
            <div className={styles.iframeContainer}>
              <iframe src={activeModal.artifact.url} className={styles.slidesIframe} allowFullScreen title="Slides Viewer" />
            </div>
          </div>
        </div>
      )}

      {activeModal?.type === 'report' && activeModal.report && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div ref={modalContentRef} className={`${styles.modalContent} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}><X size={20} /></button>
            <h2 className={styles.modalTitle}><BookOpen size={22} /> Research Report: {activeModal.report.topic}</h2>
            <div className={styles.summaryBody}>
              <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{activeModal.report.content}</ReactMarkdown>
            </div>
            {activeModal.report.papers && activeModal.report.papers.length > 0 && (
              <div className={styles.reportPapers}>
                <button type="button" className={styles.reportPapersHeader} onClick={() => setShowReportSources(prev => !prev)}>
                  <span>Sources Used ({activeModal.report.papers.length} papers)</span>
                  {showReportSources ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showReportSources && (
                  <div className={styles.reportPapersList}>
                    {activeModal.report.papers.map((paper, i) => (
                      <div key={i} className={styles.reportPaperLink} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <a href={paper.url} target="_blank" rel="noopener noreferrer"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit' }}>
                          <FileText size={14} /><span>{paper.title}</span>
                        </a>
                        <button className={styles.urlAddButton} style={{ flexShrink: 0, width: '28px', height: '28px', padding: '4px', borderRadius: '6px' }}
                          title="Add to Sources"
                          onClick={async (e) => {
                            e.preventDefault();
                            if (!paper.url) return;
                            const btn = e.currentTarget; btn.disabled = true; btn.textContent = '...';
                            try {
                              const res = await fetch('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: paper.url, sessionId }) });
                              const data = await res.json();
                              if (data.success && data.source) { setSources(prev => [...prev, data.source]); showToast(`Added "${paper.title}" to sources`, 'success'); btn.textContent = '✓'; }
                              else { showToast(data.error || 'Failed to add source', 'error'); btn.textContent = '+'; btn.disabled = false; }
                            } catch { showToast('Failed to add source', 'error'); btn.textContent = '+'; btn.disabled = false; }
                          }}>
                          <Plus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
