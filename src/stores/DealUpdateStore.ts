import { create } from 'zustand';

import type { Deal } from '../types/deal';

interface DealUpdateState {
  // Map of updated deals (id -> deal object)
  updatedDeals: Map<string, Deal>;
  // Flag indicating a post was added (used to trigger feed refreshes)
  postAdded: boolean;
  // Global post upload UI state (for feed header progress bar)
  postUploadStatus: 'idle' | 'uploading' | 'success';
  postUploadProgress: number;

  // Actions
  updateDeal: (deal: Deal) => void;
  getUpdatedDeal: (dealId: string) => Deal | undefined;
  clearUpdatedDeal: (dealId: string) => void;
  setPostAdded: (added: boolean) => void;
  resetPostAdded: () => void;
  startPostUpload: () => void;
  setPostUploadProgress: (progress: number) => void;
  completePostUpload: () => void;
  resetPostUpload: () => void;
  clearAll: () => void;
}

export const useDealUpdateStore = create<DealUpdateState>((set, get) => ({
  updatedDeals: new Map<string, Deal>(),
  postAdded: false,
  postUploadStatus: 'idle',
  postUploadProgress: 0,

  updateDeal: (deal) => {
    set((state) => {
      const next = new Map(state.updatedDeals);
      next.set(deal.id, deal);
      return { updatedDeals: next };
    });
  },
  getUpdatedDeal: (dealId) => {
    return get().updatedDeals.get(dealId);
  },
  clearUpdatedDeal: (dealId) => {
    set((state) => {
      const next = new Map(state.updatedDeals);
      next.delete(dealId);
      return { updatedDeals: next };
    });
  },
  setPostAdded: (added) => set({ postAdded: added }),
  resetPostAdded: () => set({ postAdded: false }),
  startPostUpload: () => set({ postUploadStatus: 'uploading', postUploadProgress: 0.08 }),
  setPostUploadProgress: (progress) => set({
    postUploadStatus: 'uploading',
    postUploadProgress: Math.max(0, Math.min(1, progress)),
  }),
  completePostUpload: () => set({ postUploadStatus: 'success', postUploadProgress: 1 }),
  resetPostUpload: () => set({ postUploadStatus: 'idle', postUploadProgress: 0 }),
  clearAll: () => set({
    updatedDeals: new Map(),
    postAdded: false,
    postUploadStatus: 'idle',
    postUploadProgress: 0,
  }),
}));
