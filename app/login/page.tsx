'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get('url');
  
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigateToDashboard = () => {
    if (targetUrl) {
      router.push(`/dashboard?url=${encodeURIComponent(targetUrl)}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError('');
      await signInWithPopup(auth, googleProvider);
      navigateToDashboard();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup, this is normal behavior, don't show an error
        return;
      }
      console.error('Google sign in error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError('');
      await signInAnonymously(auth);
      navigateToDashboard();
    } catch (err: any) {
      if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
        setError('Anonymous sign-in is disabled. Please enable it in the Firebase Console.');
      } else {
        console.error('Guest sign in error:', err);
        setError(err.message || 'Failed to sign in as guest');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter an email address');
      return;
    }
    setError('Magic link functionality is coming soon. Please use Google or Guest login.');
  };
  return (
    <div className="relative min-h-screen bg-background-dark font-sans text-slate-100 overflow-hidden">
      {/* Infinite Data Stream Background */}
      <div className="fixed inset-0 data-stream-bg -z-10">
        <div className="absolute inset-0 opacity-20">
          {/* Simulated data particles/lines via CSS gradients */}
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-primary to-transparent opacity-50"></div>
          <div className="absolute top-0 left-2/4 w-px h-full bg-gradient-to-b from-transparent via-accent-cyan to-transparent opacity-30"></div>
          <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-primary to-transparent opacity-50"></div>
          
          {/* Floating Elements Representation */}
          <div className="absolute top-20 left-10 w-32 h-20 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center justify-center rotate-12">
            <span className="material-symbols-outlined text-red-500">play_circle</span>
          </div>
          <div className="absolute bottom-40 right-20 w-28 h-36 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center -rotate-6">
            <span className="material-symbols-outlined text-primary">description</span>
          </div>
          <div className="absolute top-1/2 right-1/4 w-24 h-16 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center rotate-45">
            <span className="material-symbols-outlined text-accent-cyan">smart_display</span>
          </div>
        </div>
        <div className="refraction-layer"></div>
      </div>

      {/* Main Navigation Overlay */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white neon-pulse">
            <span className="material-symbols-outlined">psychology</span>
          </div>
          <span className="text-xl font-bold tracking-tighter text-white font-display">NoteOS</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">System Status: Online</span>
          <div className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse shadow-[0_0_8px_#06b6d4]"></div>
        </div>
      </header>

      {/* Center Login Card */}
      <main className="relative h-screen flex items-center justify-center p-4">
        <div className="glass-morphism w-full max-w-md p-10 rounded-3xl relative overflow-hidden">
          {/* Decorative Inner Glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-accent-cyan/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 text-center">
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight font-display">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-cyan">NoteOS</span>
            </h1>
            <p className="text-slate-400 text-sm mb-10">Neural Knowledge Interface v2.4.0</p>
            
            <div className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs p-3 rounded-lg text-left">
                  {error}
                </div>
              )}
              
              {/* Google Button */}
              <button 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full h-12 flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 group overflow-hidden relative disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOTR9oydLLUFDxJxmnQfrYeGTbrzwEsWGxNJVZpMaH6ia9uCcTLs3zQ-Ke0br9O1-8YmZt_XxobpsB1JvI_njXzWw7hxG7It8sF_9uRy4Kea8mtB9088jOKiDUBKDaEf4-R0s1HLelUnTZ7pNw16g6b6E4dRlqlWrU-_U-O4O6lBWmPZ2sdolVmXpHqUys0iy_NkkvcXV4pnKv0I_mNBqLFzcW08m_GNvOdInHeSv93_5S_s4Vz-yhCGbm74ZY1QHEI2QcIJTcXAiz" alt="Google G Logo" width={20} height={20} />
                <span>{isLoading ? 'Connecting...' : 'Continue with Google'}</span>
                <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>
              
              <div className="flex items-center gap-4 my-6">
                <div className="h-px grow bg-slate-700/50"></div>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">or magic link</span>
                <div className="h-px grow bg-slate-700/50"></div>
              </div>
              
              {/* Email Input */}
              <form onSubmit={handleMagicLink} className="relative group">
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 bg-background-dark/50 border border-slate-700/50 rounded-xl px-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-primary/50 transition-colors" 
                  placeholder="neural-address@network.com" 
                  disabled={isLoading}
                />
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2 top-2 h-8 w-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center text-white transition-all transform hover:rotate-12 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </form>
              
              <div className="pt-4">
                <button 
                  onClick={handleGuestSignIn}
                  disabled={isLoading}
                  className="text-slate-500 hover:text-primary text-sm transition-colors flex items-center justify-center gap-1 group w-full disabled:opacity-50"
                >
                  Continue as Guest
                  <span className="material-symbols-outlined text-xs group-hover:translate-x-1 transition-transform">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Progress Bar Section */}
            <div className="mt-12 text-left">
              <div className="flex justify-between items-end mb-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-primary font-bold uppercase tracking-tighter">Phase 1 Connection</span>
                  <span className="text-sm text-slate-300 font-medium">AI scanning your brain...</span>
                </div>
                <span className="text-xs font-mono text-primary">65%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
                <div className="h-full bg-gradient-to-r from-primary via-accent-cyan to-primary bg-[length:200%_100%] rounded-full" style={{ width: '65%' }}></div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-mono">Synaptic mapping in progress: MEM_FRAGMENT_0492</p>
            </div>
          </div>
        </div>
      </main>

      {/* Corner Live Demo Widget (Bottom Right) */}
      <div className="fixed bottom-6 right-6 w-64 glass-morphism p-4 rounded-2xl border-l-2 border-l-accent-cyan hidden md:block z-50">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-accent-cyan text-sm">bolt</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Note Generation</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 bg-slate-700/30 rounded animate-pulse"></div>
          <div className="h-3 w-full bg-slate-700/30 rounded animate-pulse"></div>
          <div className="h-3 w-1/2 bg-slate-700/30 rounded animate-pulse"></div>
          <div className="flex items-center gap-2 pt-1">
            <div className="size-4 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[10px] text-primary">auto_awesome</span>
            </div>
            <span className="text-[9px] text-slate-500 italic">Synthesizing 24h of YouTube history...</span>
          </div>
        </div>
      </div>

      {/* Corner Connectivity Stats (Bottom Left) */}
      <div className="fixed bottom-6 left-6 flex flex-col gap-1 text-[10px] font-mono text-slate-600 hidden lg:block z-50">
        <div className="flex items-center gap-2">
          <span className="text-accent-cyan">LATENCY:</span>
          <span>4ms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-primary">NEURAL:</span>
          <span>ENCRYPTED</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">LOCATION:</span>
          <span>San Francisco Hub</span>
        </div>
      </div>

      {/* Multi-layer refraction overlays */}
      <div className="fixed inset-0 pointer-events-none border-[30px] border-background-dark/40 z-40"></div>
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(10,5,12,0.4)_100%)] z-30"></div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-primary animate-pulse flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin">autorenew</span>
          <span className="font-mono">INITIALIZING_NEURAL_LINK...</span>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
