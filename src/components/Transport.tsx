import { Play, Square, Circle, Rewind, Repeat, Bell, Magnet } from 'lucide-react';
import { useDAWStore } from '../lib/store';
import { engine } from '../lib/engine';
import React, { useEffect, useState, useRef } from 'react';

export function Transport() {
  const {
    isPlaying, isRecording, setPlaying, setRecording,
    loopEnabled, setLoopEnabled, bpm, setBpm,
    metronomeEnabled, setMetronomeEnabled,
    snapToGrid, setSnapToGrid,
    duration, loopStart, loopEnd, setLoopRegion
  } = useDAWStore();
  const [time, setTime] = useState(0);
  const [draggingLoop, setDraggingLoop] = useState<'start' | 'end' | 'both' | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const loopSliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (t: number) => setTime(t);
    engine.addPlayheadListener(listener);
    return () => engine.removePlayheadListener(listener);
  }, []);

  // Loop slider drag logic
  useEffect(() => {
    if (!draggingLoop) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!loopSliderRef.current) return;
      const rect = loopSliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;

      if (draggingLoop === 'start') {
        setLoopRegion(Math.min(time, loopEnd - 0.1), loopEnd);
      } else if (draggingLoop === 'end') {
        setLoopRegion(loopStart, Math.max(time, loopStart + 0.1));
      } else if (draggingLoop === 'both') {
        const loopDuration = loopEnd - loopStart;
        const newStart = Math.max(0, Math.min(time - dragOffset, duration - loopDuration));
        setLoopRegion(newStart, newStart + loopDuration);
      }
    };

    const handleMouseUp = () => setDraggingLoop(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLoop, loopStart, loopEnd, duration, setLoopRegion, dragOffset]);

  const handleLoopDragStart = (e: React.MouseEvent, type: 'start' | 'end' | 'both') => {
    e.stopPropagation();
    setDraggingLoop(type);
    if (type === 'both' && loopSliderRef.current) {
      const rect = loopSliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      setDragOffset(time - loopStart);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const handlePlay = () => {
    if (isPlaying) {
      engine.pause();
      setPlaying(false);
    } else {
      engine.play();
      setPlaying(true);
    }
  };

  const handleStop = () => {
    engine.stop();
    setPlaying(false);
    if (isRecording) setRecording(false);
    engine.setPlayhead(0);
    setTime(0);
  };

  const handleRecord = () => {
    if (isRecording) {
      engine.stop();
      setRecording(false);
    } else {
      const state = useDAWStore.getState();
      const armedTrack = state.tracks.find(t => t.armed);
      if (!armedTrack) {
        engine.play();
        setPlaying(true);
      } else {
        engine.startRecording();
      }
    }
  };

  /* ── Shared icon-button style ── */
  const iconBtn = (active = false, danger = false) =>
    `p-2 rounded-lg transition-all min-w-[36px] min-h-[36px] flex items-center justify-center skeuo-button ${
      active && danger
        ? 'bg-red-500/15 border-red-500/40 text-red-400 animate-pulse'
        : active
        ? 'active-state text-amber-400'
        : 'text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-zinc-100">
      {/* ── Playback controls ── */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { engine.setPlayhead(0); setTime(0); }}
          className={iconBtn()}
          title="Return to zero"
        >
          <Rewind size={16} />
        </button>
        <button
          onClick={handlePlay}
          className={iconBtn(isPlaying && !isRecording)}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Play size={16} fill={isPlaying && !isRecording ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={handleStop}
          className={iconBtn()}
          title="Stop"
        >
          <Square size={16} fill="currentColor" />
        </button>
        <button
          onClick={handleRecord}
          className={iconBtn(isRecording, true)}
          title={isRecording ? 'Stop recording' : 'Record'}
        >
          <Circle size={16} fill="currentColor" />
        </button>
      </div>

      {/* ── Time display ── */}
      <div
        className="font-mono text-lg md:text-xl tracking-widest text-amber-400 glow-amber skeuo-input px-3 py-1.5 rounded-xl tabular-nums shrink-0"
      >
        {formatTime(time)}
      </div>

      {/* ── Loop region ── */}
      <div className="flex items-center gap-2 skeuo-input px-2.5 py-1.5 rounded-xl">
        <button
          onClick={() => setLoopEnabled(!loopEnabled)}
          className={`p-1.5 rounded-md transition-colors ${loopEnabled ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Toggle Loop"
        >
          <Repeat size={14} />
        </button>

        <div className="flex flex-col gap-1">
          <div
            ref={loopSliderRef}
            className="relative w-28 md:w-36 h-2.5 bg-black/50 rounded-full border border-white/5 cursor-pointer"
            onMouseDown={(e) => {
              if (!loopSliderRef.current) return;
              const rect = loopSliderRef.current.getBoundingClientRect();
              const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
              const time = (x / rect.width) * duration;
              if (time < loopStart) {
                setLoopRegion(time, loopEnd); setDraggingLoop('start');
              } else if (time > loopEnd) {
                setLoopRegion(loopStart, time); setDraggingLoop('end');
              } else {
                handleLoopDragStart(e, 'both');
              }
            }}
          >
            <div
              className={`absolute top-0 bottom-0 rounded-full border-x cursor-move ${
                loopEnabled ? 'bg-amber-500/30 border-amber-400/50' : 'bg-zinc-600/30 border-zinc-500/40'
              }`}
              style={{
                left: `${(loopStart / duration) * 100}%`,
                width: `${((loopEnd - loopStart) / duration) * 100}%`
              }}
              onMouseDown={(e) => handleLoopDragStart(e, 'both')}
            >
              <div
                className={`absolute top-0 bottom-0 left-0 w-3 -ml-1.5 cursor-ew-resize rounded-full ${loopEnabled ? 'hover:bg-amber-400' : 'hover:bg-zinc-400'}`}
                onMouseDown={(e) => handleLoopDragStart(e, 'start')}
              />
              <div
                className={`absolute top-0 bottom-0 right-0 w-3 -mr-1.5 cursor-ew-resize rounded-full ${loopEnabled ? 'hover:bg-amber-400' : 'hover:bg-zinc-400'}`}
                onMouseDown={(e) => handleLoopDragStart(e, 'end')}
              />
            </div>
          </div>
          <div className="flex justify-between text-[9px] font-mono text-zinc-500 px-0.5">
            <span>{loopStart.toFixed(1)}s</span>
            <span>{loopEnd.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* ── Snap / Metronome / BPM ── */}
      <div className="flex items-center gap-2 skeuo-input px-2.5 py-1.5 rounded-xl">
        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={`p-1.5 rounded-md transition-colors ${snapToGrid ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Snap to Grid"
        >
          <Magnet size={14} />
        </button>
        <div className="w-px h-4 bg-white/8" />
        <button
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          className={`p-1.5 rounded-md transition-colors ${metronomeEnabled ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Metronome"
        >
          <Bell size={14} />
        </button>
        <div className="w-px h-4 bg-white/8" />
        <input
          type="number"
          value={bpm}
          onChange={(e) => setBpm(Math.max(20, Math.min(300, Number(e.target.value))))}
          className="w-11 bg-transparent text-zinc-200 text-right focus:outline-none font-mono text-sm tabular-nums"
          min="20" max="300"
        />
        <span className="text-[10px] text-zinc-500 font-semibold tracking-wider">BPM</span>
      </div>
    </div>
  );
}
