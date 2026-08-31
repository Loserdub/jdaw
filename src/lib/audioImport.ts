import { useDAWStore, Track } from './store';
import { engine } from './engine';

/**
 * Imports an external audio File, decodes it into an AudioBuffer,
 * and creates a region on targetTrackId (or creates a brand new Track if targetTrackId is not provided).
 */
export async function importAudioFile(
  file: File,
  targetTrackId?: string,
  startTime: number = 0
): Promise<{ trackId: string; regionId: string; duration: number } | null> {
  try {
    await engine.init();
    if (engine.ctx.state === 'suspended') {
      await engine.ctx.resume();
    }

    const arrayBuffer = await file.arrayBuffer();
    const bufferCopy = arrayBuffer.slice(0);

    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        engine.ctx.decodeAudioData(
          bufferCopy,
          (buf) => resolve(buf),
          (err) => reject(err || new Error('Unknown decoding error'))
        );
      } catch (e) {
        reject(e);
      }
    });

    const state = useDAWStore.getState();
    let trackId = targetTrackId;

    if (!trackId || !state.tracks.find(t => t.id === trackId)) {
      // Create new track with file name
      const newTrackId = Math.random().toString(36).substring(2, 9);
      const cleanName = file.name.replace(/\.[^/.]+$/, '') || `Audio ${state.tracks.length + 1}`;

      const newTrack: Track = {
        id: newTrackId,
        name: cleanName,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        inputType: 'file',
        effects: [],
        sends: [],
        synthSettings: { oscillatorType: 'square', attack: 0.01, release: 0.1 }
      };

      useDAWStore.setState((prev) => ({
        tracks: [...prev.tracks, newTrack],
        selectedTrackId: newTrackId
      }));

      trackId = newTrackId;
    }

    const regionId = Math.random().toString(36).substring(2, 9);
    const regionDuration = audioBuffer.duration;

    state.addRegion({
      id: regionId,
      trackId: trackId,
      buffer: audioBuffer,
      start: Math.max(0, startTime),
      duration: regionDuration
    });

    // Auto-expand duration if region extends past current project duration
    if (startTime + regionDuration > state.duration) {
      state.setDuration(Math.ceil(startTime + regionDuration + 10));
    }

    return { trackId, regionId, duration: regionDuration };
  } catch (err) {
    console.error('Error importing audio file:', err);
    alert(`Could not decode "${file.name}". Please ensure it is a valid audio format.`);
    return null;
  }
}
