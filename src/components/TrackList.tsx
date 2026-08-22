import React from 'react';
import { useDAWStore } from '../lib/store';
import { Volume2, Mic, Trash2, Upload, Piano, Plus } from 'lucide-react';
import { engine } from '../lib/engine';
import { EffectRack } from './EffectRack';

interface TrackListProps {
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function TrackList({ scrollRef, onScroll }: TrackListProps) {
  const { tracks, updateTrack, removeTrack, addTrack, selectedTrackId, setSelectedTrackId } = useDAWStore();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await engine.init();
      if (engine.ctx.state === 'suspended') {
        await engine.ctx.resume();
      }

      const arrayBuffer = await file.arrayBuffer();

      // Make a copy of the buffer to prevent detached buffer issues in some browsers
      const bufferCopy = arrayBuffer.slice(0);

      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        try {
          engine.ctx.decodeAudioData(
            bufferCopy,
            (buffer) => resolve(buffer),
            (err) => reject(err || new Error("Unknown decoding error"))
          );
        } catch (e) {
          reject(e);
        }
      });

      useDAWStore.getState().addRegion({
        id: Math.random().toString(36).substring(2, 9),
        trackId,
        buffer: audioBuffer,
        start: 0,
        duration: audioBuffer.duration,
      });
    } catch (err) {
      console.error("Error decoding audio file:", err);
      alert(`Could not decode audio file "${file.name}".\n\nPlease ensure it is a valid, uncorrupted audio format (WAV, MP3, AAC, etc.) supported by your browser.\n\nDetails: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      e.target.value = ''; // Reset input so the same file can be uploaded again
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="h-10 border-b border-white/5 flex justify-between items-center bg-white/[0.03] px-3 shrink-0">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          Tracks
        </span>
        <button
          onClick={addTrack}
          className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 px-2.5 py-1 rounded-lg transition-colors"
        >
          <Plus size={11} />
          Add
        </button>
      </div>

      {/* Track rows */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {tracks.map(track => (
          <div
            key={track.id}
            onClick={() => setSelectedTrackId(track.id)}
            className={`border-b transition-all group flex flex-col cursor-pointer select-none ${
              selectedTrackId === track.id
                ? 'bg-amber-500/[0.05] border-l-2 border-l-amber-400 border-white/5'
                : 'bg-transparent hover:bg-white/[0.03] border-white/5'
            }`}
            style={{ height: '140px' }}
          >
            {/* Track name row */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={track.name}
                onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 rounded px-1 w-24 transition-all"
              />
              <div className="flex items-center gap-1.5">
                <select
                  value={track.inputType}
                  onChange={(e) => updateTrack(track.id, { inputType: e.target.value as any })}
                  className="skeuo-input text-[9px] font-semibold text-zinc-300 rounded-md px-1.5 py-0.5 outline-none focus:border-amber-500/40 cursor-pointer"
                >
                  <option value="microphone">Mic</option>
                  <option value="midi">MIDI</option>
                  <option value="file">File</option>
                </select>
                <button
                  onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                  className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* M / S / Arm / Upload buttons */}
            <div className="flex items-center gap-1.5 px-3 py-1" onClick={(e) => e.stopPropagation()}>
              {/* Mute */}
              <button
                onClick={() => updateTrack(track.id, { muted: !track.muted })}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
                  track.muted
                    ? 'bg-amber-500/15 border border-amber-500/35 text-amber-400'
                    : 'skeuo-button text-zinc-500 hover:text-zinc-200'
                }`}
                title="Mute"
              >
                M
              </button>
              {/* Solo */}
              <button
                onClick={() => updateTrack(track.id, { solo: !track.solo })}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
                  track.solo
                    ? 'bg-amber-500/15 border border-amber-500/35 text-amber-400'
                    : 'skeuo-button text-zinc-500 hover:text-zinc-200'
                }`}
                title="Solo"
              >
                S
              </button>
              {/* Arm */}
              <button
                onClick={() => updateTrack(track.id, { armed: !track.armed })}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  track.armed
                    ? 'bg-red-500/15 border border-red-500/35 text-red-400'
                    : 'skeuo-button text-zinc-500 hover:text-zinc-200'
                }`}
                title={track.inputType === 'midi' ? 'Arm MIDI Recording' : 'Arm Audio Recording'}
              >
                {track.inputType === 'midi' ? <Piano size={13} /> : <Mic size={13} />}
              </button>
              {/* Upload */}
              <label className="w-8 h-8 rounded-lg flex items-center justify-center skeuo-button text-zinc-500 hover:text-zinc-200 cursor-pointer transition-all" title="Upload audio">
                <Upload size={13} />
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, track.id)}
                />
              </label>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 mx-3 mb-2 skeuo-input px-2.5 py-1.5 rounded-xl" onClick={(e) => e.stopPropagation()}>
              <Volume2 size={12} className="text-zinc-500 shrink-0" />
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={track.volume}
                onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[9px] font-mono text-zinc-500 w-7 text-right tabular-nums">
                {Math.round(track.volume * 100)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
