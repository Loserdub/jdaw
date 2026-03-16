import { Play, Square, Circle, Rewind, FastForward, Repeat, Bell, Magnet } from 'lucide-react';
import { useDAWStore } from '../lib/store';
import { engine } from '../lib/engine';
import React, { useEffect, useState, useRef } from 'react';

export function Transport() {
  const { isPlaying, isRecording, setPlaying, setRecording, loopEnabled, setLoopEnabled, bpm, setBpm, metronomeEnabled, setMetronomeEnabled, snapToGrid, setSnapToGrid, duration, loopStart, loopEnd, setLoopRegion } = useDAWStore();
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

    const handleMouseUp = () => {
      setDraggingLoop(null);
    };

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
    if (isRecording) {
      setRecording(false);
    }
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

  return (
    <div className="flex items-center gap-6 text-slate-100">
      <div className="flex items-center gap-2">
        <button onClick={() => { engine.setPlayhead(0); setTime(0); }} className="p-2 skeuo-button rounded-xl text-slate-300">
          <Rewind size={20} />
        </button>
        <button onClick={handlePlay} className={`p-2 skeuo-button rounded-xl ${isPlaying && !isRecording ? 'active-state text-sky-400' : 'text-slate-300'}`}>
          <Play size={20} fill={isPlaying && !isRecording ? 'currentColor' : 'none'} />
        </button>
        <button onClick={handleStop} className="p-2 skeuo-button rounded-xl text-slate-300">
          <Square size={20} fill="currentColor" />
        </button>
        <button onClick={handleRecord} className={`p-2 skeuo-button rounded-xl ${isRecording ? 'active-state text-red-400 animate-pulse border-red-500/50' : 'text-red-400/70'}`}>
          <Circle size={20} fill="currentColor" />
        </button>
        
        <div className="w-px h-8 bg-white/10 mx-2" />
        
        <div className="flex items-center gap-3 skeuo-input px-3 py-2 rounded-xl">
          <button 
            onClick={() => setLoopEnabled(!loopEnabled)} 
            className={`p-1.5 rounded-lg transition-colors ${loopEnabled ? 'text-sky-400 bg-sky-400/10 shadow-[inset_0_0_8px_rgba(56,189,248,0.2)]' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle Loop"
          >
            <Repeat size={18} />
          </button>
          
          <div className="flex flex-col gap-1.5">
            <div 
              ref={loopSliderRef}
              className="relative w-36 h-3 bg-black/40 rounded-full border border-white/5 cursor-pointer shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]"
              onMouseDown={(e) => {
                if (!loopSliderRef.current) return;
                const rect = loopSliderRef.current.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const time = (x / rect.width) * duration;
                
                if (time < loopStart) {
                  setLoopRegion(time, loopEnd);
                  setDraggingLoop('start');
                } else if (time > loopEnd) {
                  setLoopRegion(loopStart, time);
                  setDraggingLoop('end');
                } else {
                  handleLoopDragStart(e, 'both');
                }
              }}
            >
              <div 
                className={`absolute top-0 bottom-0 ${loopEnabled ? 'bg-sky-500/40 border-sky-400/50' : 'bg-slate-600/40 border-slate-500/50'} border-x cursor-move rounded-full`}
                style={{
                  left: `${(loopStart / duration) * 100}%`,
                  width: `${((loopEnd - loopStart) / duration) * 100}%`
                }}
                onMouseDown={(e) => handleLoopDragStart(e, 'both')}
              >
                <div 
                  className={`absolute top-0 bottom-0 left-0 w-3 -ml-1.5 cursor-ew-resize rounded-full ${loopEnabled ? 'hover:bg-sky-400' : 'hover:bg-slate-400'}`}
                  onMouseDown={(e) => handleLoopDragStart(e, 'start')}
                />
                <div 
                  className={`absolute top-0 bottom-0 right-0 w-3 -mr-1.5 cursor-ew-resize rounded-full ${loopEnabled ? 'hover:bg-sky-400' : 'hover:bg-slate-400'}`}
                  onMouseDown={(e) => handleLoopDragStart(e, 'end')}
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 leading-none px-1">
              <span>{loopStart.toFixed(1)}s</span>
              <span>{loopEnd.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="font-mono text-3xl tracking-wider text-sky-400 skeuo-input px-6 py-2 rounded-xl drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]">
        {formatTime(time)}
      </div>
      
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-2 skeuo-input px-3 py-1.5 rounded-xl">
          <button 
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`p-1.5 rounded-lg transition-colors ${snapToGrid ? 'text-sky-400 bg-sky-400/10 shadow-[inset_0_0_8px_rgba(56,189,248,0.2)]' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle Snap to Grid"
          >
            <Magnet size={16} />
          </button>
          <div className="w-px h-5 bg-white/10" />
          <button 
            onClick={() => setMetronomeEnabled(!metronomeEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${metronomeEnabled ? 'text-sky-400 bg-sky-400/10 shadow-[inset_0_0_8px_rgba(56,189,248,0.2)]' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle Metronome"
          >
            <Bell size={16} />
          </button>
          <div className="w-px h-5 bg-white/10" />
          <input 
            type="number" 
            value={bpm} 
            onChange={(e) => setBpm(Math.max(20, Math.min(300, Number(e.target.value))))}
            className="w-12 bg-transparent text-slate-200 text-right focus:outline-none font-mono"
            min="20" max="300"
          />
          <span className="text-xs text-slate-500 font-medium tracking-wide">BPM</span>
        </div>
      </div>
    </div>
  );
}
