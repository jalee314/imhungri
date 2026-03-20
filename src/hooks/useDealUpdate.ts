import { useDealUpdateStore } from '../stores/DealUpdateStore';
import type { Deal } from '../types/deal';

export function useDealUpdate<T>(selector: (state: any) => T, equality?: (a: T, b: T) => boolean): T;
export function useDealUpdate(): {
  updateDeal: (deal: Deal) => void;
  getUpdatedDeal: (dealId: string) => Deal | undefined;
  clearUpdatedDeal: (dealId: string) => void;
  postAdded: boolean;
  setPostAdded: (added: boolean) => void;
  postUploadStatus: 'idle' | 'uploading' | 'success';
  postUploadProgress: number;
  startPostUpload: () => void;
  setPostUploadProgress: (progress: number) => void;
  completePostUpload: () => void;
  resetPostUpload: () => void;
};
export function useDealUpdate<T>(selector?: (state: any) => T) {
  if (selector) {
    return useDealUpdateStore(selector as any) as unknown as T;
  }
  const updateDeal = useDealUpdateStore((s) => s.updateDeal);
  const getUpdatedDeal = useDealUpdateStore((s) => s.getUpdatedDeal);
  const clearUpdatedDeal = useDealUpdateStore((s) => s.clearUpdatedDeal);
  const postAdded = useDealUpdateStore((s) => s.postAdded);
  const setPostAdded = useDealUpdateStore((s) => s.setPostAdded);
  const postUploadStatus = useDealUpdateStore((s) => s.postUploadStatus);
  const postUploadProgress = useDealUpdateStore((s) => s.postUploadProgress);
  const startPostUpload = useDealUpdateStore((s) => s.startPostUpload);
  const setPostUploadProgress = useDealUpdateStore((s) => s.setPostUploadProgress);
  const completePostUpload = useDealUpdateStore((s) => s.completePostUpload);
  const resetPostUpload = useDealUpdateStore((s) => s.resetPostUpload);

  return {
    updateDeal,
    getUpdatedDeal,
    clearUpdatedDeal,
    postAdded,
    setPostAdded,
    postUploadStatus,
    postUploadProgress,
    startPostUpload,
    setPostUploadProgress,
    completePostUpload,
    resetPostUpload,
  };
}
