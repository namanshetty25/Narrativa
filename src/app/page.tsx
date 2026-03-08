"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, FileText, Send, Loader2, Sparkles, User, Trash2, Headphones, Play, Pause, Volume2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Presentation, FileBarChart } from 'lucide-react';
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

type ModalType = 'audio' | 'summary' | null;

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
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
      const res = await fetch('/api/generate-audio', { method: 'POST' });

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
      const res = await fetch('/api/generate-summary', { method: 'POST' });
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
        body: JSON.stringify({ messages: updatedMessages }),
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

  const handleDeleteSource = async (id: string) => {
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      setSources(prev => prev.filter(s => s.id !== id));
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

            <button
              className={styles.uploadButton}
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading
                ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                : <Plus size={18} />
              }
              <span>{isUploading ? 'Uploading...' : 'Add Source'}</span>
            </button>
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
              <button
                className={`${styles.featureItem} ${activeModal === 'audio' ? styles.featureItemActive : ''}`}
                onClick={() => setActiveModal('audio')}
              >
                <div className={styles.featureIconWrap}>
                  <Headphones size={20} />
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Audio Overview</span>
                  <span className={styles.featureDesc}>Listen to your sources</span>
                </div>
              </button>

              <button
                className={`${styles.featureItem} ${activeModal === 'summary' ? styles.featureItemActive : ''}`}
                onClick={() => setActiveModal('summary')}
              >
                <div className={styles.featureIconWrap}>
                  <FileBarChart size={20} />
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Summary</span>
                  <span className={styles.featureDesc}>One-page report</span>
                </div>
              </button>

              <button className={`${styles.featureItem} ${styles.featureItemDisabled}`} disabled>
                <div className={styles.featureIconWrap}>
                  <Presentation size={20} />
                </div>
                <div className={styles.featureInfo}>
                  <span className={styles.featureName}>Slides Generator</span>
                  <span className={styles.featureDesc}>Coming soon</span>
                </div>
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ===== MODAL: Audio Overview ===== */}
      {activeModal === 'audio' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <Headphones size={20} />
                <span>Audio Overview</span>
              </div>
              <button className={styles.modalClose} onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Generate button */}
              {!audioUrl && !isGeneratingAudio && (
                <button
                  className={styles.generateAudioButton}
                  onClick={handleGenerateAudio}
                  disabled={sources.length === 0}
                  title={sources.length === 0 ? 'Upload sources first' : 'Generate audio explanation'}
                >
                  <Headphones size={18} />
                  <span>Generate Audio Overview</span>
                </button>
              )}

              {/* Loading state */}
              {isGeneratingAudio && (
                <div className={styles.audioGenerating}>
                  <div className={styles.audioGeneratingPulse}>
                    <Loader2 size={24} className={styles.spinIcon} />
                  </div>
                  <span className={styles.audioGeneratingText}>{audioGenerationStatus}</span>
                </div>
              )}

              {/* Error state */}
              {audioError && (
                <div className={styles.audioError}>
                  <span>⚠️ {audioError}</span>
                  <button className={styles.audioRetryButton} onClick={handleGenerateAudio}>
                    Retry
                  </button>
                </div>
              )}

              {/* Audio Player */}
              {audioUrl && (
                <div className={styles.audioPlayer}>
                  <audio ref={audioRef} src={audioUrl} preload="metadata" />

                  <div className={styles.audioControls}>
                    <button className={styles.playPauseButton} onClick={togglePlayPause}>
                      {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                    </button>

                    <div className={styles.audioProgress}>
                      <div className={styles.progressBar} onClick={handleSeek}>
                        <div
                          className={styles.progressFilled}
                          style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                        />
                        <div
                          className={styles.progressThumb}
                          style={{ left: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                        />
                      </div>
                      <div className={styles.audioTime}>
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>

                    <Volume2 size={16} className={styles.volumeIcon} />
                  </div>

                  <button
                    className={styles.transcriptToggle}
                    onClick={() => setShowTranscript(!showTranscript)}
                  >
                    <span>Transcript</span>
                    {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showTranscript && audioScript && (
                    <div className={styles.transcriptContent}>
                      {audioScript}
                    </div>
                  )}

                  <button
                    className={styles.regenerateButton}
                    onClick={handleGenerateAudio}
                    disabled={isGeneratingAudio}
                  >
                    Regenerate
                  </button>
                </div>
              )}

              {sources.length === 0 && !audioUrl && !isGeneratingAudio && (
                <p className={styles.modalHint}>Upload at least one source document to generate an audio overview.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: Summary ===== */}
      {activeModal === 'summary' && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={`${styles.modalContent} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <FileBarChart size={20} />
                <span>Summary Report</span>
              </div>
              <button className={styles.modalClose} onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Generate button */}
              {!summaryContent && !isGeneratingSummary && (
                <button
                  className={styles.generateAudioButton}
                  onClick={handleGenerateSummary}
                  disabled={sources.length === 0}
                >
                  <FileBarChart size={18} />
                  <span>Generate Summary</span>
                </button>
              )}

              {/* Loading */}
              {isGeneratingSummary && (
                <div className={styles.audioGenerating}>
                  <div className={styles.audioGeneratingPulse}>
                    <Loader2 size={24} className={styles.spinIcon} />
                  </div>
                  <span className={styles.audioGeneratingText}>Generating summary report...</span>
                </div>
              )}

              {/* Error */}
              {summaryError && (
                <div className={styles.audioError}>
                  <span>⚠️ {summaryError}</span>
                  <button className={styles.audioRetryButton} onClick={handleGenerateSummary}>Retry</button>
                </div>
              )}

              {/* Summary content */}
              {summaryContent && (
                <div className={styles.summaryReport}>
                  <div className={styles.summaryBody}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {summaryContent}
                    </ReactMarkdown>
                  </div>
                  <button
                    className={styles.regenerateButton}
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                  >
                    Regenerate
                  </button>
                </div>
              )}

              {sources.length === 0 && !summaryContent && !isGeneratingSummary && (
                <p className={styles.modalHint}>Upload at least one source document to generate a summary.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
