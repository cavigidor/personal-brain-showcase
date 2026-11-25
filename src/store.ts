import { createDemoData } from "./demo-data.ts";
import { validateData } from "./validation.ts";
import type { BrainData } from "./types.ts";

export const STORAGE_KEY = "personal-brain-showcase-local-v1";
export const initialData = createDemoData;

let lastStored: string | null = null;

export function loadData(): BrainData {
  lastStored = localStorage.getItem(STORAGE_KEY);
  return lastStored === null
    ? initialData()
    : validateData(JSON.parse(lastStored));
}

export function saveData(data: BrainData) {
  if (localStorage.getItem(STORAGE_KEY) !== lastStored) {
    throw new Error(
      "Another tab updated this workspace. Export your changes before reloading.",
    );
  }

  const next = JSON.stringify(validateData(data));
  if (next === lastStored) return;
  localStorage.setItem(STORAGE_KEY, next);
  lastStored = next;
}

export function downloadBackup(data: BrainData) {
  const exportedAt = new Date().toISOString();
  const snapshot = {
    app: "personal-brain-showcase",
    version: 1,
    exportedAt,
    data,
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `personal-brain-showcase-${exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
