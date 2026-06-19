import { UploadState } from './video';

export type SyncListener = (event: {
  type: 'progress' | 'status_change' | 'queue_change';
  videoId?: string;
  status?: UploadState;
  percent?: number;
  error?: string | null;
}) => void;
