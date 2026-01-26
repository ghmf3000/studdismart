import React, { Component, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/Button";
import { FlashcardViewer } from "./components/FlashcardViewer";
import { generateAudio, generateStudySet, StudySet } from "./services/geminiService";
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

/** ---------- Utils ---------- */
const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
};

/** ---------- Error Boundary (prevents blank screen) ---------- */
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
    this.props = props;
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
        ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-500/20"
        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-600 shadow-sm"
    }`}
    type="button"
  >
    <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-white animate-pulse" : "bg-red-500"}`} />
    {isPlaying ? "Playing" : "Listen"}
  </button>
);

const MindmapNodeView: React.FC<{ node: MindmapNode; depth?: number }> = ({
  node,
  depth = 0,
}) => {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const isRoot = depth === 0;
  const hasChildren = !!node.children?.length;
  const hasContent = !!node.content;

  return (
    <div className={`relative transition-all duration-300 ${!isRoot ? "ml-4 md:ml-12 mt-4 md:mt-6" : "flex flex-col items-center"}`}>
      {!isRoot && (
        <>
          <div className="absolute -left-3 md:-left-6 -top-12 md:-top-16 bottom-5 md:bottom-7 w-px bg-slate-200 dark:bg-purple-800" />
          <div className="absolute -left-3 md:-left-6 top-6 md:top-8 w-3 md:w-6 h-px bg-slate-200 dark:bg-purple-800" />
        </>
      )}

      <div
        onClick={() => (hasChildren || hasContent) && setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 md:gap-4 px-4 md:px-8 py-2.5 md:py-4 rounded-none border shadow-md transition-all duration-300 group ${
          (hasChildren || hasContent) ? "cursor-pointer active:scale-[0.98]" : "cursor-default"
        } ${
          isRoot
            ? "bg-purple-600 text-white border-purple-500 shadow-purple-500/20 scale-105 mb-4 md:mb-6"
            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:shadow-purple-500/10"
        }`}
      >
        {isRoot ? (
          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-all duration-300 ${
            isOpen && (hasChildren || hasContent) ? "bg-purple-500 scale-125" : "bg-slate-300 dark:bg-slate-600 group-hover:bg-purple-500"
          }`} />
        )}

        <span className={`whitespace-nowrap ${isRoot ? "font-black text-xs md:text-lg" : "font-bold text-[10px] md:text-sm"}`}>
          {node.label}
        </span>

        {(hasChildren || hasContent) && (
          <div className={`ml-1 md:ml-2 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
             <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-slate-400 group-hover:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
             </svg>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="flex flex-col w-full items-start animate-in fade-in slide-in-from-top-2 duration-300">
          {hasContent && (
             <div className={`${isRoot ? "max-w-2xl text-center mb-10" : "ml-4 md:ml-6 mb-4 max-w-md"} p-3 md:p-4 bg-white/50 dark:bg-slate-800/50 border-l-4 border-purple-500/50 text-[10px] md:text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed shadow-sm`}>
               {node.content}
             </div>
          )}
          
          {hasChildren && node.children!.map((child, i) => (
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

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [tipIndex, setTipIndex] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("studdismart_theme");
    return (
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  const [input, setInput] = useState("");
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [quizCount, setQuizCount] = useState(10);
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
    setIsMobileMenuOpen(false);
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

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setIsAuthLoading(true);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || "Sign-in failed.");
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
        const isGoogle = userCredential.user.providerData.some(p => p.providerId === 'google.com');
        if (!userCredential.user.emailVerified && !isGoogle) {
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
      setAuthError(err.message || "Auth failed.");
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

  const handleGenerate = async (isDifferent = false) => {
    if (!input.trim() && !selectedDoc) return;

    if (user?.tier !== 'pro') {
      const contentKey = hashString(input + (selectedDoc?.name || ""));
      const cachedSet = localStorage.getItem(`studywise_free_cache_${contentKey}`);
      if (cachedSet) {
        const parsed = JSON.parse(cachedSet) as StudySet;
        setCards(parsed.flashcards);
        setQuiz(parsed.quiz);
        setMindmap(parsed.mindmap);
        setView("viewer");
        return;
      }
    }

    setStatus(GenerationStep.PROCESSING);
    setGenerationErrorMessage("");
    try {
      const fcNum = flashcardCount || 10;
      const qNum = quizCount || 10;

      const studySet = await generateStudySet({
        text: input,
        attachment: selectedDoc ? { data: selectedDoc.data, mimeType: selectedDoc.mimeType } : undefined,
        flashcardCount: fcNum,
        quizCount: qNum,
        isDifferentSet: isDifferent 
      });

      if (user?.tier !== 'pro') {
        const contentKey = hashString(input + (selectedDoc?.name || ""));
        localStorage.setItem(`studywise_free_cache_${contentKey}`, JSON.stringify(studySet));
      }

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
      
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }

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
    if (!user) { 
      setAuthMode("signup");
      setShowAuthModal(true); 
      return; 
    }
    localStorage.setItem(`studdismart_pro_${user.id}`, 'true');
    setUser(prev => prev ? { ...prev, tier: 'pro', isSubscribed: true } : prev);
    alert("Welcome to StuddiSmart Pro!");
    setView("home");
  };

  const activeTabColor = useMemo(() => {
    if (activeTab === 'cards') return 'bg-red-600 dark:bg-red-500';
    if (activeTab === 'quiz') return 'bg-blue-600 dark:bg-blue-500';
    if (activeTab === 'mindmap') return 'bg-purple-600 dark:bg-purple-500';
    return 'bg-slate-800 dark:bg-slate-100';
  }, [activeTab]);

  return (
    <div className="flex-grow flex flex-col bg-[#f3f4f6] dark:bg-slate-900 transition-colors">
      <nav className="glass sticky top-0 z-[100] border-b border-slate-200 dark:border-slate-700/50">
        <div className="container-responsive h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-8">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 focus:outline-none"
            >
              <div className={`w-5 h-0.5 bg-slate-900 dark:bg-white transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <div className={`w-5 h-0.5 bg-slate-900 dark:bg-white transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
              <div className={`w-5 h-0.5 bg-slate-900 dark:bg-white transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
            <div className="flex items-center gap-2 cursor-pointer group shrink-0" onClick={() => setView("home")}>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-red-600 rounded-none flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <span className="text-white font-black text-lg md:text-xl">S</span>
              </div>
              <h1 className="text-base md:text-xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center">StuddiSmart<span className="text-red-500">.</span></h1>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button onClick={() => setView("home")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'home' ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Home</button>
              <button onClick={() => setView("about")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'about' ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>About</button>
              <button onClick={() => setView("pricing")} className={`text-[10px] font-black uppercase tracking-widest ${view === 'pricing' ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Pricing</button>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {cards.length > 0 && (
              <button 
                onClick={() => setView("viewer")}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 md:px-5 md:py-2.5 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all hover:bg-red-100"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Current Workspace
              </button>
            )}
            <button onClick={toggleDarkMode} className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center rounded-none bg-[#E7ECF3] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors hover:bg-slate-200">
               {isDarkMode ? "🌙" : "☀️"}
            </button>
            {user ? (
              <div className="group relative">
                <div className="flex items-center gap-2 md:gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 md:px-3 py-1 md:py-1.5 rounded-none cursor-pointer">
                  <div className="w-5 h-5 md:w-6 md:h-6 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-none flex items-center justify-center text-[10px] md:text-xs font-black uppercase">{user.name?.[0]}</div>
                  <span className="hidden sm:inline text-[10px] md:text-xs font-black text-slate-900 dark:text-white">{user.name}</span>
                </div>
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button onClick={() => setView("profile")} className="w-full text-left px-5 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">Identity Settings</button>
                  <button onClick={handleLogout} className="w-full text-left px-5 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Logout</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 md:gap-2">
                <button 
                  onClick={() => { setAuthMode("signin"); setShowAuthModal(true); }}
                  className="px-3 md:px-6 h-8 md:h-11 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[8px] md:text-xs font-black uppercase tracking-wider transition-all hover:bg-slate-50 hover:shadow-sm"
                >
                  LOGIN
                </button>
                <button 
                  onClick={() => { setAuthMode("signup"); setShowAuthModal(true); }}
                  className="px-3 md:px-6 h-8 md:h-11 rounded-full bg-red-600 dark:bg-red-500 text-white text-[8px] md:text-xs font-black uppercase tracking-wider transition-all hover:bg-red-700 shadow-lg shadow-red-500/20"
                >
                  SIGNUP
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Mobile Nav Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-300">
             <div className="flex flex-col p-6 space-y-4">
                <button onClick={() => { setView("home"); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-black uppercase tracking-widest ${view === 'home' ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>Home</button>
                <button onClick={() => { setView("about"); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-black uppercase tracking-widest ${view === 'about' ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>About</button>
                <button onClick={() => { setView("pricing"); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-black uppercase tracking-widest ${view === 'pricing' ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>Pricing</button>
                {cards.length > 0 && (
                  <button onClick={() => { setView("viewer"); setIsMobileMenuOpen(false); }} className="text-left text-xs font-black uppercase tracking-widest text-red-500 border-t border-slate-100 dark:border-slate-800 pt-4">Current Workspace</button>
                )}
             </div>
          </div>
        )}
      </nav>

      <main className="container-responsive flex-grow py-8 md:py-16">
        {view === "home" && (
          <div className="max-w-4xl mx-auto space-y-8 md:space-y-20 animate-content">
            <div className="text-center space-y-4 md:space-y-6">
              <div className="inline-flex px-3 py-1 md:px-4 md:py-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 rounded-none text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] border border-red-100">✨ Automated Academic Synthesis</div>
              <h2 className="text-3xl md:text-6xl font-black tracking-tight leading-[1.1] md:leading-[0.95] text-slate-900 dark:text-white">Learn smarter, <br /> <span className="text-red-500">not harder.</span></h2>
              <div className="space-y-3 md:space-y-4">
                <p className="text-slate-600 dark:text-slate-300 text-sm md:text-xl font-medium max-w-xl mx-auto">
                  Transform documents, PDFs, or research notes into high-performance study material instantly.
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-[10px] md:text-sm font-bold">
                  Free tier: 10 fixed flashcards & quizzes per unique topic.
                </p>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-none p-1.5 md:p-3 shadow-xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
              {status === GenerationStep.PROCESSING && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-300">
                  <div className="w-16 h-16 md:w-24 md:h-24 border-[4px] md:border-[6px] border-red-100 border-t-red-500 rounded-full animate-spin mb-6 md:mb-8" />
                  <p className="text-base md:text-xl font-black text-slate-900 dark:text-white text-center">{STUDY_TIPS[tipIndex]}</p>
                </div>
              )}
              {status === GenerationStep.ERROR && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-6 text-center">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-2 md:mb-4">Synthesis Failed</h3>
                  <p className="text-slate-600 dark:text-slate-400 font-bold mb-6 md:mb-8 text-sm">{generationErrorMessage || "AI system is under high load. Please try again in a moment."}</p>
                  <Button className="h-12 md:h-14 px-8 md:px-10" onClick={() => setStatus(GenerationStep.IDLE)}>Retry Console</Button>
                </div>
              )}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-none p-4 md:p-10 space-y-6 md:space-y-8">
                <textarea className="w-full h-32 md:h-60 bg-transparent outline-none resize-none text-base md:text-2xl font-bold placeholder:text-slate-300 text-slate-900 dark:text-slate-100" placeholder="Type your topic here or upload documents..." value={input} onChange={(e) => setInput(e.target.value)} />
                
                {user?.tier === 'pro' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 py-4 md:py-6 border-t border-slate-200 dark:border-slate-800">
                    <div className="space-y-3 md:space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">Flashcard Count</label>
                        <span className="text-[10px] md:text-xs font-black text-red-500">{flashcardCount}</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="50" 
                        step="5"
                        value={flashcardCount} 
                        onChange={(e) => setFlashcardCount(parseInt(e.target.value))}
                        className="w-full accent-red-600"
                      />
                    </div>
                    <div className="space-y-3 md:space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">Quiz Count</label>
                        <span className="text-[10px] md:text-xs font-black text-red-500">{quizCount}</span>
                      </div>
                      <input 
                        type="range" 
                        min="3" 
                        max="30" 
                        step="3"
                        value={quizCount} 
                        onChange={(e) => setQuizCount(parseInt(e.target.value))}
                        className="w-full accent-red-600"
                      />
                    </div>
                  </div>
                )}

                {selectedDoc && <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 md:p-4 border border-red-500/20 text-xs md:text-sm"><span>{selectedDoc.name}</span><button onClick={() => setSelectedDoc(null)}>✕</button></div>}
                
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 pt-4 md:pt-8 border-t border-slate-200">
                  <Button variant="secondary" className="h-12 md:h-14 px-6 md:px-8 rounded-none" onClick={() => fileInputRef.current?.click()}>Upload</Button>
                  <input type="file" min="5" max="50" step="5" ref={fileInputRef} className="hidden" accept="image/*,application/pdf,text/plain" onChange={handleFileChange} />
                  <div className="flex flex-col sm:flex-row flex-1 gap-2 md:gap-3">
                    <Button className="flex-1 h-12 md:h-14 text-sm md:text-lg rounded-none" onClick={() => handleGenerate(false)}>Generate Study Set</Button>
                    {user?.tier === 'pro' && cards.length > 0 && (
                      <Button variant="outline" className="flex-1 h-12 md:h-14 text-[10px] md:text-xs rounded-none" onClick={() => handleGenerate(true)}>Generate Different Set</Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "viewer" && (
          <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 animate-content">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 md:gap-4">
              <div className="flex bg-white dark:bg-slate-800 p-1 rounded-none shadow-md border border-slate-200 dark:border-slate-700 w-full lg:max-w-lg relative h-10 md:h-14">
                <div className="absolute inset-1 pointer-events-none">
                  <div className={`h-full ${activeTabColor} rounded-none transition-all duration-300 ease-out`} style={{ width: '33.33%', transform: `translateX(${activeTab === 'cards' ? '0%' : activeTab === 'quiz' ? '100%' : '200%'})` }} />
                </div>
                {(["cards", "quiz", "mindmap"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 text-[8px] md:text-[10px] font-black rounded-none relative z-10 uppercase tracking-widest ${activeTab === tab ? "text-white dark:text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>{tab}</button>
                ))}
              </div>
              <Button onClick={() => setView("home")} variant="secondary" className="h-10 md:h-14 px-6 md:px-8 rounded-none text-[10px] md:text-xs">Back to Console</Button>
            </div>
            <div className="min-h-[300px] md:min-h-[450px]">
              {activeTab === "cards" && <FlashcardViewer card={cards[currentIndex]} index={currentIndex} total={cards.length} onPrev={() => setCurrentIndex((p) => Math.max(0, p - 1))} onNext={() => setCurrentIndex((p) => Math.min(cards.length - 1, p + 1))} />}
              {activeTab === "quiz" && (
                <div className="max-w-2xl mx-auto">
                  {isQuizSubmitted ? (
                    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="bg-white dark:bg-slate-800 p-6 md:p-12 border border-slate-200 dark:border-slate-700 shadow-xl border-t-8 border-t-red-600 space-y-8 md:space-y-10">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 pb-6 md:pb-10 border-b border-slate-100 dark:border-slate-700">
                          <div className="text-center md:text-left space-y-2">
                             <div className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] text-red-500">Synthesis Score</div>
                             <h3 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white leading-none">{quizResults.percentage}%</h3>
                             <p className="text-slate-500 dark:text-slate-400 text-xs font-bold">Accuracy Rating Verified</p>
                          </div>
                        </div>
                        <Button className="w-full h-12 md:h-14 bg-red-600 hover:bg-red-700" onClick={() => { setIsQuizSubmitted(false); setQuizIndex(0); setQuizAnswers({}); }}>Reset Checkpoint</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 p-5 md:p-8 border border-slate-200 dark:border-slate-700 shadow-xl border-t-4 border-t-blue-500 space-y-6 md:space-y-8">
                      <div className="text-center space-y-3 md:space-y-4">
                        <div className="text-[8px] md:text-[10px] font-black uppercase text-blue-500 tracking-[0.2em]">Question {quizIndex + 1} of {quiz.length}</div>
                        <h3 className="text-base md:text-xl font-bold text-slate-900 dark:text-white">{quiz[quizIndex]?.question}</h3>
                        <div className="flex justify-center"><ListenButton onListen={() => handleSpeak(quiz[quizIndex]?.question || "", "q")} isPlaying={playingId === "q"} /></div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {quiz[quizIndex]?.options.map((opt, i) => (
                          <button key={i} onClick={() => setQuizAnswers((p) => ({ ...p, [quiz[quizIndex].id]: opt }))} className={`p-3 md:p-4 text-left border font-bold transition-all text-[11px] md:text-sm ${quizAnswers[quiz[quizIndex].id] === opt ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 md:gap-3 pt-4 md:pt-6">
                        <Button variant="secondary" className="flex-1 h-10 md:h-12" onClick={() => setQuizIndex((p) => Math.max(0, p - 1))} disabled={quizIndex === 0}>Prev</Button>
                        {quizIndex === quiz.length - 1 ? (
                          <Button className="flex-[2] h-10 md:h-12 bg-blue-600" onClick={() => setIsQuizSubmitted(true)} disabled={!quizResults.isAllAnswered}>Submit Analysis</Button>
                        ) : (
                          <Button className="flex-[2] h-10 md:h-12 bg-blue-600" onClick={() => setQuizIndex((p) => Math.min(quiz.length - 1, p + 1))}>Next Segment</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === "mindmap" && <div className="bg-white dark:bg-slate-800 p-6 md:p-12 border border-slate-200 dark:border-slate-700 overflow-x-auto border-t-4 border-t-purple-500">{mindmap ? <MindmapNodeView node={mindmap} /> : <div className="text-center py-20 font-black opacity-10 uppercase tracking-widest text-slate-900 dark:text-white">Graph Unavailable</div>}</div>}
            </div>
          </div>
        )}

        {view === "about" && (
          <div className="max-w-5xl mx-auto py-6 md:py-10 space-y-8 md:space-y-12 animate-content">
            <div className="text-center space-y-3 md:space-y-4">
              <h2 className="text-3xl md:text-6xl font-black text-[#1a1f2e] dark:text-white leading-[1.1]">About StuddiSmart</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm md:text-xl font-medium max-w-3xl mx-auto">
                StuddiSmart is an AI-powered learning platform designed to help students and lifelong learners study smarter—not longer.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 md:p-16 shadow-xl border border-slate-100 dark:border-slate-700 space-y-8 md:space-y-12">
              <p className="text-slate-600 dark:text-slate-300 text-sm md:text-lg font-medium">
                With StuddiSmart, you can upload your PDFs, notes, or images and instantly transform them into:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
                <div className="space-y-3 md:space-y-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-[#c2211d] flex items-center justify-center text-white font-black text-lg md:text-xl">FC</div>
                  <h3 className="text-base md:text-lg font-black text-[#1a1f2e] dark:text-white uppercase tracking-tight">Flashcards</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm leading-relaxed">For quick and effective memorization.</p>
                </div>
                <div className="space-y-3 md:space-y-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-[#2b64e0] flex items-center justify-center text-white font-black text-lg md:text-xl">QZ</div>
                  <h3 className="text-base md:text-lg font-black text-[#1a1f2e] dark:text-white uppercase tracking-tight">Quizzes</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm leading-relaxed">To test your understanding and track progress.</p>
                </div>
                <div className="space-y-3 md:space-y-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-[#9c27b0] flex items-center justify-center text-white font-black text-lg md:text-xl">MM</div>
                  <h3 className="text-base md:text-lg font-black text-[#1a1f2e] dark:text-white uppercase tracking-tight">Mindmaps</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm leading-relaxed">To visualize concepts and connect ideas.</p>
                </div>
              </div>
            </div>

            <p className="text-slate-600 dark:text-slate-300 text-sm md:text-lg leading-relaxed max-w-4xl mx-auto">
              We built StuddiSmart for people who want clarity, speed, and confidence in their learning process. Instead of rereading notes or feeling overwhelmed, StuddiSmart helps you actively engage with your material and retain what matters most.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 pt-6 md:pt-10">
              <div className="space-y-4 md:space-y-6">
                <h3 className="text-xl md:text-2xl font-black text-[#c2211d] dark:text-red-500">Our Mission</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                  To make studying more efficient, intuitive, and accessible for everyone—so learning feels less stressful and more empowering.
                </p>
              </div>
              <div className="space-y-4 md:space-y-6">
                <h3 className="text-xl md:text-2xl font-black text-[#1a1f2e] dark:text-white">Who StuddiSmart Is For</h3>
                <ul className="space-y-2 md:space-y-3 text-slate-600 dark:text-slate-400 text-sm md:text-base font-medium">
                  <li className="flex gap-3 items-center"><div className="w-1 h-1 bg-slate-400 rounded-full shrink-0" /> Students preparing for exams or finals</li>
                  <li className="flex gap-3 items-center"><div className="w-1 h-1 bg-slate-400 rounded-full shrink-0" /> Professionals studying for certifications</li>
                  <li className="flex gap-3 items-center"><div className="w-1 h-1 bg-slate-400 rounded-full shrink-0" /> Anyone who wants a smarter way to learn and retain information</li>
                </ul>
              </div>
            </div>

            <div className="bg-[#121826] text-white p-8 md:p-16 relative overflow-hidden">
               <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#c2211d]"></div>
               <div className="space-y-8 md:space-y-12">
                 <h3 className="text-2xl md:text-3xl font-black">Our Approach</h3>
                 <div className="space-y-6 md:space-y-8">
                    <div className="flex gap-4 md:gap-6 items-start">
                       <span className="text-xl md:text-2xl font-black text-[#c2211d]">01</span>
                       <div className="space-y-1">
                          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Adaptive Intelligence</p>
                          <p className="text-base md:text-lg font-bold">AI-powered insights that adapt to your content</p>
                       </div>
                    </div>
                    <div className="flex gap-4 md:gap-6 items-start">
                       <span className="text-xl md:text-2xl font-black text-[#c2211d]">02</span>
                       <div className="space-y-1">
                          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Clean UX</p>
                          <p className="text-base md:text-lg font-bold">Clean, distraction-free design that keeps you focused</p>
                       </div>
                    </div>
                    <div className="flex gap-4 md:gap-6 items-start">
                       <span className="text-xl md:text-2xl font-black text-[#c2211d]">03</span>
                       <div className="space-y-1">
                          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Security First</p>
                          <p className="text-base md:text-lg font-bold">Privacy-minded technology built with modern security practices</p>
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          </div>
        )}

        {view === "pricing" && (
          <div className="max-w-4xl mx-auto py-6 md:py-10 space-y-8 md:space-y-12 animate-content">
            <h2 className="text-3xl md:text-4xl font-black text-center text-slate-900 dark:text-white leading-tight">Select Synthesis Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4 sm:px-0">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 md:p-8 space-y-6 md:space-y-8">
                <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">Free Scholar</h3>
                <div className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">$0</div>
                <ul className="space-y-2 md:space-y-3 text-xs md:text-sm font-medium text-slate-500">
                  <li>• 10 Flashcards per unique topic</li>
                  <li>• 10 Quizzes per unique topic</li>
                </ul>
                <Button variant="secondary" className="w-full cursor-default h-12" disabled>{user?.tier === 'free' ? 'Current Plan' : 'Free Tier'}</Button>
              </div>
              <div className="bg-white dark:bg-slate-800 border-2 border-red-500 p-6 md:p-8 space-y-6 md:space-y-8 shadow-xl md:scale-105">
                <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">Pro Scholar</h3>
                <div className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">$19</div>
                <ul className="space-y-2 md:space-y-3 text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300">
                  <li>• Unlimited flashcards (up to 50/set)</li>
                  <li>• Unlimited quizzes (up to 30/set)</li>
                </ul>
                <Button className="w-full h-12" onClick={() => handleUpgrade('pro')}>{user?.tier === 'pro' ? 'Current Active Pro' : 'Upgrade to Pro'}</Button>
              </div>
            </div>
          </div>
        )}

        {view === "profile" && user && (
          <div className="max-w-xl mx-auto animate-content px-4">
            <div className="bg-white dark:bg-slate-800 p-8 md:p-14 border border-slate-200 dark:border-slate-700 shadow-xl space-y-8 md:space-y-10 border-t-4 border-t-red-500">
              <div className="text-center space-y-4 md:space-y-6">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-red-600 text-white rounded-none flex items-center justify-center text-2xl md:text-3xl font-black mx-auto">{user.name?.[0]}</div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{user.name}</h2>
              </div>
              <div className="space-y-4 md:space-y-6">
                <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} className="w-full px-4 md:px-5 py-3 md:py-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm md:text-base text-slate-900 dark:text-white" />
                <Button className="w-full h-12 md:h-14" onClick={handleUpdateProfile} isLoading={isUpdatingProfile}>Update Identity</Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showAuthModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md p-6 md:p-8 pt-6 space-y-5 md:space-y-6 border border-slate-200 dark:border-slate-700 relative rounded-none shadow-2xl overflow-y-auto max-h-[95vh]">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors z-10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            {authMode !== "verify" && (
              <div className="bg-slate-50 dark:bg-slate-900 p-1 rounded-none border border-slate-200 dark:border-slate-700 flex">
                <button 
                  onClick={() => setAuthMode('signin')} 
                  className={`flex-1 py-2.5 md:py-3 text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${authMode === 'signin' ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm border border-slate-100 dark:border-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  LOGIN
                </button>
                <button 
                  onClick={() => setAuthMode('signup')} 
                  className={`flex-1 py-2.5 md:py-3 text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${authMode === 'signup' ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm border border-slate-100 dark:border-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  SIGNUP
                </button>
              </div>
            )}

            <div className="text-center space-y-1.5 pt-1">
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-[#1a1f2e] dark:text-white leading-none">
                {authMode === "verify" ? "Verify Email" : authMode === "signin" ? "Login" : "Signup"}
              </h3>
              <p className="text-[8px] md:text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">
                {authMode === "signin" ? "Welcome Back" : "Create Account"}
              </p>
            </div>

            {authMode === "verify" ? (
              <div className="space-y-6 text-center">
                <p className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                  Verification protocol sent to <span className="text-red-600 font-bold">{pendingEmail}</span>. Please authorize via your inbox.
                </p>
                <Button className="w-full h-12 md:h-14" onClick={() => setAuthMode("signin")}>Back to Portal</Button>
              </div>
            ) : (
              <div className="space-y-5 md:space-y-6">
                <button 
                  onClick={handleGoogleSignIn} 
                  className="w-full h-12 md:h-14 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-black text-[9px] md:text-[11px] tracking-widest rounded-none shadow-md flex items-center justify-center active:scale-[0.98] outline-none"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6 mr-3 md:mr-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.67-.35-1.39-.35-2.09s.13-1.42.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  CONTINUE WITH GOOGLE
                </button>

                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-slate-700"></div></div>
                  <div className="relative flex justify-center text-[7px] md:text-[9px] uppercase font-black tracking-[0.2em]"><span className="bg-white dark:bg-slate-800 px-3 md:px-4 text-slate-400">OR UTILIZE CREDENTIALS</span></div>
                </div>

                <div className="space-y-3 md:space-y-4">
                  {authMode === "signup" && (
                    <div className="space-y-1.5">
                      <label className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                      <input 
                        type="text" 
                        placeholder="Scholar Name" 
                        value={fullName} 
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-4 md:px-5 py-3 md:py-4 bg-[#f1f5f9] dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 outline-none font-bold rounded-none focus:border-red-500 transition-colors text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400" 
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="name@domain.com" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 md:px-5 py-3 md:py-4 bg-[#f1f5f9] dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 outline-none font-bold rounded-none focus:border-red-500 transition-colors text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 md:px-5 py-3 md:py-4 bg-[#f1f5f9] dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 outline-none font-bold rounded-none focus:border-red-500 transition-colors text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400" 
                    />
                  </div>
                </div>

                {authError && <p className="text-[8px] md:text-[10px] text-red-500 font-black uppercase tracking-widest text-center">{authError}</p>}

                <Button 
                  className="w-full h-12 md:h-14 bg-[#c2211d] hover:bg-red-800 text-white font-black text-[10px] md:text-xs tracking-[0.2em] rounded-xl active:scale-[0.98] transition-all shadow-xl shadow-red-500/10 border-none" 
                  onClick={handleAuth} 
                  isLoading={isAuthLoading}
                >
                  {authMode === "signin" ? "LOGIN" : "SIGNUP"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="container-responsive py-6 md:py-8 opacity-40 text-[7px] md:text-[8px] font-black uppercase tracking-[0.4em] flex justify-between border-t border-slate-200 dark:border-slate-800">
        <p>© 2026 StuddiSmart AI Core</p>
        <div className="flex gap-3 md:gap-4"><button className="text-slate-900 dark:text-white">Privacy</button><button className="text-slate-900 dark:text-white">Terms</button></div>
      </footer>
    </div>
  );
};

const App: React.FC = () => <ErrorBoundary><AppInner /></ErrorBoundary>;
export default App;
