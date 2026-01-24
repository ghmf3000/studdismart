import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, TutorExplanation } from '../types';
import { generateFlashcardImage, fetchTutorInsights, generateAudio } from '../services/geminiService';
import { Button } from './Button';

interface FlashcardViewerProps {
  card: Flashcard;
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

const ListenButton: React.FC<{ onListen: () => void; isPlaying: boolean; variant?: 'light' | 'dark' }> = ({ onListen, isPlaying, variant = 'light' }) => (
  <button 
    onClick={(e) => { e.stopPropagation(); onListen(); }}
    className={`group relative flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full transition-all duration-300 border shadow-sm active:scale-90 shrink-0 ${
      isPlaying 
      ? 'bg-blue-600 border-blue-500 text-white ring-4 ring-blue-500/20' 
      : variant === 'light'
        ? 'bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-blue-400'
        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-900/50'
    }`}
    title={isPlaying ? "Stop" : "Listen to audio"}
  >
    {isPlaying ? (
      <div className="flex gap-0.5 items-center justify-center">
        <div className="w-0.5 h-2.5 bg-white rounded-full animate-[bounce_0.6s_infinite_0ms]" />
        <div className="w-0.5 h-3.5 bg-white rounded-full animate-[bounce_0.6s_infinite_200ms]" />
        <div className="w-0.5 h-2 bg-white rounded-full animate-[bounce_0.6s_infinite_400ms]" />
      </div>
    ) : (
      <svg className="w-4 h-4 md:w-5 md:h-5 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
    )}
  </button>
);

const TutorSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 animate-pulse">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="space-y-3 bg-slate-50/50 dark:bg-slate-800/20 p-5 rounded-none border border-dashed border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded" />
          <div className="h-4 w-5/6 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
      </div>
    ))}
  </div>
);

