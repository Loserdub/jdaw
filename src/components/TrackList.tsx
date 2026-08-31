import React, { useState } from 'react';
import { useDAWStore } from '../lib/store';
import { Volume2, Mic, Trash2, Upload, Piano, Plus } from 'lucide-react';
import { EffectRack } from './EffectRack';
import { LevelMeter } from './LevelMeter';
import { importAudioFile } from '../lib/audioImport';

interface TrackListProps {
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function TrackList({ scrollRef, onScroll }: TrackListProps) {
  const { tracks, updateTrack, removeTrack, addTrack, selectedTrackId, setSelectedTrackId, toggleTrackAutomation } = useDAWStore();
  const [isDragOverTrackList, setIsDragOverTrackList] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importAudioFile(file, trackId, 0);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetTrackId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTrackList(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(
        f => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|aiff|weba)$/i.test(f.name)
      );

      for (let i = 0; i < files.length; i++) {
        const destTrackId = i === 0 ? targetTrackId : undefined;
        await importAudioFile(files[i], destTrackId, 0);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverTrackList(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTrackList(false);
  };

  return (
    <div
      className="w-full h-full flex flex-col relative"
      onDrop={(e) => handleDrop(e)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
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
        className="flex-1 overflow-y-auto no-scrollbar relative"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {tracks.map(track => (
          <div
            key={track.id}
            onClick={() => setSelectedTrackId(track.id)}
            onDrop={(e) => handleDrop(e, track.id)}
            onDragOver={handleDragOver}
            className={`border-b transition-all group flex flex-col cursor-pointer select-none ${
              selectedTrackId === track.id
                ? 'bg-amber-500/[0.05] border-l-2 border-l-amber-400 border-white/5'
                : 'bg-transparent hover:bg-white/[0.03] border-white/5'
            }`}
            style={{ height: track.showAutomation ? '224px' : '140px' }}
          >
            {/* Main track header (140px height) */}
            <div className="h-[140px] flex flex-col justify-between">
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

              {/* M / S / Arm / Auto / Upload buttons */}
              <div className="flex items-center gap-1.5 px-3 py-1" onClick={(e) => e.stopPropagation()}>
                {/* Mute */}
                <button
                  onClick={() => updateTrack(track.id, { muted: !track.muted })}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
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
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
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
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                    track.armed
                      ? 'bg-red-500/15 border border-red-500/35 text-red-400'
                      : 'skeuo-button text-zinc-500 hover:text-zinc-200'
                  }`}
                  title={track.inputType === 'midi' ? 'Arm MIDI Recording' : 'Arm Audio Recording'}
                >
                  {track.inputType === 'midi' ? <Piano size={12} /> : <Mic size={12} />}
                </button>
                {/* Automation Toggle */}
                <button
                  onClick={() => toggleTrackAutomation(track.id)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
                    track.showAutomation
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                      : 'skeuo-button text-zinc-500 hover:text-zinc-200'
                  }`}
                  title="Toggle Track Automation Lane"
                >
                  A
                </button>
                {/* Upload */}
                <label className="w-7 h-7 rounded-lg flex items-center justify-center skeuo-button text-zinc-500 hover:text-zinc-200 cursor-pointer transition-all" title="Upload audio">
                  <Upload size={12} />
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, track.id)}
                  />
                </label>
              </div>

              {/* Volume & Level Meter */}
              <div className="flex flex-col gap-1 mx-3 mb-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 skeuo-input px-2.5 py-1.5 rounded-xl">
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
                <div className="px-1">
                  <LevelMeter trackId={track.id} accentColor="amber" />
                </div>
              </div>
            </div>

            {/* Automation Lane sub-area in TrackList (84px height) */}
            {track.showAutomation && (
              <div className="h-[84px] border-t border-white/5 bg-black/40 px-3 py-2 flex flex-col justify-center gap-1">
                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                  Automation Lane
                </span>
                <span className="text-[8px] font-mono text-zinc-500">
                  Parameter: {track.activeAutomationParam || 'volume'}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Empty drop zone at bottom of tracklist */}
        <div
          onDrop={(e) => handleDrop(e)}
          onDragOver={handleDragOver}
          className="p-3 border-t border-dashed border-white/5 hover:border-amber-500/30 text-center transition-colors cursor-pointer"
          onClick={addTrack}
        >
          <span className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400">
            + Drop audio here or click to add track
          </span>
        </div>
      </div>

      {/* Drag Overlay Feedback */}
      {isDragOverTrackList && (
        <div className="absolute inset-0 bg-amber-500/10 backdrop-blur-xs border-2 border-dashed border-amber-400 flex flex-col items-center justify-center pointer-events-none z-50 rounded-2xl">
          <Upload size={24} className="text-amber-400 mb-1 animate-bounce" />
          <span className="text-xs font-bold text-amber-300">Drop audio to create track</span>
        </div>
      )}
    </div>
  );
}
