import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ColumnsState {
  visibleCols: Record<string, string[]>;
  setVisibleCols: (projectId: string, cols: string[]) => void;
  toggleColumn: (projectId: string, col: string) => void;
  getVisibleCols: (projectId: string) => string[];
}

const EMPTY: string[] = [];

export const useColumnsStore = create<ColumnsState>()(
  persist(
    (set, get) => ({
      visibleCols: {},
      setVisibleCols: (projectId, cols) =>
        set((state) => ({
          visibleCols: { ...state.visibleCols, [projectId]: cols },
        })),
      toggleColumn: (projectId, col) =>
        set((state) => {
          const current = state.visibleCols[projectId] || [];
          const next = current.includes(col)
            ? current.filter((c) => c !== col)
            : [...current, col];
          return { visibleCols: { ...state.visibleCols, [projectId]: next } };
        }),
      getVisibleCols: (projectId) => get().visibleCols[projectId] ?? EMPTY,
    }),
    {
      name: "columns-store",
    }
  )
);