export const FlashcardViewer: React.FC<FlashcardViewerProps> = ({ card, index, total, onPrev, onNext }) => {
  if (!card) return null;

  const [isFlipped, setIsFlipped] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [tutorData, setTutorData] = useState<TutorExplanation | null>(null);
  const [showTutor, setShowTutor] = useState(false);
  const [isFetchingTutor, setIsFetchingTutor] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    setIsFlipped(false);
    setTutorData(null);
    setShowTutor(false);
    stopAudio();
    if (card?.imagePrompt) {
      loadImage();
    } else {
      setImageUrl(null);
    }
  }, [card]);

  useEffect(() => {
    stopAudio();
  }, [isFlipped]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const loadImage = async () => {
    setIsImageLoading(true);
    try {
      const url = await generateFlashcardImage(card.imagePrompt!);
      setImageUrl(url);
    } catch (e) {
      setImageUrl(null);
    } finally {
      setIsImageLoading(false);
    }
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const handleSpeak = async (text: string, id: string) => {
    if (playingId === id) {
      stopAudio();
      return;
    }

    stopAudio();
    setPlayingId(id);

    try {
      const base64Audio = await generateAudio(text);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioCtx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
      
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        if (audioSourceRef.current === source) {
          setPlayingId(null);
          audioSourceRef.current = null;
        }
      };
      
      audioSourceRef.current = source;
      source.start();
    } catch (err) {
      console.error("TTS failed", err);
      setPlayingId(null);
    }
  };

  const handleFetchTutor = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTutor(true);
    if (tutorData) return;

    setIsFetchingTutor(true);
    try {
      const data = await fetchTutorInsights(card.question, card.answer);
      setTutorData(data);
    } catch (err) {
      console.error("Failed to fetch tutor data", err);
      setShowTutor(false);
    } finally {
      setIsFetchingTutor(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4">
      <div 
        className="card-flip w-full min-h-[300px] h-[320px] md:h-[350px]"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`card-inner w-full h-full relative ${isFlipped ? 'card-flipped' : ''}`}>
          {/* FRONT */}
          <div className="card-front bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col p-0 overflow-hidden rounded-none border-t-4 border-t-emerald-500">
            <div className="flex-1 w-full flex flex-col p-8 md:p-12 space-y-4 overflow-y-auto">
              {card?.imagePrompt && (
                <div className="w-full h-20 md:h-28 flex items-center justify-center bg-slate-50 dark:bg-slate-900 overflow-hidden shadow-inner border border-slate-100 dark:border-slate-700 shrink-0 rounded-none">
                  {isImageLoading ? (
                    <div className="w-full h-full animate-pulse flex items-center justify-center">
                       <div className="w-6 h-6 border-2 border-emerald-100 dark:border-emerald-900/30 border-t-emerald-600 dark:border-t-emerald-500 rounded-full animate-spin" />
                    </div>
                  ) : imageUrl ? (
                    <img src={imageUrl} alt="Concept Diagram" className="w-full h-full object-cover" />
                  ) : null}
                </div>
              )}
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 text-center gap-4">
                  <div className="flex flex-col items-center gap-3 w-full">
                    <ListenButton 
                      onListen={() => handleSpeak(card.question, `q-${card.id}`)} 
                      isPlaying={playingId === `q-${card.id}`} 
                      variant="light"
                    />
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white leading-tight">
                      {card?.question}
                    </h3>
                  </div>
              </div>
            </div>
            <div className="w-full py-3 bg-slate-50 dark:bg-slate-700 border-t border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-slate-400 dark:text-slate-400 font-black tracking-[0.4em] uppercase">
                Reveal Analysis
              </span>
            </div>
          </div>

          {/* BACK */}
          <div className="card-back bg-slate-900 dark:bg-slate-800 shadow-xl text-white border border-slate-800 dark:border-slate-700 flex flex-col p-0 overflow-hidden rounded-none border-t-4 border-t-emerald-400">
            <div className="flex-1 w-full flex flex-col items-center justify-center p-8 md:p-12 relative overflow-y-auto gap-6">
              <div className="flex flex-col items-center justify-center gap-4 max-w-xl w-full text-center">
                <ListenButton 
                  onListen={() => handleSpeak(card.answer, `a-${card.id}`)} 
                  isPlaying={playingId === `a-${card.id}`} 
                  variant="dark"
                />
                <p className="text-xl md:text-2xl font-bold leading-tight">
                  {card?.answer}
                </p>
              </div>
            </div>

            <button 
              onClick={handleFetchTutor}
              disabled={isFetchingTutor}
              className={`w-full py-5 font-black text-xs tracking-[0.3em] uppercase transition-all duration-300 border-t border-slate-800/50 flex items-center justify-center gap-3 group bg-slate-800 dark:bg-slate-700 text-emerald-400 hover:bg-slate-700 dark:hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50`}
            >
              {isFetchingTutor ? (
                <>
                  <div className="w-3 h-3 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Tutor Insights
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full flex items-center justify-between pt-8 px-2 select-none">
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          disabled={index === 0}
          className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 hover:text-emerald-500 disabled:opacity-0 transition-colors py-2"
        >
          Previous
        </button>
        
        <div className="px-6 py-2 bg-slate-800 dark:bg-slate-700 rounded-none text-white shadow-lg flex items-center gap-3 border border-slate-700 dark:border-slate-600">
           <span className="text-[9px] font-black tracking-widest text-slate-400 dark:text-slate-400 uppercase">Card</span>
           <span className="text-xs md:text-sm font-black text-emerald-400">{index + 1} <span className="text-slate-600 dark:text-slate-500">/</span> {total}</span>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          disabled={index === total - 1}
          className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 hover:text-emerald-500 disabled:opacity-0 transition-colors py-2"
        >
          Next
        </button>
      </div>

      {/* AI TUTOR MODAL */}
      {showTutor && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-none shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-500 border border-slate-200 dark:border-slate-700">
            {/* Modal Header */}
            <div className="px-6 md:px-8 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-none flex items-center justify-center ${isFetchingTutor ? 'bg-slate-100 dark:bg-slate-700 animate-pulse' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 shadow-sm'}`}>
                  <svg className={`w-5 h-5 ${isFetchingTutor ? 'text-slate-300' : ''}`} fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">AI Tutor Deep Dive</h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Personal Learning Synthesis</p>
                </div>
              </div>
              <button 
                onClick={() => { stopAudio(); setShowTutor(false); }} 
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all text-slate-400 active:scale-90"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              {!tutorData ? (
                <TutorSkeleton />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* SECTION: SIMPLE EXPLANATION */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-blue-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Simple Explanation</span>
                      </div>
                      <ListenButton onListen={() => handleSpeak(tutorData.simpleExplanation, 'sum')} isPlaying={playingId === 'sum'} />
                    </div>
                    <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                      {tutorData.simpleExplanation}
                    </p>
                  </div>

                  {/* SECTION: REAL WORLD EXAMPLE */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-orange-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Real-World Example</span>
                      </div>
                      <ListenButton onListen={() => handleSpeak(tutorData.realWorldExample, 'rw')} isPlaying={playingId === 'rw'} />
                    </div>
                    <div className="bg-orange-50/20 dark:bg-orange-900/10 p-4 rounded-none border border-orange-100/50 dark:border-orange-900/20">
                      <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-bold italic">
                        "{tutorData.realWorldExample}"
                      </p>
                    </div>
                  </div>

                  {/* SECTION: CORE TAKEAWAYS */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Core Takeaways</span>
                      </div>
                    </div>
                    <ul className="space-y-3">
                      {tutorData.keyCommands.map((item, i) => (
                        <li key={i} className="flex gap-3 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-700/50 p-3 rounded-none border border-slate-100 dark:border-slate-600">
                          <span className="text-emerald-500 font-black">#{i+1}</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* SECTION: COMMON MISTAKES */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-red-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Common Mistakes</span>
                      </div>
                    </div>
                    <ul className="space-y-3">
                      {tutorData.commonMistakes.map((item, i) => (
                        <li key={i} className="flex gap-3 text-sm font-bold text-slate-700 dark:text-slate-200 bg-red-50/30 dark:bg-red-900/10 p-3 rounded-none border border-red-100 dark:border-red-900/20">
                          <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] shrink-0 font-black">!</div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* SECTION: QUICK CHECK */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-purple-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quick Check ({tutorData.quickCheck.length} Qs)</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                      {tutorData.quickCheck.map((item, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-700/30 p-4 border border-slate-100 dark:border-slate-600 rounded-none space-y-2">
                          <p className="text-xs font-black uppercase text-slate-400">Question {i+1}</p>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.question}</p>
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                             <p className="text-[10px] font-black uppercase text-emerald-500">Answer</p>
                             <p className="text-sm text-slate-600 dark:text-slate-300">{item.answer}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 md:px-8 py-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/80 backdrop-blur-md shrink-0 flex justify-end">
               <Button className="rounded-none h-12 md:h-14 px-10" disabled={isFetchingTutor} onClick={() => { stopAudio(); setShowTutor(false); }}>
                 {isFetchingTutor ? 'Processing...' : 'Back to Study'}
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};