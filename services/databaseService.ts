// src/services/historyService.ts
// Local history (no DB). Safe in SSR, works in browser.

export type HistoryItem = {
  id: string;
  createdAt: number;
  prompt: string;
  inputText?: string;
  fileName?: string;
  // add other fields your UI expects
};

const KEY = "studywise_history_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readAll(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  const items = safeParse<HistoryItem[]>(localStorage.getItem(KEY), []);
  // newest first
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

function writeAll(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function saveToHistory(item: Omit<HistoryItem, "id" | "createdAt"> & Partial<Pick<HistoryItem, "id" | "createdAt">>) {
  const all = readAll();

  const newItem: HistoryItem = {
    id: item.id ?? crypto.randomUUID(),
    createdAt: item.createdAt ?? Date.now(),
    prompt: item.prompt ?? "",
    inputText: item.inputText,
    fileName: item.fileName,
  };

  writeAll([newItem, ...all]);
  return newItem;
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  return readAll();
}

export async function deleteFromHistory(id: string): Promise<boolean> {
  const all = readAll();
  const next = all.filter((x) => x.id !== id);
  writeAll(next);
  return next.length !== all.length;
}
