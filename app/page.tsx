'use client';

import { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { Loader2, Download, FileText, FileDown, Youtube } from 'lucide-react';
import Markdown from 'react-markdown';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

export default function Home() {
  const [url, setUrl] = useState('');
  const [noteType, setNoteType] = useState('Bullet Points');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = async () => {
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
        
        // Calculate target metrics for dynamic scaling
        // 1 min -> ~80 words (8 lines)
        // 600 mins (10 hrs) -> ~7200 words (14-15 pages)
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
      
      setNotes(header + generatedText);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    
    doc.setFont("helvetica");
    doc.setFontSize(12);

    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 6;
    let y = margin;
    let pageNum = 1;

    const addPageIfNeeded = (heightNeeded: number) => {
      if (y + heightNeeded > pageHeight - 20) { // 20 for footer
        doc.addPage();
        pageNum++;
        y = margin;
      }
    };

    const lines = notes.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      if (line.trim() === '') {
        y += lineHeight;
        addPageIfNeeded(lineHeight);
        continue;
      }

      let isBullet = false;
      let indent = 0;
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        isBullet = true;
        indent = 10;
        line = line.replace(/^[\s]*[-*]\s+/, '');
      }

      let currentX = margin + indent;
      if (isBullet) {
        doc.setFont("helvetica", "normal");
        doc.text("•", margin + 4, y);
      }

      const segments: { text: string; bold: boolean }[] = [];
      const parts = line.split(/(\*\*.*?\*\*)/g);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          segments.push({ text: part.substring(2, part.length - 2), bold: true });
        } else if (part) {
          segments.push({ text: part, bold: false });
        }
      }

      for (const segment of segments) {
        doc.setFont("helvetica", segment.bold ? "bold" : "normal");
        const words = segment.text.split(/(\s+)/);
        
        for (const word of words) {
          if (!word) continue;
          
          if (/^\s+$/.test(word)) {
            if (currentX > margin + indent) {
              currentX += doc.getTextWidth(" ");
            }
            continue;
          }

          const wordWidth = doc.getTextWidth(word);
          if (currentX + wordWidth > pageWidth - margin) {
            y += lineHeight;
            addPageIfNeeded(lineHeight);
            currentX = margin + indent;
          }
          
          doc.text(word, currentX, y);
          currentX += wordWidth;
        }
      }
      y += lineHeight;
      addPageIfNeeded(lineHeight);
    }

    // Add footer with page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const text = `Page ${i} of ${pageCount}`;
      const textWidth = doc.getTextWidth(text);
      doc.text(text, (pageWidth - textWidth) / 2, pageHeight - 10);
    }
    
    doc.save('youtube-notes.pdf');
  };

  const downloadWord = async () => {
    const paragraphs = notes.split('\n').map(line => {
      return new Paragraph({
        children: [new TextRun(line)],
      });
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'youtube-notes.docx');
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-red-100 p-4 rounded-full">
              <Youtube className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900">YouTube Notes Generator</h1>
          <p className="text-neutral-500 text-lg">Turn any YouTube video into structured notes instantly.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">YouTube URL</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-3 rounded-xl border border-neutral-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Note Type</label>
            <select 
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-neutral-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
            >
              <option value="Bullet Points">Bullet Points</option>
              <option value="Textbook">Textbook Style</option>
              <option value="Short Notes">Short Notes</option>
            </select>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={loading || !url}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {loading ? 'Generating Notes...' : 'Generate Notes'}
          </button>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}
        </div>

        {notes && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <h2 className="text-xl font-semibold text-neutral-900">Generated Notes</h2>
              <div className="flex gap-3">
                <button 
                  onClick={downloadPDF}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  PDF
                </button>
                <button 
                  onClick={downloadWord}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Word
                </button>
              </div>
            </div>
            <div className="prose prose-neutral max-w-none">
              <Markdown>{notes}</Markdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
