import { create } from 'zustand';

interface FeedUIState {
  isReselectReloadInProgress: boolean;
  reselectReloadStartedAt: number | null;
  reselectReloadEndedAt: number | null;
  reselectReloadRequestId: number;
  requestReselectReload: () => void;
  beginReselectReload: () => void;
  endReselectReload: () => void;
}

export const useFeedUIStore = create<FeedUIState>((set) => ({
  isReselectReloadInProgress: false,
  reselectReloadStartedAt: null,
  reselectReloadEndedAt: null,
  reselectReloadRequestId: 0,
  requestReselectReload: () => set((state) => ({ reselectReloadRequestId: state.reselectReloadRequestId + 1 })),
  beginReselectReload: () => set({ isReselectReloadInProgress: true, reselectReloadStartedAt: Date.now() }),
  endReselectReload: () => set({ isReselectReloadInProgress: false, reselectReloadStartedAt: null, reselectReloadEndedAt: Date.now() }),
}));
