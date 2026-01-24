// App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/Button";
import { FlashcardViewer } from "./components/FlashcardViewer";
import { generateAudio, generateStudySet } from "./services/geminiService";
import { Flashcard, GenerationStep, MindmapNode, QuizQuestion, User } from "./types";

// ✅ IMPORTANT: keep this exact import so Firebase Auth is registered via firebase/auth
import { auth } from "./services/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  updateProfile,
  User as FirebaseUser,
} from "firebase/auth";

/** ---------- Error Boundary (prevents blank screen) ---------- */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: unknown }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", err);
  }
  render() {
    if (this.state.hasError) {
      const message =
        this.state.error instanceof Error
          ? this.state.error.message
          : String(this.state.error || "Unknown error");
      return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none p-8 md:p-14 shadow-2xl">
            <h2 className="text-3xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">Terminal Error</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">The synthesis session encountered an unexpected hardware/software conflict.</p>
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
          <div className="absolute -left-4 md:-left-6 -top-12 md:-top-16 bottom-5 md:bottom-7 w-px bg-slate-200 dark:bg-emerald-800" />
          <div className="absolute -left-4 md:-left-6 top-6 md:top-8 w-4 md:w-6 h-px bg-slate-200 dark:bg-emerald-800" />
        </>
      )}

      <div
        onClick={() => hasChildren && setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-3 md:gap-4 px-5 md:px-8 py-3 md:py-4 rounded-none border shadow-md transition-all duration-300 group ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        } ${
          isRoot
            ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20 scale-105 mb-8 md:mb-14"
            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:shadow-emerald-500/10"
        }`}
      >
        {isRoot ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isOpen && hasChildren ? "bg-emerald-500 scale-125" : "bg-slate-300 dark:bg-slate-600 group-hover:bg-emerald-500"
          }`} />
        )}

        <span className={`whitespace-nowrap ${isRoot ? "font-black text-sm md:text-lg" : "font-bold text-xs md:text-sm"}`}>
          {node.label}
        </span>

        {hasChildren && (
          <div className={`ml-2 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
             <svg className="w-3 h-3 text-slate-400 group-hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      if (!firebaseUser.emailVerified) {
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
    return () => {
      if (interval) clearInterval(interval);
    };
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
    setView("home");
    setActiveTab("cards");
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Auth sequence failed.";
      setAuthError(message);
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
      alert("Profile Identity Updated.");
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
    if (!user) {
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }
    if (!input.trim() && !selectedDoc) return;

    setStatus(GenerationStep.PROCESSING);

    try {
      const studySet = await generateStudySet({
        text: input,
        attachment: selectedDoc
          ? { data: selectedDoc.data, mimeType: selectedDoc.mimeType }
          : undefined,
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
    } catch {
      setStatus(GenerationStep.ERROR);
    }
  };

  const handleSpeak = async (text: string, id: string) => {
    if (!text?.trim()) return;

    if (playingId === id) {
      stopAudio();
      return;
    }

    stopAudio();
    setPlayingId(id);

    try {
      const base64Audio = await generateAudio(text);

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
    } catch {
      setPlayingId(null);
    }
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
        setAuthMode("signin");
        setShowAuthModal(true);
        return;
    }
    // Simulate successful purchase
    localStorage.setItem(`studdismart_pro_${user.id}`, 'true');
    setUser(prev => prev ? { ...prev, tier: 'pro', isSubscribed: true } : prev);
    alert("Welcome to StuddiSmart Pro!");
    setView("home");
  };

  return (
    <div className="flex-grow flex flex-col">
      <nav className="glass sticky top-0 z-[100] border-b border-slate-200 dark:border-slate-700/50 transition-all">
        <div className="container-responsive h-16 md:h-18 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={resetSession}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-600 dark:bg-emerald-500 rounded-none flex items-center justify-center shadow-md transition-transform group-hover:scale-105">
                <span className="text-white font-black text-lg md:text-xl tracking-tighter">S</span>
              </div>
              <h1 className="text-lg md:text-xl font-black tracking-tighter">StuddiSmart<span className="text-emerald-500">.</span></h1>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setView("home")}
                className={`text-[10px] font-black uppercase tracking-widest hover:text-emerald-500 transition-colors ${view === 'home' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Home
              </button>
              <button 
                onClick={() => setView("about")}
                className={`text-[10px] font-black uppercase tracking-widest hover:text-emerald-500 transition-colors ${view === 'about' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
              >
                About Us
              </button>
              <button 
                onClick={() => setView("pricing")}
                className={`text-[10px] font-black uppercase tracking-widest hover:text-emerald-500 transition-colors ${view === 'pricing' ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Pricing
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={toggleDarkMode}
              className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-none bg-slate-200 dark:bg-slate-800 transition-colors hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300/50 dark:border-slate-700"
              type="button"
            >
              {isDarkMode ? "🌙" : "☀️"}
            </button>

            {user ? (
              <div className="group relative">
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-none cursor-pointer hover:shadow-md transition-all">
                  <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-none flex items-center justify-center text-xs font-black uppercase">
                    {user.name?.[0] || "S"}
                  </div>
                  <span className="hidden sm:inline text-xs font-black tracking-tight">
                    {user.name}
                  </span>
                </div>

                <div className="absolute top-full right-0 mt-2 w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-[110]">
                  <button
                    onClick={() => setView("profile")}
                    className="w-full text-left px-5 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
                    type="button"
                  >
                    Identity Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                    type="button"
                  >
                    Terminate Session
                  </button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="h-8 md:h-10 px-5 md:px-8 rounded-none shadow-sm"
                onClick={() => {
                  setAuthMode("signin");
                  setShowAuthModal(true);
                }}
              >
                Unlock Access
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="container-responsive flex-grow py-10 md:py-16">
        {view === "home" && (
          <div className="max-w-4xl mx-auto space-y-10 md:space-y-20 text-center animate-content">
            <div className="space-y-6">
              <div className="inline-flex px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-none text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] border border-emerald-100 dark:border-emerald-800">
                ✨ Automated Academic Synthesis
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95] md:leading-[0.9] text-slate-900 dark:text-white">
                Learn smarter, <br /> <span className="text-emerald-500">not harder.</span>
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-base md:text-xl font-medium max-w-xl mx-auto leading-relaxed">
                Transform documents, PDFs, or research notes into high-performance study material with StuddiSmart.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-2 md:p-3 shadow-xl border border-slate-200 dark:border-slate-700 relative group overflow-hidden">
              {status === GenerationStep.PROCESSING && (
                <div className="absolute inset-0 bg-slate-50/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm rounded-none animate-in fade-in duration-300">
                  <div className="relative mb-12">
                    <div className="w-24 h-24 md:w-32 md:h-32 border-[6px] border-emerald-100 dark:border-emerald-900/50 border-t-emerald-500 rounded-full animate-spin shadow-xl" />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <svg className="w-8 h-8 text-emerald-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                  </div>
                  <div className="text-center space-y-4 max-w-sm">
                    <p className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white animate-in slide-in-from-bottom-2 duration-700">{STUDY_TIPS[tipIndex]}</p>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 animate-shimmer transition-all duration-1000" style={{ width: `${((tipIndex + 1) / STUDY_TIPS.length) * 100}%` }} />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] animate-pulse">Running advanced AI logic engine</p>
                  </div>
                </div>
              )}

              <div className="bg-slate-100/50 dark:bg-slate-900 rounded-none p-6 md:p-10 space-y-8">
                <textarea
                  className="w-full h-40 md:h-60 bg-transparent outline-none resize-none text-lg md:text-2xl font-bold placeholder:text-slate-300 dark:placeholder:text-slate-700 leading-relaxed text-slate-900 dark:text-slate-100"
                  placeholder="Paste your source material here..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />

                {selectedDoc && (
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-4 rounded-none border border-emerald-500/10 shadow-sm animate-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-none flex items-center justify-center text-[10px] font-black">
                        {selectedDoc.mimeType.includes("pdf") ? "PDF" : "IMG"}
                      </div>
                      <div className="text-left">
                        <span className="text-xs md:text-sm font-black truncate block max-w-[150px] md:max-w-xs text-slate-900 dark:text-slate-100">{selectedDoc.name}</span>
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Resource Attached</span>
                      </div>
                    </div>
                    <button onClick={() => setSelectedDoc(null)} className="w-8 h-8 flex items-center justify-center rounded-none bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                  </div>
                )}

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 pt-8 border-t border-slate-200/50 dark:border-slate-700/50">
                  <Button variant="secondary" className="h-14 md:h-16 px-8 rounded-none bg-slate-50 hover:bg-white" onClick={() => fileInputRef.current?.click()}>
                    {selectedDoc ? "Replace" : "Add Source"}
                  </Button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                  <Button className="flex-1 h-14 md:h-16 text-lg rounded-none shadow-sm" onClick={handleGenerate}>
                    Start Synthesis
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "viewer" && (
          <div className="max-w-5xl mx-auto space-y-8 animate-content">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-none shadow-md border border-slate-200/50 dark:border-slate-700/50 w-full lg:max-w-lg relative h-12 md:h-14">
                <div className="absolute inset-1 pointer-events-none">
                  <div 
                    className="h-full bg-slate-800 dark:bg-slate-100 rounded-none transition-all duration-300 ease-out shadow-sm"
                    style={{
                      width: '33.33%',
                      transform: `translateX(${activeTab === 'cards' ? '0%' : activeTab === 'quiz' ? '100%' : '200%'})`
                    }}
                  />
                </div>
                {(["cards", "quiz", "mindmap"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-[10px] font-black rounded-none transition-all relative z-10 uppercase tracking-widest ${
                      activeTab === tab ? "text-slate-50 dark:text-slate-900" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    }`}
                    type="button"
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <Button onClick={resetSession} variant="secondary" className="h-12 md:h-14 px-8 rounded-none text-xs bg-slate-50">Reset Workspace</Button>
            </div>

            <div className="min-h-[450px]">
              {activeTab === "cards" && (
                <div className="space-y-10 animate-in fade-in duration-500">
                  <FlashcardViewer 
                    card={cards[currentIndex]} 
                    index={currentIndex} 
                    total={cards.length} 
                    onPrev={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                    onNext={() => setCurrentIndex((p) => Math.min(cards.length - 1, p + 1))}
                  />
                </div>
              )}

              {activeTab === "quiz" && (
                <div className="max-w-xl mx-auto animate-in fade-in duration-500">
                  {isQuizSubmitted ? (
                    <div className="bg-slate-50 dark:bg-slate-800 p-10 md:p-14 rounded-none border border-slate-200 dark:border-slate-700 shadow-xl text-center space-y-8">
                      <div className="relative inline-block scale-110 mb-4">
                        <svg className="w-24 h-24 transform -rotate-90 mx-auto">
                          <circle cx="50%" cy="50%" r="45%" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
                          <circle cx="50%" cy="50%" r="45%" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="151" strokeDashoffset={151 - (151 * quizResults.percentage) / 100} className="text-emerald-500 transition-all duration-1000 ease-out" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{quizResults.percentage}%</span>
                          <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Level</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">Synthesis Verified</h3>
                        <p className="text-slate-500 font-bold text-xs">Identified {quizResults.correctCount} / {quiz.length} patterns correctly.</p>
                      </div>
                      <Button className="w-full h-12 text-xs rounded-none" onClick={() => { setIsQuizSubmitted(false); setQuizIndex(0); setQuizAnswers({}); }}>Reset Checkpoint</Button>
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800 p-6 md:p-8 rounded-none border border-slate-200 dark:border-slate-700 shadow-xl space-y-8 border-t-4 border-t-emerald-500">
                      <div className="text-center space-y-4">
                        <div className="inline-block px-4 py-1 bg-slate-200 dark:bg-slate-700 rounded-none text-[9px] font-black uppercase tracking-widest text-slate-500">
                          Checkpoint {quizIndex + 1} of {quiz.length}
                        </div>
                        <h3 className="text-lg md:text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">{quiz[quizIndex]?.question}</h3>
                        <div className="flex justify-center">
                          <ListenButton onListen={() => handleSpeak(quiz[quizIndex]?.question || "", "q")} isPlaying={playingId === "q"} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {quiz[quizIndex]?.options.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => setQuizAnswers((p) => ({ ...p, [quiz[quizIndex].id]: opt }))}
                            className={`group p-4 text-left rounded-none border font-bold transition-all text-sm ${
                              quizAnswers[quiz[quizIndex].id] === opt ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                               <div className={`w-6 h-6 rounded-none flex items-center justify-center border font-black transition-colors shrink-0 text-[10px] ${quizAnswers[quiz[quizIndex].id] === opt ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'border-slate-300 dark:border-slate-700 text-slate-400'}`}>
                                 {String.fromCharCode(65 + i)}
                               </div>
                               <span className="leading-tight text-xs text-slate-800 dark:text-slate-200">{opt}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <Button variant="secondary" className="flex-1 h-12 rounded-none text-xs bg-slate-100" onClick={() => setQuizIndex((p) => Math.max(0, p - 1))} disabled={quizIndex === 0}>Prev</Button>
                        {quizIndex === quiz.length - 1 ? (
                          <Button className="flex-[2] h-12 text-xs rounded-none shadow-sm" onClick={() => setIsQuizSubmitted(true)} disabled={!quizResults.isAllAnswered}>Submit Analysis</Button>
                        ) : (
                          <Button className="flex-[2] h-12 text-xs rounded-none" onClick={() => setQuizIndex((p) => Math.min(quiz.length - 1, p + 1))}>Next Segment</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "mindmap" && (
                <div className="bg-slate-50 dark:bg-slate-800 p-8 md:p-12 rounded-none border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-xl relative min-h-[350px] animate-in fade-in duration-500">
                  <div className="min-w-max">
                    {mindmap ? <MindmapNodeView node={mindmap} /> : <div className="text-center py-20 font-black opacity-10 text-xl uppercase tracking-[0.2em]">Graph Unavailable</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "pricing" && (
          <div className="max-w-4xl mx-auto py-10 animate-content space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Select Synthesis Plan</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">Scale your learning matrix with StuddiSmart professional tools.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* FREE */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 flex flex-col space-y-8 rounded-none hover:shadow-xl transition-shadow">
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Free Scholar</h3>
                  <div className="text-4xl font-black text-slate-900 dark:text-white">$0<span className="text-sm text-slate-400 font-medium"> / mo</span></div>
                </div>
                <ul className="space-y-4 text-sm font-bold text-slate-600 dark:text-slate-300 flex-grow">
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> 5 Sets per Month</li>
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> Basic Flashcards</li>
                  <li className="flex items-center gap-3 opacity-30"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg> Document Parsing</li>
                  <li className="flex items-center gap-3 opacity-30"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg> AI Tutor Insights</li>
                </ul>
                <Button variant="secondary" className="w-full h-14 rounded-none bg-slate-100" onClick={() => setView("home")}>Current Plan</Button>
              </div>

              {/* PRO */}
              <div className="bg-slate-50 dark:bg-slate-800 border-2 border-emerald-500 p-8 flex flex-col space-y-8 rounded-none relative shadow-2xl shadow-emerald-500/10">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-none">Recommended</div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">StuddiSmart Pro</h3>
                  <div className="text-4xl font-black text-slate-900 dark:text-white">$19<span className="text-sm text-slate-400 font-medium"> / mo</span></div>
                </div>
                <ul className="space-y-4 text-sm font-bold text-slate-600 dark:text-slate-200 flex-grow">
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> Unlimited Synthesis</li>
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> Advanced Document OCR</li>
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> AI Tutor Deep Dives</li>
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> Visual Diagramming</li>
                </ul>
                <Button className="w-full h-14 rounded-none" onClick={() => handleUpgrade('pro')}>Upgrade Identity</Button>
              </div>
            </div>
          </div>
        )}

        {view === "about" && (
          <div className="max-w-3xl mx-auto py-10 animate-content space-y-12">
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 md:p-14 space-y-10 rounded-none shadow-xl border-t-4 border-t-emerald-500">
              <section className="space-y-4">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">About StuddiSmart</h2>
                <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed font-medium">
                  StuddiSmart is an AI-powered learning platform designed to help students and lifelong learners study smarter—not longer.
                  With StuddiSmart, you can upload your PDFs, notes, or images and instantly transform them into:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <div className="p-5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 group hover:border-emerald-500/40 transition-colors">
                    <div className="text-emerald-500 text-2xl font-black group-hover:scale-110 transition-transform inline-block">01</div>
                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-900 dark:text-white">Flashcards</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Quick and effective memorization modules.</p>
                  </div>
                  <div className="p-5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 group hover:border-emerald-500/40 transition-colors">
                    <div className="text-emerald-500 text-2xl font-black group-hover:scale-110 transition-transform inline-block">02</div>
                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-900 dark:text-white">Quizzes</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Test understanding and track synthesis progress.</p>
                  </div>
                  <div className="p-5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 group hover:border-emerald-500/40 transition-colors">
                    <div className="text-emerald-500 text-2xl font-black group-hover:scale-110 transition-transform inline-block">03</div>
                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-900 dark:text-white">Mindmaps</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Visualize concepts and connect complex ideas.</p>
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed font-medium pt-4 text-slate-900 dark:text-white">
                  We built StuddiSmart for people who want clarity, speed, and confidence in their learning process. Instead of rereading notes or feeling overwhelmed, StuddiSmart helps you actively engage with your material and retain what matters most.
                </p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                <section className="space-y-4">
                  <h3 className="text-xl font-black uppercase tracking-widest text-emerald-500">Our Mission</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm font-bold">
                    To make studying more efficient, intuitive, and accessible for everyone—so learning feels less stressful and more empowering.
                  </p>
                </section>
                <section className="space-y-4">
                  <h3 className="text-xl font-black uppercase tracking-widest text-emerald-500">Who We Are For</h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 text-sm font-bold">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500" /> Students preparing for exams</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500" /> Professionals seeking certifications</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500" /> Lifelong learners and researchers</li>
                  </ul>
                </section>
              </div>

              <section className="space-y-6 pt-8 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-black uppercase tracking-widest text-emerald-500">Our Approach</h3>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-slate-200 dark:bg-slate-900 flex items-center justify-center font-black">A</div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">AI-powered insights that adapt to your content in real-time.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-slate-200 dark:bg-slate-900 flex items-center justify-center font-black">B</div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Clean, distraction-free design that keeps you focused on results.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-slate-200 dark:bg-slate-900 flex items-center justify-center font-black">C</div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Privacy-minded technology built with modern security practices.</p>
                  </div>
                </div>
              </section>

              <div className="pt-10 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-100 dark:bg-slate-900 p-8 border border-slate-200 dark:border-slate-700">
                <div className="space-y-1">
                  <h4 className="font-black text-sm uppercase tracking-[0.2em] text-slate-400">Questions or feedback?</h4>
                  <p className="font-black text-emerald-500">support@studdismart.com</p>
                </div>
                <Button variant="outline" className="h-12 px-8" onClick={() => window.location.href='mailto:support@studdismart.com'}>Contact Us</Button>
              </div>
            </div>
          </div>
        )}

        {view === "profile" && user && (
          <div className="max-w-xl mx-auto animate-content">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-10 md:p-14 border border-slate-200 dark:border-slate-700 shadow-xl space-y-10 border-t-4 border-t-emerald-500">
              <div className="flex flex-col items-center space-y-6">
                <div className="w-20 h-20 bg-emerald-600 dark:bg-emerald-500 text-white rounded-none flex items-center justify-center text-3xl font-black shadow-lg">
                  {user.name?.[0]}
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{user.name}</h2>
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-xs uppercase tracking-widest">{user.email}</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-2 block">Display Identity</label>
                  <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} className="w-full px-5 py-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-none font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-base text-slate-800 dark:text-slate-100" />
                </div>
                <div className="pt-6 flex flex-col md:flex-row gap-3">
                  <Button className="flex-1 h-12 text-xs rounded-none" onClick={handleUpdateProfile} isLoading={isUpdatingProfile}>Apply Update</Button>
                  <Button variant="secondary" className="flex-1 h-12 text-xs rounded-none bg-slate-100" onClick={() => setView("home")}>Return</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showAuthModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-50 dark:bg-slate-800 w-full max-w-md rounded-none p-10 md:p-10 space-y-8 border border-slate-200 dark:border-slate-700 shadow-2xl animate-in zoom-in-95 duration-400 relative flex flex-col overflow-y-auto max-h-[90vh]">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-8 right-8 w-8 h-8 flex items-center justify-center rounded-none bg-slate-200 dark:bg-slate-700 text-slate-400 hover:text-red-500 transition-all active:scale-90">✕</button>
            {authMode === "verify" ? (
              <div className="text-center space-y-6 py-6">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-none flex items-center justify-center mx-auto text-3xl">📧</div>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">Verification Required</h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-xs leading-relaxed">Synthesis link transmitted to <span className="text-emerald-500 font-black">{pendingEmail}</span>. Confirm to initialize.</p>
                <Button className="w-full h-12 text-xs rounded-none" onClick={() => setAuthMode("signin")}>Back to Auth</Button>
              </div>
            ) : (
              <>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{authMode === "signin" ? "Initialize Secure Access" : "Join StuddiSmart"}</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-xs">Access your personal synthesis terminal.</p>
                </div>
                <div className="space-y-4">
                  {authMode === "signup" && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Identity</label>
                      <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-none font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm text-slate-800 dark:text-slate-100" placeholder="Full name" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Endpoint (Email)</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-none font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm text-slate-800 dark:text-slate-100" placeholder="name@domain.com" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-4 block">Access Key (Password)</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-none font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm text-slate-800 dark:text-slate-100" placeholder="••••••••" />
                  </div>
                  {authError && <div className="text-[10px] font-black text-red-500 uppercase text-center bg-red-50 dark:bg-red-900/10 p-3 rounded-none border border-red-100 dark:border-red-900/20">{authError}</div>}
                  <Button className="w-full h-14 text-sm rounded-none shadow-md" onClick={handleAuth} isLoading={isAuthLoading}>
                    {authMode === "signin" ? "Unlock Terminal" : "Initialize Access"}
                  </Button>
                  <p className="text-[10px] text-center font-bold text-slate-400 uppercase tracking-widest">
                    {authMode === "signin" ? "No identity?" : "Already Registered?"}
                    <button onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")} className="ml-2 text-emerald-500 hover:underline">{authMode === "signin" ? "Register" : "Sign In"}</button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="container-responsive py-8 mt-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-t border-slate-200 dark:border-slate-700 pt-8 opacity-40">
          <p className="text-[8px] font-black uppercase tracking-[0.4em]">© 2026 StuddiSmart AI • Core Learning Matrix</p>
          <div className="flex gap-8 text-[8px] font-black uppercase tracking-[0.4em]">
            <button onClick={() => setView("about")} className="hover:text-emerald-500 transition-colors uppercase">Privacy</button>
            <button onClick={() => setView("about")} className="hover:text-emerald-500 transition-colors uppercase">Terms</button>
            <button onClick={() => setView("about")} className="hover:text-emerald-500 transition-colors uppercase">Support</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
};

export default App;