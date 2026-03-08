"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, FileText, Send, Loader2, Sparkles, User, Trash2, Link as LinkIcon } from 'lucide-react';
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
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.dashboard}>

      {/* Sidebar: Sources */}
      <aside className={styles.sidebar}>
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
              ? <Loader2 size={18} className={styles.spin} />
              : <Plus size={18} />
            }
            <span>{isUploading ? 'Uploading...' : 'Upload Document'}</span>
          </button>
        </div>
      </aside>

      {/* Main Area: Chat */}
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
    </div>
  );
}
