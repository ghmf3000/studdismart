
import React, { Component, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/Button";
import { FlashcardViewer } from "./components/FlashcardViewer";
import { generateAudio, generateStudySet } from "./services/geminiService";
import { Flashcard, GenerationStep, MindmapNode, QuizQuestion, User } from "./types";

// ✅ IMPORTANT: keep this exact import so Firebase Auth is registered via firebase/auth
import { auth, googleProvider } from "./services/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  updateProfile,
  signInWithPopup,
  User as FirebaseUser,
} from "firebase/auth";

/** ---------- Error Boundary (prevents blank screen) ---------- */
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: any;
}

// Fix: Use React.Component explicitly to resolve 'props' type recognition issues in TypeScript class components.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: undefined };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(err: any) {
    console.error("App crashed:", err);
  }

  render() {
    if (this.state.hasError) {
      const message =
        this.state.error instanceof Error
          ? this.state.error.message
          : String(this.state.error || "Unknown error");
      return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none p-8 md:p-14 shadow-2xl">
            <h2 className="text-3xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">Terminal Error</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">The synthesis session encountered an unexpected software conflict.</p>
            <div className="p-5 rounded-none bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono overflow-auto mb-8 max-h-40 text-slate-600 dark:text-slate-400">
              {message}
            </div>
            <Button onClick={() => window.location.reload()} className="w-full h-14 rounded-none">Re-Initialize App</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** ---------- UI helpers ---------- */
const ListenButton: React.FC<{ onListen: () => void; isPlaying: boolean }> = ({
  onListen,
  isPlaying,
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onListen();
    }}
    className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] md:text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
      isPlaying
        ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20"
        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-600 shadow-sm"
    }`}
    type="button"
  >
    <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-white animate-pulse" : "bg-emerald-500"}`} />
    {isPlaying ? "Playing" : "Listen"}
  </button>
);

const FAQItem: React.FC<{ question: string; answer: React.ReactNode }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 last:border-0 transition-colors">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className={`text-sm md:text-base font-bold transition-colors ${isOpen ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300 group-hover:text-emerald-500"}`}>
          {question}
        </span>
        <div className={`shrink-0 w-8 h-8 rounded-none border flex items-center justify-center transition-all ${isOpen ? "bg-emerald-600 border-emerald-600 text-white rotate-45" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 group-hover:border-emerald-500 group-hover:text-emerald-500"}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-96 pb-6 opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="text-sm md:text-base text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          {answer}
        </div>
      </div>
    </div>
  );
};

