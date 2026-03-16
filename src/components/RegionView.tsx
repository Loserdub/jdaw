import React, { useEffect, useRef, useState } from 'react';
import { Region, useDAWStore } from '../lib/store';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface RegionViewProps {
  key?: React.Key;
  region: Region;
  pixelsPerSecond: number;
  onContextMenu?: (e: React.MouseEvent, regionId: string) => void;
}

export function RegionView({ region, pixelsPerSecond, onContextMenu }: RegionViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTrimming, setIsTrimming] = useState<'left' | 'right' | null>(null);
  const { snapToGrid, bpm } = useDAWStore();
  const secondsPerBeat = 60 / bpm;
  
  const snapTime = (time: number) => {
    if (!snapToGrid) return time;
    const snapInterval = secondsPerBeat / 4;
    return Math.round(time / snapInterval) * snapInterval;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = region.duration * pixelsPerSecond;
    const height = 132; // Updated to match new track height (148px - 16px padding)
    
    canvas.width = width;
    canvas.height = height;

    if (region.buffer) {
      // Draw background
      ctx.fillStyle = 'rgba(14, 165, 233, 0.15)'; // sky-500/15
      ctx.fillRect(0, 0, width, height);
      
      // Draw waveform
      const data = region.buffer.getChannelData(0);
      const step = data.length / width;
      const amp = height / 2;
      
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)'; // sky-400
      ctx.beginPath();
      
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        const startIdx = Math.floor(i * step);
        const endIdx = Math.floor((i + 1) * step);
        
        for (let j = startIdx; j < endIdx && j < data.length; j++) {
          const datum = data[j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }
    } else if (region.midiNotes) {
      // Draw MIDI background
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'; // indigo-500/15
      ctx.fillRect(0, 0, width, height);
      
      // Draw MIDI notes
      ctx.fillStyle = 'rgba(129, 140, 248, 0.9)'; // indigo-400
      
      // Find min/max notes to scale vertically
      let minNote = 127;
      let maxNote = 0;
      region.midiNotes.forEach(n => {
        if (n.note < minNote) minNote = n.note;
        if (n.note > maxNote) maxNote = n.note;
      });
      
      // Add some padding to note range
      minNote = Math.max(0, minNote - 4);
      maxNote = Math.min(127, maxNote + 4);
      const noteRange = Math.max(12, maxNote - minNote);
      
      region.midiNotes.forEach(n => {
        const x = n.start * pixelsPerSecond;
        const w = Math.max(2, n.duration * pixelsPerSecond);
        
        // Map note to y position (higher note = lower y)
        const normalizedNote = (n.note - minNote) / noteRange;
        const y = height - (normalizedNote * height) - 4; // 4px height per note
        
        ctx.fillRect(x, y, w, 4);
      });
    }
  }, [region, pixelsPerSecond]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (isTrimming) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', region.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    e.dataTransfer.setData('text/offset', offsetX.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  useEffect(() => {
    if (!isTrimming) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the timeline container to get relative coordinates
      const timelineEl = document.querySelector('.overflow-x-auto');
      if (!timelineEl) return;
      
      const rect = timelineEl.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineEl.scrollLeft;
      let time = Math.max(0, x / pixelsPerSecond);
      time = snapTime(time);

      if (isTrimming === 'left') {
        const maxStart = region.start + region.duration - 0.1;
        const newStart = Math.min(time, maxStart);
        const diff = newStart - region.start;
        
        if (diff !== 0) {
          const newDuration = region.duration - diff;
          const newBufferOffset = (region.bufferOffset || 0) + diff;
          useDAWStore.getState().trimRegion(region.id, newStart, newDuration, newBufferOffset);
        }
      } else if (isTrimming === 'right') {
        const minDuration = 0.1;
        const newDuration = Math.max(minDuration, time - region.start);
        useDAWStore.getState().trimRegion(region.id, region.start, newDuration);
      }
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTrimming, region, pixelsPerSecond, snapTime]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    useDAWStore.getState().removeRegion(region.id);
  };

  const handleNudge = (e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    const newStart = Math.max(0, region.start + amount);
    useDAWStore.getState().updateRegion(region.id, { start: newStart });
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = Math.max(0, parseFloat(e.target.value) || 0);
    useDAWStore.getState().updateRegion(region.id, { start: newStart });
  };

  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onContextMenu={(e) => onContextMenu?.(e, region.id)}
      className={`absolute top-2 h-[132px] border rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md cursor-grab active:cursor-grabbing group transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${region.buffer ? 'bg-sky-500/10 border-sky-400/30 hover:border-sky-400/60' : 'bg-indigo-500/10 border-indigo-400/30 hover:border-indigo-400/60'}`}
      style={{
        left: `${region.start * pixelsPerSecond}px`,
        width: `${region.duration * pixelsPerSecond}px`
      }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className={`absolute top-0 left-0 px-2 py-1 text-[10px] font-mono font-medium rounded-br-lg backdrop-blur-md border-b border-r ${region.buffer ? 'text-sky-200 bg-sky-500/30 border-sky-400/30' : 'text-indigo-200 bg-indigo-500/30 border-indigo-400/30'}`}>
        {region.buffer ? 'Audio' : 'MIDI'}
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-md p-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity border-t border-white/10">
        <div className="flex items-center gap-1">
          <button onClick={(e) => handleNudge(e, -0.01)} className="p-1 hover:bg-white/10 rounded-md text-slate-300 transition-colors" title="Nudge Left (10ms)">
            <ChevronLeft size={14} />
          </button>
          <input 
            type="number" 
            value={region.start.toFixed(3)} 
            onChange={handleTimeChange}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            step="0.01"
            className={`w-16 bg-black/50 text-[10px] font-mono text-center text-slate-200 rounded-md border border-white/10 focus:outline-none py-0.5 ${region.buffer ? 'focus:border-sky-400/50' : 'focus:border-indigo-400/50'}`}
          />
          <button onClick={(e) => handleNudge(e, 0.01)} className="p-1 hover:bg-white/10 rounded-md text-slate-300 transition-colors" title="Nudge Right (10ms)">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <button 
        onClick={handleDelete}
        className="absolute top-2 right-2 p-1 bg-black/40 backdrop-blur-md text-slate-300 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80 hover:text-white border border-white/10 z-10"
      >
        <X size={12} />
      </button>
      
      {/* Trim Handles */}
      <div 
        className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
        onMouseDown={(e) => { e.stopPropagation(); setIsTrimming('left'); }}
      />
      <div 
        className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
        onMouseDown={(e) => { e.stopPropagation(); setIsTrimming('right'); }}
      />
    </div>
  );
}
