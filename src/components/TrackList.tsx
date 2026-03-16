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
  const { tracks, updateTrack, removeTrack, addTrack, addTrackEffect, updateTrackEffect, removeTrackEffect } = useDAWStore();

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
      <div className="h-10 border-b border-white/5 flex justify-between items-center bg-white/5 px-4 shrink-0">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Audio Tracks
        </span>
        <button onClick={addTrack} className="text-xs skeuo-button text-slate-300 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
          <Plus size={14} /> Add Track
        </button>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto no-scrollbar" 
        ref={scrollRef} 
        onScroll={onScroll}
      >
        {tracks.map(track => (
          <div 
            key={track.id} 
            className="p-4 border-b border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group flex flex-col"
            style={{ height: `${200 + (track.effects.length * 180)}px` }}
          >
            <div className="flex items-center justify-between mb-3">
              <input 
                type="text" 
                value={track.name} 
                onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                className="bg-transparent text-sm font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500/50 rounded px-1 w-24 transition-all"
              />
              <div className="flex items-center gap-2">
                <select
                  value={track.inputType}
                  onChange={(e) => updateTrack(track.id, { inputType: e.target.value as any })}
                  className="skeuo-input text-[10px] font-medium text-slate-300 rounded-md px-1.5 py-1 outline-none focus:border-sky-500/50"
                >
                  <option value="microphone">Mic</option>
                  <option value="midi">MIDI</option>
                  <option value="file">File</option>
                </select>
                <button onClick={() => removeTrack(track.id)} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <button 
                onClick={() => updateTrack(track.id, { muted: !track.muted })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${track.muted ? 'active-state text-amber-400 border-amber-500/50' : 'skeuo-button text-slate-400'}`}
              >
                M
              </button>
              <button 
                onClick={() => updateTrack(track.id, { solo: !track.solo })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${track.solo ? 'active-state text-sky-400 border-sky-500/50' : 'skeuo-button text-slate-400'}`}
              >
                S
              </button>
              <button 
                onClick={() => updateTrack(track.id, { armed: !track.armed })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${track.armed ? 'active-state text-red-400 border-red-500/50' : 'skeuo-button text-slate-400'}`}
                title={track.inputType === 'midi' ? 'Arm MIDI Recording' : 'Arm Audio Recording'}
              >
                {track.inputType === 'midi' ? <Piano size={14} /> : <Mic size={14} />}
              </button>
              <label className="w-7 h-7 rounded-lg flex items-center justify-center skeuo-button text-slate-400 cursor-pointer transition-all">
                <Upload size={14} />
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, track.id)} 
                />
              </label>
            </div>
            
            <div className="flex items-center gap-3 skeuo-input px-3 py-2 rounded-xl mb-3">
              <Volume2 size={14} className="text-slate-400 shrink-0" />
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={track.volume}
                onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-sky-400"
              />
            </div>

            <EffectRack
              effects={track.effects}
              onAddEffect={(type) => addTrackEffect(track.id, type)}
              onUpdateEffect={(effectId, updates) => updateTrackEffect(track.id, effectId, updates)}
              onRemoveEffect={(effectId) => removeTrackEffect(track.id, effectId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
