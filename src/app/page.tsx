"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, FileText, Send, Loader2, Sparkles, User, Trash2, Headphones, Play, Pause, Volume2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Presentation, FileBarChart, Link as LinkIcon } from 'lucide-react';
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

type ModalType = 'audio' | 'summary' | 'slides' | null;

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function Home() {
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

  // Audio state
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioGenerationStatus, setAudioGenerationStatus] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioScript, setAudioScript] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Summary state
  // Summary state
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Slides state
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [slideUrl, setSlideUrl] = useState<string | null>(null);
  const [slideError, setSlideError] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sources on mount
  useEffect(() => {
    fetch('/api/sources')
      .then(res => res.json())
      .then(data => {
        if (data.sources) setSources(data.sources);
      })
      .catch(err => console.error("Failed to load sources", err));
  }, []);

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
  }, [audioUrl]);

  const handleGenerateAudio = async () => {
    if (isGeneratingAudio || sources.length === 0) return;

    setIsGeneratingAudio(true);
    setAudioError(null);
    setAudioUrl(null);
    setAudioScript(null);
    setAudioGenerationStatus('Generating script from your sources...');

    try {
      const res = await fetch('/api/generate-audio', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSourceIds })
      });

      if (!res.ok) {
        const data = await res.json();
        setAudioError(data.error || 'Failed to generate audio');
        setIsGeneratingAudio(false);
        setAudioGenerationStatus('');
        return;
      }

      setAudioGenerationStatus('Creating audio...');
      const data = await res.json();

      if (data.success) {
        setAudioUrl(data.audioUrl);
        setAudioScript(data.script);
        setAudioGenerationStatus('');
      } else {
        setAudioError(data.error || 'Audio generation failed');
        setAudioGenerationStatus('');
      }
    } catch (err) {
      console.error('Audio generation error:', err);
      setAudioError('Connection error. Please try again.');
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
    if (isGeneratingSummary || sources.length === 0) return;
    setIsGeneratingSummary(true);
    setSummaryError(null);
    setSummaryContent(null);

    try {
      const res = await fetch('/api/generate-summary', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSourceIds })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSummaryContent(data.summary);
      } else {
        setSummaryError(data.error || 'Failed to generate summary');
      }
    } catch (err) {
      console.error('Summary error:', err);
      setSummaryError('Connection error. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateSlides = async () => {
    // Find the first selected PDF source
    const selectedPdfs = sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id));
    if (isGeneratingSlides || selectedPdfs.length === 0) return;
    
    // Grab the first selected PDF
    const source = selectedPdfs[0];
    
    setIsGeneratingSlides(true);
    setSlideError(null);
    setSlideUrl(null);

    try {
      const res = await fetch('/api/generate-slides', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSlideUrl(data.slideUrl);
      } else {
        setSlideError(data.error || 'Failed to generate slides');
      }
    } catch (err) {
      console.error('Slide generation error:', err);
      setSlideError('Connection error. Please try again.');
    } finally {
      setIsGeneratingSlides(false);
    }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    const userMessage = input.trim();
    setInput('');
    setIsSending(true);

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
        body: JSON.stringify({ messages: updatedMessages, selectedSourceIds }),
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
  }, [input, isSending, messages]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

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
        alert(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || isUrlAdding) return;
    setIsUrlAdding(true);

    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
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
        alert(data.error || 'Failed to fetch URL');
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching URL');
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

  return (
    <div className={styles.dashboard}>

      {/* ===== LEFT SIDEBAR: Sources ===== */}
      <aside className={`${styles.sidebar} ${styles.leftSidebar} ${!leftOpen ? styles.sidebarCollapsed : ''}`}>
        {leftOpen && (
          <>
            <div className={styles.sidebarHeader}>
              <h1>📓 Narrativa</h1>
              <p className={styles.sidebarSubtitle}>Your AI Research Notebook</p>
            </div>

            <div className={styles.sourceSection}>
              <span className={styles.sourceSectionTitle}>Sources ({sources.length})</span>
            </div>

            <div className={styles.sourceList}>
              {sources.map(source => (
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
                  <span className={styles.sourceName}>{source.name}</span>
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
                  disabled={isUrlAdding}
                />
                <button 
                  className={styles.urlAddButton}
                  onClick={handleAddUrl}
                  disabled={isUrlAdding || !urlInput.trim()}
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
                disabled={isUploading}
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
              placeholder="Ask questions about your sources..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
            />
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!input.trim() || isSending}
            >
              {isSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </main>

      {/* ===== RIGHT SIDEBAR: Features ===== */}
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
                className={`${styles.featureItem} ${audioUrl ? styles.successBorder : ''}`}
                onClick={() => {
                  if (audioUrl) {
                    window.open(audioUrl, '_blank');
                  } else {
                    handleGenerateAudio();
                  }
                }}
                disabled={isGeneratingAudio || selectedSourceIds.length === 0}
                title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Audio"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingAudio ? <Loader2 size={20} className={styles.spin} /> : <Headphones size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>{audioUrl ? 'Open Audio' : 'Audio Overview'}</span>
                  <span className={styles.featureDesc}>{audioUrl ? 'Ready to listen' : 'Listen to sources'}</span>
                </div>
              </button>

              {/* --- SUMMARY BUTTON --- */}
              <button
                className={`${styles.featureItem} ${summaryContent ? styles.successBorder : ''}`}
                onClick={() => {
                  if (summaryContent) {
                    // Open summary in a new tab as a blob
                    const blob = new Blob([summaryContent], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                  } else {
                    handleGenerateSummary();
                  }
                }}
                disabled={isGeneratingSummary || selectedSourceIds.length === 0}
                title={selectedSourceIds.length === 0 ? "Select at least one source" : "Generate Summary"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingSummary ? <Loader2 size={20} className={styles.spin} /> : <FileBarChart size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>{summaryContent ? 'View Summary' : 'Summary'}</span>
                  <span className={styles.featureDesc}>{summaryContent ? 'Ready to read' : 'One-page report'}</span>
                </div>
              </button>

              {/* --- SLIDES BUTTON --- */}
              <button
                className={`${styles.featureItem} ${slideUrl ? styles.successBorder : ''}`}
                onClick={() => {
                  if (slideUrl) {
                    window.open(slideUrl, '_blank');
                  } else {
                    handleGenerateSlides();
                  }
                }}
                disabled={isGeneratingSlides || sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id)).length === 0}
                title={sources.filter(s => s.type === 'pdf' && selectedSourceIds.includes(s.id)).length === 0 ? "Select at least one PDF source" : "Generate Slides"}
              >
                <div className={styles.featureIconWrap}>
                  {isGeneratingSlides ? <Loader2 size={20} className={styles.spin} /> : <Presentation size={20} />}
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>{slideUrl ? 'Open Slides' : 'Slides Generator'}</span>
                  <span className={styles.featureDesc}>{slideUrl ? 'Ready to present' : 'Turn PDFs into slides'}</span>
                </div>
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
