import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RideVideoIntegration } from './coordinator';
export const VideoContext = createContext<RideVideoIntegration | null>(null);
export function useRideVideo() {
  const video = useContext(VideoContext);
  if (!video) throw new Error('Vídeo indisponível.');
  const snapshot = useSyncExternalStore(video.subscribe, video.getSnapshot);
  return { video, snapshot };
}
