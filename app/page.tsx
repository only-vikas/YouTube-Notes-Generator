'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleGenAI } from '@google/genai';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import Markdown from 'react-markdown';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [noteType, setNoteType] = useState('Bullet Points');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [isNotesExpanded, setIsNotesExpanded] = useState(true);
  const router = useRouter();
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError('');
    setNotes('');

    try {
      // 1. Fetch transcript from our API
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      const transcript = res.ok ? data.transcript : null;
      const durationMinutes = res.ok ? data.durationMinutes : null;

      // 2. Generate notes using Gemini
      let prompt = '';
      if (transcript) {
        const wordCount = transcript.split(/\s+/).length;
        const estimatedDuration = durationMinutes || (wordCount / 150);
        
        const targetWords = Math.max(80, Math.round(estimatedDuration * 12));
        const targetPages = Math.max(0.2, (targetWords / 500)).toFixed(1);
        const targetSections = Math.max(1, Math.round(estimatedDuration / 5));
        const targetBullets = Math.max(5, Math.round(estimatedDuration * 2.5));
        const targetLines = Math.max(8, Math.round(estimatedDuration * 8));

        let formatInstruction = "";
        if (noteType === "Textbook") {
          formatInstruction = `FORMAT RULES: Textbook Style
- You MUST generate approximately ${targetPages} pages of content (around ${targetWords} words).
- Break the content into at least ${targetSections} detailed chapters/sections.
- Each section must contain multiple paragraphs of deep, comprehensive explanation. Do not summarize too briefly. Expand on every single point mentioned in the transcript.`;
        } else if (noteType === "Bullet Points") {
          formatInstruction = `FORMAT RULES: Bullet Points
- You MUST generate approximately ${targetBullets} detailed bullet points.
- Do not group them too tightly; list every specific fact, idea, and detail mentioned in the video.
- The total length should be around ${targetWords} words.`;
        } else if (noteType === "Short Notes") {
          formatInstruction = `FORMAT RULES: Short Notes
- You MUST generate approximately ${targetLines} lines of summary (around ${Math.round(targetWords * 0.5)} words).
- Provide a brief, dense summary of the key takeaways without fluff.`;
        }

        prompt = `You are an expert note-taker. I will provide you with the transcript of a YouTube video. 

Video Context: The video is approximately ${Math.round(estimatedDuration)} minutes long, and the transcript contains ${wordCount} words.

CRITICAL INSTRUCTION: You must strictly scale the length of your output to match the video's duration. A 1-minute video should yield about 8 lines of textbook notes, while a 10-hour video must yield 12-15 pages.

${formatInstruction}

Transcript:
${transcript}`;
      } else {
        prompt = `You are an expert note-taker. I will provide you with a YouTube video URL. 
The transcript could not be extracted directly (it might be disabled). 
Please use your search capabilities to find information about this video and generate notes in the format of "${noteType}".

CRITICAL INSTRUCTION: You must strictly scale the length of your output to match the video's duration. 
- If the video is 1 minute long, generate about 8 lines of notes.
- If the video is 10 hours long, generate 12-15 pages of notes (around 7000 words).
- Scale proportionally for any length in between.

Video URL: ${url}`;
      }

      let generatedText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            maxOutputTokens: 8192,
          }
        });
        generatedText = response.text || '';
      } catch (geminiError: any) {
        console.warn("Gemini API failed, falling back to Hunter Alpha via OpenRouter...", geminiError);
        
        const openRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || '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';
        
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openrouter/hunter-alpha",
            messages: [
              {
                role: "user",
                content: prompt
              }
            ],
            reasoning: { enabled: true }
          })
        });

        if (!orRes.ok) {
          let errData = {};
          try { errData = await orRes.json(); } catch(e) {}
          throw new Error(`Both Gemini and Fallback API failed. Fallback error: ${(errData as any).error?.message || orRes.statusText}`);
        }

        const orData = await orRes.json();
        generatedText = orData.choices?.[0]?.message?.content || '';
      }
      
      const videoTitle = data.videoTitle || 'Unknown Title';
      const channelName = data.channelName || 'Unknown Channel';
      const downloadedTime = new Date().toLocaleString();

      const header = `Title: ${videoTitle}\nChannel: ${channelName}\nDownloaded: ${downloadedTime}\n\n---\n\n`;
      
      const finalNotes = header + generatedText;
      setNotes(finalNotes);
      setIsNotesExpanded(true);

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      // Save to Firestore silently if user is logged in
      if (user) {
        try {
          const notesRef = collection(db, 'users', user.uid, 'notes');
          await addDoc(notesRef, {
            userId: user.uid,
            videoUrl: url,
            videoTitle: videoTitle,
            content: finalNotes,
            noteType: noteType,
            createdAt: serverTimestamp()
          });
        } catch (saveError) {
          console.error("Failed to save note silently:", saveError);
        }
      }

    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(notes, 180);
    let y = 15;
    for (let i = 0; i < splitText.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(splitText[i], 15, y);
      y += 7;
    }
    doc.save('youtube-notes.pdf');
  };

  const downloadDOCX = async () => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: notes.split('\n').map(line => new Paragraph({
          children: [new TextRun(line)]
        }))
      }]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'youtube-notes.docx');
  };

  const downloadTXT = () => {
    const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'youtube-notes.txt');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(notes);
    alert('Copied to clipboard!');
  };

  return (
    <div className="relative min-h-screen flex flex-col mesh-gradient overflow-x-hidden font-sans text-slate-100">
      <header className="fixed top-0 w-full z-50 px-6 py-4">
        <nav className="max-w-7xl mx-auto flex items-center justify-between glass rounded-2xl px-6 py-3 border-white/5">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-gradient-to-br from-primary via-accent-magenta to-accent-cyan rounded-xl flex items-center justify-center text-white neon-glow">
              <span className="material-symbols-outlined text-2xl">auto_awesome</span>
            </div>
            <span className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 font-display">NoteOS</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a className="hover:text-primary transition-colors" href="#">Features</a>
            <a className="hover:text-primary transition-colors" href="#">Showcase</a>
            <a className="hover:text-primary transition-colors" href="#">Pricing</a>
            <a className="hover:text-primary transition-colors" href="#">API</a>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <Link href="/dashboard" className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all neon-glow">
                My Notes
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium hover:text-white transition-colors">Login</Link>
                <Link href="/login" className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all neon-glow">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="flex-grow pt-32">
        <section className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs font-bold text-primary uppercase tracking-widest">v2.0 Hyper-Engine Active</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-8 leading-[0.9] text-white font-display">
            Hours of Video.<br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent-magenta to-accent-cyan">Seconds of Notes.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-slate-400 text-lg md:text-xl mb-12">
            The intelligence layer for YouTube. Transform any lecture, podcast, or tutorial into high-fidelity knowledge assets instantly.
          </p>

          <form onSubmit={handleGenerate} className="max-w-4xl mx-auto relative group mb-8">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent-cyan rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex flex-col md:flex-row items-center p-2 bg-void-black/80 backdrop-blur-2xl rounded-2xl border border-white/10 gap-2">
              <div className="flex items-center flex-1 w-full">
                <span className="material-symbols-outlined text-slate-500 ml-4">link</span>
                <input 
                  className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-slate-600 px-4 py-4 text-lg outline-none" 
                  placeholder="Paste YouTube link here..." 
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                />
              </div>
              
              <div className="flex w-full md:w-auto gap-2 px-2 md:px-0 pb-2 md:pb-0">
                <select 
                  className="bg-white/5 border border-white/10 text-white rounded-xl px-4 py-4 outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  disabled={loading}
                >
                  <option value="Textbook" className="bg-slate-900">Textbook</option>
                  <option value="Bullet Points" className="bg-slate-900">Bullet Points</option>
                  <option value="Short Notes" className="bg-slate-900">Short Notes</option>
                </select>
                
                <button 
                  type="submit"
                  disabled={loading || !url}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary text-white px-8 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group/btn flex-1 md:flex-none"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate</span>
                      <span className="material-symbols-outlined text-sm group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Results Section */}
          {(error || notes) && (
            <div ref={resultsRef} className="max-w-4xl mx-auto text-left mb-24 scroll-mt-32">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl mb-6 flex items-start gap-3">
                  <span className="material-symbols-outlined shrink-0">error</span>
                  <p>{error}</p>
                </div>
              )}

              {notes && (
                <div className="glass rounded-3xl border border-white/10 overflow-hidden flex flex-col">
                  <div className="bg-white/5 border-b border-white/10 p-4 flex flex-wrap items-center justify-between gap-4">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">description</span>
                      Generated Notes
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-2 hidden sm:flex">
                        <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
                          <span className="material-symbols-outlined text-sm">content_copy</span> Copy
                        </button>
                        <button onClick={downloadPDF} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
                          <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                        </button>
                        <button onClick={downloadDOCX} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
                          <span className="material-symbols-outlined text-sm">description</span> DOCX
                        </button>
                        <button onClick={downloadTXT} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
                          <span className="material-symbols-outlined text-sm">text_snippet</span> TXT
                        </button>
                      </div>
                      <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
                      <button 
                        onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                        className="size-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition-colors"
                        title={isNotesExpanded ? "Collapse Notes" : "Expand Notes"}
                      >
                        <span className="material-symbols-outlined">
                          {isNotesExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>
                  </div>
                  {isNotesExpanded && (
                    <>
                      <div className="p-6 md:p-8 max-h-[600px] overflow-y-auto custom-scrollbar bg-void-black/50">
                        <div className="prose prose-invert prose-slate max-w-none prose-headings:font-display prose-a:text-primary hover:prose-a:text-primary/80">
                          <Markdown>{notes}</Markdown>
                        </div>
                      </div>
                      {!user && (
                        <div className="bg-primary/10 border-t border-primary/20 p-4 flex items-center justify-between">
                          <p className="text-sm text-primary/80 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">info</span>
                            Want to save these notes forever?
                          </p>
                          <Link href="/login" className="text-sm font-bold text-primary hover:text-white transition-colors">
                            Create a free account &rarr;
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-24 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
            <div className="flex overflow-hidden py-10 select-none">
              <div className="flex gap-20 items-center animate-marquee whitespace-nowrap min-w-full">
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">smart_display</span> YouTube
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-accent-cyan">bolt</span> OpenAI
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-accent-magenta">temp_preferences_custom</span> Gemini
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">psychology</span> Anthropic
                </span>
                {/* Duplicate for seamless loop */}
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">smart_display</span> YouTube
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-accent-cyan">bolt</span> OpenAI
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-accent-magenta">temp_preferences_custom</span> Gemini
                </span>
                <span className="text-2xl font-black text-slate-700 flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">psychology</span> Anthropic
                </span>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/50 to-transparent"></div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-32">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold text-white mb-4 font-display">Neural Knowledge Engine</h2>
            <p className="text-slate-400">Everything you need to master any subject in record time.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">
            <div className="md:col-span-8 glass rounded-3xl p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                <span className="material-symbols-outlined text-8xl text-primary">summarize</span>
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className="size-12 bg-primary/20 rounded-xl flex items-center justify-center text-primary mb-6">
                    <span className="material-symbols-outlined">auto_stories</span>
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4 font-display">AI Summarization</h3>
                  <p className="text-slate-400 max-w-md leading-relaxed">Our proprietary LLM stack distills 3-hour podcasts into 5-minute actionable executive summaries. No fluff, just pure insight.</p>
                </div>
                <div className="mt-8 rounded-2xl bg-void-black/40 border border-white/5 p-4 flex gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-2 w-3/4 bg-primary/30 rounded"></div>
                    <div className="h-2 w-1/2 bg-white/10 rounded"></div>
                    <div className="h-2 w-5/6 bg-white/10 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-4 glass rounded-3xl p-8 relative overflow-hidden group bg-gradient-to-br from-primary/5 to-transparent">
              <div className="size-12 bg-accent-cyan/20 rounded-xl flex items-center justify-center text-accent-cyan mb-6">
                <span className="material-symbols-outlined">account_tree</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 font-display">Mindmap Magic</h3>
              <p className="text-slate-400 leading-relaxed mb-8">Visualize complex connections and hierarchical concepts automatically from any video source.</p>
              <div className="aspect-square w-full bg-void-black/30 rounded-2xl border border-white/5 p-4 flex items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-slate-700 animate-pulse">hub</span>
              </div>
            </div>
            <div className="md:col-span-4 glass rounded-3xl p-8 relative overflow-hidden group">
              <div className="size-12 bg-accent-magenta/20 rounded-xl flex items-center justify-center text-accent-magenta mb-6">
                <span className="material-symbols-outlined">quiz</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 font-display">Flashcard Forge</h3>
              <p className="text-slate-400 leading-relaxed">Spaced repetition ready flashcards generated instantly. Perfect for Anki or Quizlet integration.</p>
            </div>
            <div className="md:col-span-8 glass rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row gap-8 items-center bg-gradient-to-bl from-accent-cyan/5 to-transparent">
              <div className="flex-1">
                <div className="size-12 bg-white/10 rounded-xl flex items-center justify-center text-white mb-6">
                  <span className="material-symbols-outlined">chat</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 font-display">Semantic Video Chat</h3>
                <p className="text-slate-400 leading-relaxed">Talk to your videos. Ask questions about specific timestamps and get sourced, accurate answers.</p>
              </div>
              <div className="flex-1 w-full bg-void-black/50 rounded-2xl border border-white/10 p-4 font-mono text-xs text-primary/70">
                &gt; Q: How did he solve the X puzzle?<br/>
                &gt; A: At 12:45, he used the Y-principle...
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-void-black border-t border-white/5 py-20 mt-20 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 p-10 opacity-[0.02] pointer-events-none select-none">
          <span className="text-[20rem] font-black leading-none font-display">NoteOS</span>
        </div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 font-mono relative z-10">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-6">
              <div className="size-6 bg-primary rounded flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-xs">auto_awesome</span>
              </div>
              <span className="text-lg font-bold tracking-tighter text-white font-display">NoteOS</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              SYSTEM_STATUS: <span className="text-primary">OPERATIONAL</span><br/>
              LOCATION: <span className="text-accent-cyan">NEO-TOKYO_GRID</span><br/>
              UPTIME: <span className="text-accent-magenta">99.998%</span>
            </p>
            <div className="text-primary animate-pulse">_</div>
          </div>
          <div>
            <h5 className="text-white font-bold mb-6 text-xs uppercase tracking-widest">{`// NAVIGATION`}</h5>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Feature_Log</a></li>
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Knowledge_Base</a></li>
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Pricing_Plans</a></li>
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> API_Ref</a></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white font-bold mb-6 text-xs uppercase tracking-widest">{`// PROTOCOLS`}</h5>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Data_Privacy</a></li>
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Terms_of_Service</a></li>
              <li><a className="hover:text-primary transition-colors flex items-center gap-2" href="#"><span>&gt;</span> Security_Audit</a></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white font-bold mb-6 text-xs uppercase tracking-widest">{`// CONNECT`}</h5>
            <div className="flex gap-4 mb-6">
              <a className="size-10 glass rounded flex items-center justify-center hover:bg-primary/20 transition-colors" href="#">
                <span className="material-symbols-outlined text-sm">terminal</span>
              </a>
              <a className="size-10 glass rounded flex items-center justify-center hover:bg-primary/20 transition-colors" href="#">
                <span className="material-symbols-outlined text-sm">alternate_email</span>
              </a>
              <a className="size-10 glass rounded flex items-center justify-center hover:bg-primary/20 transition-colors" href="#">
                <span className="material-symbols-outlined text-sm">share</span>
              </a>
            </div>
            <div className="p-4 glass rounded-lg">
              <p className="text-[10px] text-slate-500 mb-2">JOIN THE COLLECTIVE</p>
              <div className="flex gap-2">
                <input className="bg-transparent border-white/10 text-[10px] focus:ring-primary focus:border-primary rounded w-full" placeholder="email@domain.com" type="text"/>
                <button className="bg-white/5 hover:bg-white/10 p-2 rounded transition-colors">
                  <span className="material-symbols-outlined text-sm text-primary">send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-slate-600">
          <p>© 2026 NOTEOS_NEURAL_SYSTEMS. ALL_RIGHTS_RESERVED.</p>
          <div className="flex gap-8">
            <span>BUILD_VERSION: 4.2.0-STABLE</span>
            <span>ENCRYPTION: AES-256-GCM</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
