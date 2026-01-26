export interface User {
  id: string;
  email: string;
  name: string;
  isSubscribed: boolean;
  tier: 'free' | 'pro';
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface MindmapNode {
  label: string;
  content?: string;
  children?: MindmapNode[];
}

export interface QuickCheckItem {
  question: string;
  answer: string;
}

export interface TutorExplanation {
  simpleExplanation: string;
  realWorldExample: string;
  keyCommands: string[];
  commonMistakes: string[];
  quickCheck: QuickCheckItem[];
}

// Fixed GenerationStep by using a type union of the constant values instead of an interface
export const GenerationStep = {
  IDLE: 'IDLE',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR'
} as const;

export type GenerationStep = typeof GenerationStep[keyof typeof GenerationStep];