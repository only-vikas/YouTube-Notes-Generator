'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import Markdown from 'react-markdown';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, orderBy, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

interface Note {
  id: string;
  videoUrl: string;
  videoTitle: string;
  content: string;
  noteType: string;
  createdAt: any;
}

function DashboardContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        router.push('/login');
      } else {
        fetchNotes(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchNotes = async (userId: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users', userId, 'notes'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedNotes: Note[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedNotes.push({ id: docSnap.id, ...docSnap.data() } as Note);
      });
      setNotes(fetchedNotes);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/notes`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', noteId));
      setNotes(notes.filter(n => n.id !== noteId));
      setDeleteModalOpen(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/notes/${noteId}`);
    }
  };

  const downloadPDF = (content: string, title: string) => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(content, 180);
    let y = 15;
    for (let i = 0; i < splitText.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(splitText[i], 15, y);
      y += 7;
    }
    doc.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.pdf`);
  };

  const downloadDOCX = async (content: string, title: string) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: content.split('\n').map(line => new Paragraph({
          children: [new TextRun(line)]
        }))
      }]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.docx`);
  };

  const downloadTXT = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.txt`);
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    // Using a simple visual feedback instead of alert
    const el = document.createElement('div');
    el.textContent = 'Copied to clipboard!';
    el.className = 'fixed bottom-4 right-4 bg-primary text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in-up';
    document.body.appendChild(el);
    setTimeout(() => document.body.removeChild(el), 2000);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-primary animate-pulse flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin">autorenew</span>
          <span className="font-mono">VERIFYING_NEURAL_LINK...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark font-sans text-slate-100 mesh-gradient">
      <header className="fixed top-0 w-full z-50 px-6 py-4">
        <nav className="max-w-7xl mx-auto flex items-center justify-between glass rounded-2xl px-6 py-3 border-white/5">
          <Link href="/" className="flex items-center gap-3">
            <div className="size-10 bg-gradient-to-br from-primary via-accent-magenta to-accent-cyan rounded-xl flex items-center justify-center text-white neon-glow">
              <span className="material-symbols-outlined text-2xl">auto_awesome</span>
            </div>
            <span className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 font-display">NoteOS</span>
          </Link>
          <div className="flex items-center gap-4">
            {isAuthReady && user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400 hidden sm:block">
                  {user.isAnonymous ? 'Guest User' : user.email}
                </span>
                <button 
                  onClick={() => signOut(auth)}
                  className="text-sm font-medium hover:text-white transition-colors text-slate-300"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link href="/login" className="text-sm font-medium hover:text-white transition-colors text-slate-300">Login</Link>
            )}
          </div>
        </nav>
      </header>

      <main className="pt-32 pb-20 px-6 max-w-5xl mx-auto">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 font-display">Note History</h1>
            <p className="text-slate-400">Access and manage your previously generated notes.</p>
          </div>
          <Link href="/" className="bg-primary/10 text-primary hover:bg-primary/20 px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 border border-primary/20">
            <span className="material-symbols-outlined text-sm">add</span>
            New Note
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="text-primary animate-pulse flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin">autorenew</span>
              <span className="font-mono">LOADING_ARCHIVES...</span>
            </div>
          </div>
        ) : notes.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center border border-white/5">
            <div className="size-20 bg-white/5 rounded-full flex items-center justify-center text-slate-500 mx-auto mb-6">
              <span className="material-symbols-outlined text-4xl">inventory_2</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 font-display">No notes found</h3>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">You haven&apos;t generated any notes yet. Head back to the home page to create your first one.</p>
            <Link href="/" className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-all inline-flex items-center gap-2 neon-glow">
              Generate Notes
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {notes.map((note) => (
              <div key={note.id} className="glass rounded-2xl border border-white/5 overflow-hidden transition-all hover:border-white/10">
                <div 
                  className="p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                  onClick={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2.5 py-1 rounded-md bg-white/5 text-xs font-medium text-slate-300 border border-white/10">
                        {note.noteType}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString() : 'Recently'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white truncate font-display">{note.videoTitle}</h3>
                    <p className="text-sm text-slate-400 truncate mt-1">{note.videoUrl}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setExpandedNoteId(expandedNoteId === note.id ? null : note.id); }}
                      className="size-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition-colors"
                    >
                      <span className="material-symbols-outlined">
                        {expandedNoteId === note.id ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setDeleteModalOpen(note.id); }}
                      className="size-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>

                {expandedNoteId === note.id && (
                  <div className="border-t border-white/5 bg-void-black/30">
                    <div className="p-4 border-b border-white/5 flex flex-wrap gap-2 bg-white/5">
                      <button onClick={() => copyToClipboard(note.content)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors">
                        <span className="material-symbols-outlined text-sm">content_copy</span> Copy
                      </button>
                      <button onClick={() => downloadPDF(note.content, note.videoTitle)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors">
                        <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                      </button>
                      <button onClick={() => downloadDOCX(note.content, note.videoTitle)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors">
                        <span className="material-symbols-outlined text-sm">description</span> DOCX
                      </button>
                      <button onClick={() => downloadTXT(note.content, note.videoTitle)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors">
                        <span className="material-symbols-outlined text-sm">text_snippet</span> TXT
                      </button>
                    </div>
                    <div className="p-6 max-h-[500px] overflow-y-auto custom-scrollbar">
                      <div className="prose prose-invert prose-slate max-w-none prose-headings:font-display prose-a:text-primary hover:prose-a:text-primary/80">
                        <Markdown>{note.content}</Markdown>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-3xl p-8 max-w-md w-full border border-white/10 shadow-2xl animate-fade-in-up">
            <div className="size-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-400 mb-6">
              <span className="material-symbols-outlined">warning</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 font-display">Delete Note?</h3>
            <p className="text-slate-400 mb-8">This action cannot be undone. The note will be permanently removed from your history.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeleteModalOpen(null)}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(deleteModalOpen)}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-primary animate-pulse flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin">autorenew</span>
          <span className="font-mono">INITIALIZING_NEURAL_LINK...</span>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