const MindmapNodeView: React.FC<{ node: MindmapNode; depth?: number }> = ({
  node,
  depth = 0,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isRoot = depth === 0;
  const hasChildren = !!node.children?.length;

  return (
    <div className={`relative transition-all duration-300 ${!isRoot ? "ml-8 md:ml-12 mt-4 md:mt-6" : "flex flex-col items-center"}`}>
      {!isRoot && (
        <>
          <div className="absolute -left-4 md:-left-6 -top-12 md:-top-16 bottom-5 md:bottom-7 w-px bg-slate-200 dark:bg-purple-800" />
          <div className="absolute -left-4 md:-left-6 top-6 md:top-8 w-4 md:w-6 h-px bg-slate-200 dark:bg-purple-800" />
        </>
      )}

      <div
        onClick={() => hasChildren && setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-3 md:gap-4 px-5 md:px-8 py-3 md:py-4 rounded-none border shadow-md transition-all duration-300 group ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        } ${
          isRoot
            ? "bg-purple-600 text-white border-purple-500 shadow-purple-500/20 scale-105 mb-8 md:mb-14"
            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:shadow-purple-500/10"
        }`}
      >
        {isRoot ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isOpen && hasChildren ? "bg-purple-500 scale-125" : "bg-slate-300 dark:bg-slate-600 group-hover:bg-purple-500"
          }`} />
        )}

        <span className={`whitespace-nowrap ${isRoot ? "font-black text-sm md:text-lg" : "font-bold text-xs md:text-sm"}`}>
          {node.label}
        </span>

        {hasChildren && (
          <div className={`ml-2 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
             <svg className="w-3 h-3 text-slate-400 group-hover:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
             </svg>
          </div>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col w-full items-start animate-in fade-in slide-in-from-top-2 duration-300">
          {node.children!.map((child, i) => (
            <MindmapNodeView key={`${child.label}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const STUDY_TIPS = [
  "Extracting core concepts...",
  "Synthesizing high-level logic...",
  "Formatting study materials...",
  "Finalizing interactive modules...",
  "Optimizing for memory retention...",
];

type SelectedDoc = { data: string; mimeType: string; name: string };

const AppInner: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "verify">("signin");
  const [pendingEmail, setPendingEmail] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [tipIndex, setTipIndex] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("studdismart_theme");
    return (
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  const [input, setInput] = useState("");
  const [status, setStatus] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generationErrorMessage, setGenerationErrorMessage] = useState("");

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [mindmap, setMindmap] = useState<MindmapNode | null>(null);

  const [activeTab, setActiveTab] = useState<"cards" | "quiz" | "mindmap">("cards");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);

  const [view, setView] = useState<"home" | "viewer" | "profile" | "pricing" | "about">("home");
  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);

  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");

  const [playingId, setPlayingId] = useState<string | null>(null);

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopAudio = () => {
    const src = audioSourceRef.current;
    if (src) {
      try {
        src.onended = null;
        src.stop(0);
      } catch {}
      audioSourceRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("studdismart_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("studdismart_theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setProfileNameInput("");
        return;
      }
      const isGoogle = firebaseUser.providerData.some(p => p.providerId === 'google.com');
      if (!firebaseUser.emailVerified && !isGoogle) {
        setPendingEmail(firebaseUser.email || "");
        setAuthMode("verify");
        setShowAuthModal(true);
        setUser(null);
        await signOut(auth);
        return;
      }
      const savedProStatus = localStorage.getItem(`studdismart_pro_${firebaseUser.uid}`);
      const newUser: User = {
        id: firebaseUser.uid,
        email: firebaseUser.email || "",
        name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Scholar",
        isSubscribed: !!savedProStatus,
        tier: savedProStatus ? "pro" : "free",
      };
      setUser(newUser);
      setProfileNameInput(newUser.name);
      setShowAuthModal(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (status === GenerationStep.PROCESSING) {
      interval = setInterval(() => {
        setTipIndex((prev) => (prev + 1) % STUDY_TIPS.length);
      }, 2500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status]);

  useEffect(() => {
    stopAudio();
  }, [activeTab, view, quizIndex, currentIndex]);

  const toggleDarkMode = () => setIsDarkMode((v) => !v);

  const resetSession = () => {
    stopAudio();
    setInput("");
    setCards([]);
    setQuiz([]);
    setMindmap(null);
    setQuizAnswers({});
    setIsQuizSubmitted(false);
    setCurrentIndex(0);
    setQuizIndex(0);
    setSelectedDoc(null);
    setStatus(GenerationStep.IDLE);
    setGenerationErrorMessage("");
    setView("home");
    setActiveTab("cards");
  };

  const handleFirebaseError = (err: any) => {
    console.error("Firebase Error:", err);
    if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
      return `Domain Authorization Error: The domain ${window.location.hostname} is not authorized in your Firebase Project. Please add it to Authentication -> Settings -> Authorized Domains in the Firebase Console.`;
    }
    return err?.message || "An unexpected error occurred during the authentication process.";
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setIsAuthLoading(true);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(handleFirebaseError(err));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuth = async () => {
    setAuthError("");
    setIsAuthLoading(true);
    try {
      if (authMode === "signin") {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          setPendingEmail(userCredential.user.email || "");
          setAuthMode("verify");
          await signOut(auth);
        }
        return;
      }
      if (authMode === "signup") {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (fullName.trim()) {
          await updateProfile(userCredential.user, { displayName: fullName.trim() });
        }
        await sendEmailVerification(userCredential.user);
        setPendingEmail(email);
        setAuthMode("verify");
        await signOut(auth);
      }
    } catch (err: any) {
      setAuthError(handleFirebaseError(err));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!auth.currentUser || !profileNameInput.trim()) return;
    setIsUpdatingProfile(true);
    try {
      await updateProfile(auth.currentUser, { displayName: profileNameInput.trim() });
      setUser((u) => (u ? { ...u, name: profileNameInput.trim() } : u));
      alert("Identity Updated.");
    } catch {
      alert("Update failed.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    resetSession();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string | undefined;
      if (!result) return;
      const base64 = result.split(",")[1];
      if (!base64) return;
      setSelectedDoc({ data: base64, mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!input.trim() && !selectedDoc) return;
    setStatus(GenerationStep.PROCESSING);
    setGenerationErrorMessage("");
    try {
      const studySet = await generateStudySet({
        text: input,
        attachment: selectedDoc ? { data: selectedDoc.data, mimeType: selectedDoc.mimeType } : undefined,
      });
      setCards(studySet.flashcards || []);
      setQuiz(studySet.quiz || []);
      setMindmap(studySet.mindmap || null);
      setCurrentIndex(0);
      setQuizIndex(0);
      setQuizAnswers({});
      setIsQuizSubmitted(false);
      setStatus(GenerationStep.COMPLETED);
      setView("viewer");
      setSelectedDoc(null);
    } catch (err: any) {
      console.error("Generation Error:", err);
      setGenerationErrorMessage(err.message || "Synthesis failed. Please try again.");
      setStatus(GenerationStep.ERROR);
    }
  };

  const handleSpeak = async (text: string, id: string) => {
    if (!text?.trim()) return;
    if (playingId === id) { stopAudio(); return; }
    stopAudio();
    setPlayingId(id);
    try {
      const base64Audio = await generateAudio(text);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const raw = atob(base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const buffer = audioCtx.createBuffer(1, pcm16.length, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) channel[i] = pcm16[i] / 32768;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        if (audioSourceRef.current === source) {
          audioSourceRef.current = null;
          setPlayingId(null);
        }
      };
      audioSourceRef.current = source;
      source.start(0);
    } catch { setPlayingId(null); }
  };

  const quizResults = useMemo(() => {
    const total = quiz.length;
    const answeredCount = Object.keys(quizAnswers).length;
    const correctCount = quiz.filter((q) => quizAnswers[q.id] === q.correctAnswer).length;
    return {
      total,
      answeredCount,
      correctCount,
      isAllAnswered: answeredCount === total && total > 0,
      percentage: total > 0 ? Math.round((correctCount / total) * 100) : 0,
    };
  }, [quiz, quizAnswers]);

  const handleUpgrade = (tier: 'pro') => {
    if (!user) { setShowAuthModal(true); return; }
    localStorage.setItem(`studdismart_pro_${user.id}`, 'true');
    setUser(prev => prev ? { ...prev, tier: 'pro', isSubscribed: true } : prev);
    alert("Welcome to StuddiSmart Pro!");
    setView("home");
  };

  const activeTabColor = useMemo(() => {
    if (activeTab === 'cards') return 'bg-emerald-600 dark:bg-emerald-500';
    if (activeTab === 'quiz') return 'bg-blue-600 dark:bg-blue-500';
    if (activeTab === 'mindmap') return 'bg-purple-600 dark:bg-purple-500';
    return 'bg-slate-800 dark:bg-slate-100';
  }, [activeTab]);

  return (
    <div className="flex-grow flex flex-col bg-[#f3f4f6] dark:bg-slate-900 transition-colors">
      <nav className="glass sticky top-0 z-[100] border-b border-slate-200 dark:border-slate-700/50">
        <div className="container-responsive h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex items-center gap-2 cursor-pointer group shrink-0" onClick={resetSession}>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-600 rounded-none flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <span className="text-white font-black text-lg md:text-xl">S</span>
              </div>
              <h1 className="text-lg md:text-xl font-black tracking-tighter hidden xs:block">StuddiSmart<span className="text-emerald-500">.</span></h1>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button onClick={() => setView("home")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'home' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>Home</button>
              <button onClick={() => setView("about")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'about' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>About</button>
              <button onClick={() => setView("pricing")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'pricing' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>Pricing</button>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={toggleDarkMode} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-none bg-[#E7ECF3] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors hover:bg-slate-200">
               {isDarkMode ? "🌙" : "☀️"}
            </button>
            {user ? (
              <div className="group relative">
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-none cursor-pointer">
                  <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-none flex items-center justify-center text-xs font-black uppercase">{user.name?.[0]}</div>
                  <span className="hidden sm:inline text-xs font-black">{user.name}</span>
                </div>
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button onClick={() => setView("profile")} className="w-full text-left px-5 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700">Identity Settings</button>
                  <button onClick={handleLogout} className="w-full text-left px-5 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Logout</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { setAuthMode("signin"); setShowAuthModal(true); }}
                  className="px-6 h-10 md:h-11 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all hover:bg-slate-50 hover:shadow-sm active:scale-95"
                >
                  Login
                </button>
                <button 
                  onClick={() => { setAuthMode("signup"); setShowAuthModal(true); }}
                  className="px-6 h-10 md:h-11 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-[10px] md:text-xs font-black uppercase tracking-wider transition-all hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  Signup
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container-responsive flex-grow py-10 md:py-16">
        {view === "home" && (
          <div className="max-w-4xl mx-auto space-y-10 md:space-y-20 animate-content">
            <div className="text-center space-y-6">
              <div className="inline-flex px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 rounded-none text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] border border-emerald-100">✨ Automated Academic Synthesis</div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95] text-slate-900 dark:text-white">Learn smarter, <br /> <span className="text-emerald-500">not harder.</span></h2>
              <p className="text-slate-500 dark:text-slate-400 text-base md:text-xl font-medium max-w-xl mx-auto">Transform documents, PDFs, or research notes into high-performance study material instantly.</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-none p-2 md:p-3 shadow-xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
              {status === GenerationStep.PROCESSING && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-300">
                  <div className="w-24 h-24 border-[6px] border-emerald-100 border-t-emerald-500 rounded-full animate-spin mb-8" />
                  <p className="text-xl font-black text-slate-900 dark:text-white">{STUDY_TIPS[tipIndex]}</p>
                </div>
              )}
              {status === GenerationStep.ERROR && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-8">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 text-center">Synthesis Failed</h3>
                  <p className="text-slate-600 dark:text-slate-400 font-bold mb-8 text-center">{generationErrorMessage || "AI system is under high load. Please try again in a moment."}</p>
                  <Button className="h-14 px-10" onClick={() => setStatus(GenerationStep.IDLE)}>Retry Console</Button>
                </div>
              )}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-none p-6 md:p-10 space-y-8">
                <textarea className="w-full h-40 md:h-60 bg-transparent outline-none resize-none text-lg md:text-2xl font-bold placeholder:text-slate-300 text-slate-900 dark:text-slate-100" placeholder="Type your topic here or upload documents..." value={input} onChange={(e) => setInput(e.target.value)} />
                {selectedDoc && <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 border border-emerald-500/20"><span>{selectedDoc.name}</span><button onClick={() => setSelectedDoc(null)}>✕</button></div>}
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 pt-8 border-t border-slate-200">
                  <Button variant="secondary" className="h-14 px-8 rounded-none" onClick={() => fileInputRef.current?.click()}>Upload</Button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf,text/plain" onChange={handleFileChange} />
                  <Button className="flex-1 h-14 text-lg rounded-none" onClick={handleGenerate}>Generate Study Set</Button>
                </div>
              </div>
            </div>
            <div className="pt-20 space-y-12">
              <h3 className="text-3xl font-black text-center text-slate-900 dark:text-white">Frequently Asked Questions</h3>
              <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800/50 border border-slate-200 p-4 md:p-8">
                <FAQItem question="What can I upload?" answer="You can upload PDFs, images of notes, or paste text directly. Our AI analyzes these to generate study material." />
                <FAQItem question="Is StuddiSmart free?" answer="We offer a robust free tier for casual learners, and a Pro plan for heavy synthesis needs." />
                <FAQItem question="How accurate is the AI?" answer="Our synthesis is highly accurate but should always be reviewed alongside your primary source material." />
              </div>
            </div>
          </div>
        )}

        {view === "viewer" && (
          <div className="max-w-5xl mx-auto space-y-8 animate-content">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex bg-white dark:bg-slate-800 p-1 rounded-none shadow-md border border-slate-200 w-full lg:max-w-lg relative h-12 md:h-14">
                <div className="absolute inset-1 pointer-events-none">
                  <div className={`h-full ${activeTabColor} rounded-none transition-all duration-300 ease-out`} style={{ width: '33.33%', transform: `translateX(${activeTab === 'cards' ? '0%' : activeTab === 'quiz' ? '100%' : '200%'})` }} />
                </div>
                {(["cards", "quiz", "mindmap"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 text-[10px] font-black rounded-none relative z-10 uppercase tracking-widest ${activeTab === tab ? "text-white dark:text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>{tab}</button>
                ))}
              </div>
              <Button onClick={resetSession} variant="secondary" className="h-12 md:h-14 px-8 rounded-none text-xs">Reset Workspace</Button>
            </div>
            <div className="min-h-[450px]">
              {activeTab === "cards" && <FlashcardViewer card={cards[currentIndex]} index={currentIndex} total={cards.length} onPrev={() => setCurrentIndex((p) => Math.max(0, p - 1))} onNext={() => setCurrentIndex((p) => Math.min(cards.length - 1, p + 1))} />}
              {activeTab === "quiz" && (
                <div className="max-w-xl mx-auto">
                  {isQuizSubmitted ? (
                    <div className="bg-white dark:bg-slate-800 p-10 md:p-14 border border-slate-200 shadow-xl text-center space-y-8">
                      <div className="text-4xl font-black text-blue-500">{quizResults.percentage}%</div>
                      <h3 className="text-xl font-black text-slate-900 dark:text-white">Synthesis Verified</h3>
                      <p className="text-slate-500 font-bold">Identified {quizResults.correctCount} / {quiz.length} patterns correctly.</p>
                      <Button className="w-full h-12" onClick={() => { setIsQuizSubmitted(false); setQuizIndex(0); setQuizAnswers({}); }}>Reset Checkpoint</Button>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 border border-slate-200 shadow-xl border-t-4 border-t-blue-500 space-y-8">
                      <div className="text-center space-y-4">
                        <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{quiz[quizIndex]?.question}</h3>
                        <div className="flex justify-center"><ListenButton onListen={() => handleSpeak(quiz[quizIndex]?.question || "", "q")} isPlaying={playingId === "q"} /></div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {quiz[quizIndex]?.options.map((opt, i) => (
                          <button key={i} onClick={() => setQuizAnswers((p) => ({ ...p, [quiz[quizIndex].id]: opt }))} className={`p-4 text-left border font-bold transition-all text-sm ${quizAnswers[quiz[quizIndex].id] === opt ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "border-slate-200 hover:border-slate-300"}`}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-6">
                        <Button variant="secondary" className="flex-1 h-12" onClick={() => setQuizIndex((p) => Math.max(0, p - 1))} disabled={quizIndex === 0}>Prev</Button>
                        {quizIndex === quiz.length - 1 ? (
                          <Button className="flex-[2] h-12 bg-blue-600" onClick={() => setIsQuizSubmitted(true)} disabled={!quizResults.isAllAnswered}>Submit Analysis</Button>
                        ) : (
                          <Button className="flex-[2] h-12 bg-blue-600" onClick={() => setQuizIndex((p) => Math.min(quiz.length - 1, p + 1))}>Next Segment</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === "mindmap" && <div className="bg-white dark:bg-slate-800 p-8 md:p-12 border border-slate-200 overflow-x-auto border-t-4 border-t-purple-500">{mindmap ? <MindmapNodeView node={mindmap} /> : <div className="text-center py-20 font-black opacity-10 uppercase tracking-widest">Graph Unavailable</div>}</div>}
            </div>
          </div>
        )}

        {view === "pricing" && (
          <div className="max-w-4xl mx-auto py-10 space-y-12 animate-content">
            <h2 className="text-4xl font-black text-center">Select Synthesis Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-800 border p-8 space-y-8"><h3 className="text-xl font-black">Free Scholar</h3><div className="text-4xl font-black">$0</div><Button variant="secondary" className="w-full" onClick={() => setView("home")}>Current Plan</Button></div>
              <div className="bg-white dark:bg-slate-800 border-2 border-emerald-500 p-8 space-y-8"><h3 className="text-xl font-black">Pro Scholar</h3><div className="text-4xl font-black">$19</div><Button className="w-full" onClick={() => handleUpgrade('pro')}>Upgrade</Button></div>
            </div>
          </div>
        )}

        {view === "about" && (
          <div className="max-w-4xl mx-auto space-y-12 py-10 animate-content">
            <div className="text-center space-y-6">
              <div className="inline-flex px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 rounded-none text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] border border-emerald-100">Genesis & Mission</div>
              <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] text-slate-900 dark:text-white">About StuddiSmart</h2>
              <p className="text-slate-500 dark:text-slate-400 text-base md:text-xl font-medium max-w-2xl mx-auto">
                StuddiSmart is an AI-powered learning platform designed to help students and lifelong learners study smarter—not longer.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-8 md:p-12 border border-slate-200 dark:border-slate-700 space-y-8">
              <p className="text-slate-600 dark:text-slate-300 font-medium">With StuddiSmart, you can upload your PDFs, notes, or images and instantly transform them into:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-emerald-600 rounded-none flex items-center justify-center text-white font-black">FC</div>
                  <h4 className="text-lg font-black uppercase">Flashcards</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">For quick and effective memorization.</p>
                </div>
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-none flex items-center justify-center text-white font-black">QZ</div>
                  <h4 className="text-lg font-black uppercase">Quizzes</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">To test your understanding and track progress.</p>
                </div>
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-purple-600 rounded-none flex items-center justify-center text-white font-black">MM</div>
                  <h4 className="text-lg font-black uppercase">Mindmaps</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">To visualize concepts and connect ideas.</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                We built StuddiSmart for people who want clarity, speed, and confidence in their learning process. Instead of rereading notes or feeling overwhelmed, StuddiSmart helps you actively engage with your material and retain what matters most.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-emerald-600">Our Mission</h3>
                <p className="text-slate-600 dark:text-slate-400 font-medium">To make studying more efficient, intuitive, and accessible for everyone—so learning feels less stressful and more empowering.</p>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Who StuddiSmart Is For</h3>
                <ul className="space-y-2 text-slate-600 dark:text-slate-400 font-medium list-disc pl-5">
                  <li>Students preparing for exams or finals</li>
                  <li>Professionals studying for certifications</li>
                  <li>Anyone who wants a smarter way to learn and retain information</li>
                </ul>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-10 md:p-12 space-y-6 border-l-8 border-emerald-500">
               <h3 className="text-2xl font-black">Our Approach</h3>
               <div className="grid grid-cols-1 gap-4">
                 <div className="flex gap-4">
                   <span className="text-emerald-400 font-black">01</span>
                   <p><span className="font-black uppercase tracking-widest text-[10px] block text-slate-500 mb-1">Adaptive Intelligence</span> AI-powered insights that adapt to your content</p>
                 </div>
                 <div className="flex gap-4">
                   <span className="text-emerald-400 font-black">02</span>
                   <p><span className="font-black uppercase tracking-widest text-[10px] block text-slate-500 mb-1">Clean UX</span> Clean, distraction-free design that keeps you focused</p>
                 </div>
                 <div className="flex gap-4">
                   <span className="text-emerald-400 font-black">03</span>
                   <p><span className="font-black uppercase tracking-widest text-[10px] block text-slate-500 mb-1">Security First</span> Privacy-minded technology built with modern security practices</p>
                 </div>
               </div>
            </div>

            <div className="text-center py-10 border-t border-slate-200 dark:border-slate-800 space-y-8">
               <p className="text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto italic">
                 "At StuddiSmart, we believe learning works best when it’s active, visual, and personalized. Our goal is to help you understand more, remember longer, and succeed with confidence."
               </p>
               <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 inline-block shadow-xl">
                 <h4 className="font-black mb-2 uppercase tracking-widest text-xs">📩 Questions or feedback?</h4>
                 <p className="text-lg font-bold">Contact us at <a href="mailto:support@studdismart.com" className="text-emerald-600 hover:underline">support@studdismart.com</a></p>
               </div>
            </div>
          </div>
        )}

        {view === "profile" && user && (
          <div className="max-w-xl mx-auto animate-content">
            <div className="bg-white dark:bg-slate-800 p-10 md:p-14 border border-slate-200 shadow-xl space-y-10 border-t-4 border-t-emerald-500">
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-600 text-white rounded-none flex items-center justify-center text-3xl font-black mx-auto">{user.name?.[0]}</div>
                <h2 className="text-2xl font-black">{user.name}</h2>
              </div>
              <div className="space-y-6">
                <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} className="w-full px-5 py-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 outline-none font-bold" />
                <Button className="w-full h-14" onClick={handleUpdateProfile} isLoading={isUpdatingProfile}>Update Identity</Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showAuthModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md p-10 space-y-8 border border-slate-200 relative animate-in zoom-in-95 rounded-none shadow-2xl">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            
            {authMode === "verify" ? (
              <div className="text-center space-y-6 py-6">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-none flex items-center justify-center mx-auto text-3xl">📧</div>
                <h3 className="text-xl font-black">Confirm Identity</h3>
                <p className="text-slate-500 text-xs">A synthesis link has been transmitted to <span className="font-bold text-emerald-600">{pendingEmail}</span>. Confirm to initialize access.</p>
                <Button className="w-full h-12" onClick={() => setAuthMode("signin")}>Back to Auth</Button>
              </div>
            ) : (
              <>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-none border border-slate-200 dark:border-slate-700 relative h-12">
                  <div 
                    className="absolute inset-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-white dark:bg-slate-800 shadow-sm transition-transform duration-300 ease-out"
                    style={{ transform: `translateX(${authMode === 'signin' ? '0' : '100%'})` }}
                  />
                  <button 
                    onClick={() => setAuthMode('signin')}
                    className={`flex-1 text-[10px] font-black uppercase tracking-[0.2em] relative z-10 transition-colors ${authMode === 'signin' ? 'text-emerald-600' : 'text-slate-400'}`}
                  >
                    Login
                  </button>
                  <button 
                    onClick={() => setAuthMode('signup')}
                    className={`flex-1 text-[10px] font-black uppercase tracking-[0.2em] relative z-10 transition-colors ${authMode === 'signup' ? 'text-emerald-600' : 'text-slate-400'}`}
                  >
                    Signup
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-black tracking-tight">{authMode === "signin" ? "Unlock Terminal" : "Register Identity"}</h3>
                    <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">{authMode === "signin" ? "Initialize Secure Protocol" : "Join the Learning Matrix"}</p>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={handleGoogleSignIn} 
                      disabled={isAuthLoading} 
                      className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>

                    <div className="relative text-center">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-slate-700"></div></div>
                      <span className="relative bg-white dark:bg-slate-800 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">or utilize credentials</span>
                    </div>

                    {authMode === "signup" && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Full Name</label>
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold outline-none focus:ring-2 focus:ring-emerald-500/20" placeholder="Scholar Name" />
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Email Endpoint</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold outline-none focus:ring-2 focus:ring-emerald-500/20" placeholder="name@domain.com" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Access Key</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold outline-none focus:ring-2 focus:ring-emerald-500/20" placeholder="••••••••" />
                    </div>

                    {authError && (
                      <div className="text-[10px] font-black text-red-500 uppercase text-center bg-red-50 dark:bg-red-900/10 p-4 border border-red-100 dark:border-red-900/20 leading-relaxed whitespace-pre-wrap">
                        {authError}
                      </div>
                    )}

                    <Button className="w-full h-14 shadow-lg shadow-emerald-500/10" onClick={handleAuth} isLoading={isAuthLoading}>
                      {authMode === "signin" ? "Unlock Terminal" : "Initialize Access"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="container-responsive py-8 opacity-40 text-[8px] font-black uppercase tracking-[0.4em] flex justify-between border-t border-slate-200">
        <p>© 2026 StuddiSmart AI Core</p>
        <div className="flex gap-4"><button>Privacy</button><button>Terms</button></div>
      </footer>
    </div>
  );
};

const App: React.FC = () => <ErrorBoundary><AppInner /></ErrorBoundary>;
export default App;
