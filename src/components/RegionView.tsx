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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTrimming, setIsTrimming] = useState<'left' | 'right' | null>(null);
  const { snapToGrid, bpm, selectedRegionId, setSelectedRegionId, setSelectedTrackId, setActiveBottomTab } = useDAWStore();
  const secondsPerBeat = 60 / bpm;
  const isSelected = selectedRegionId === region.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTrackId(region.trackId);
    setSelectedRegionId(region.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTrackId(region.trackId);
    setSelectedRegionId(region.id);
    if (region.midiNotes !== undefined || !region.buffer) {
      setActiveBottomTab('pianoroll');
    }
  };

  const snapTime = (time: number) => {
    if (!snapToGrid) return time;
    let snapInterval: number;
    if (pixelsPerSecond < 35) {
      snapInterval = secondsPerBeat * 4; // 1 Bar
    } else if (pixelsPerSecond < 75) {
      snapInterval = secondsPerBeat; // 1 Beat (1/4 note)
    } else if (pixelsPerSecond < 160) {
      snapInterval = secondsPerBeat / 2; // 1/8 note
    } else if (pixelsPerSecond < 320) {
      snapInterval = secondsPerBeat / 4; // 1/16 note
    } else {
      snapInterval = secondsPerBeat / 8; // 1/32 note
    }
    return Math.round(time / snapInterval) * snapInterval;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.max(2, Math.floor(region.duration * pixelsPerSecond));
    const height = 124;

    canvas.width = width;
    canvas.height = height;

    if (region.buffer) {
      // Draw background
      ctx.fillStyle = 'rgba(245, 158, 11, 0.08)'; // amber tint
      ctx.fillRect(0, 0, width, height);

      // Centerline
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw Waveform
      const data = region.buffer.getChannelData(0);
      const step = data.length / width;
      const amp = (height / 2) * 0.92;
      const centerY = height / 2;

      ctx.fillStyle = 'rgba(245, 158, 11, 0.85)'; // amber-400

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

        if (max >= min) {
          const top = centerY + min * amp;
          const barHeight = Math.max(1.5, (max - min) * amp);
          ctx.fillRect(i, top, 1, barHeight);
        }
      }
    } else if (region.midiNotes) {
      // Draw MIDI background
      ctx.fillStyle = 'rgba(168, 85, 247, 0.08)'; // purple tint
      ctx.fillRect(0, 0, width, height);

      // Find min/max notes to scale vertically
      let minNote = 127;
      let maxNote = 0;
      region.midiNotes.forEach(n => {
        if (n.note < minNote) minNote = n.note;
        if (n.note > maxNote) maxNote = n.note;
      });

      minNote = Math.max(0, minNote - 3);
      maxNote = Math.min(127, maxNote + 3);
      const noteRange = Math.max(12, maxNote - minNote);

      region.midiNotes.forEach(n => {
        const x = n.start * pixelsPerSecond;
        const w = Math.max(3, n.duration * pixelsPerSecond);

        // Map note to y position
        const normalizedNote = (n.note - minNote) / noteRange;
        const y = height - (normalizedNote * (height - 12)) - 8;

        const velocityAlpha = Math.max(0.5, (n.velocity || 100) / 127);
        ctx.fillStyle = `rgba(192, 132, 252, ${velocityAlpha})`; // purple-400
        ctx.fillRect(x, y, w, 5);

        ctx.strokeStyle = 'rgba(243, 232, 255, 0.4)';
        ctx.strokeRect(x, y, w, 5);
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
      // Find the scrollable timeline container
      const timelineEl = containerRef.current?.closest('.overflow-auto') as HTMLElement | null;
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
  }, [isTrimming, region, pixelsPerSecond]);

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
      ref={containerRef}
      draggable
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onDragStart={handleDragStart}
      onContextMenu={(e) => onContextMenu?.(e, region.id)}
      className={`absolute top-2 h-[124px] border rounded-xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-md cursor-grab active:cursor-grabbing group transition-all select-none ${
        isSelected ? 'ring-2 ring-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : ''
      } ${
        region.buffer
          ? 'bg-amber-500/[0.07] border-amber-500/30 hover:border-amber-400/60'
          : 'bg-purple-500/[0.07] border-purple-500/30 hover:border-purple-400/60'
      }`}
      style={{
        left: `${region.start * pixelsPerSecond}px`,
        width: `${region.duration * pixelsPerSecond}px`
      }}
    >
      <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />

      {/* Badge */}
      <div className={`absolute top-0 left-0 px-2 py-0.5 text-[9px] font-mono font-semibold rounded-br-lg border-b border-r ${
        region.buffer
          ? 'text-amber-300 bg-amber-500/20 border-amber-500/30'
          : 'text-purple-300 bg-purple-500/20 border-purple-500/30'
      }`}>
        {region.buffer ? 'Audio' : 'MIDI'}
      </div>

      {/* Floating control bar on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md px-2 py-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity border-t border-white/10">
        <div className="flex items-center gap-1">
          <button onClick={(e) => handleNudge(e, -0.01)} className="p-0.5 hover:bg-white/10 rounded text-zinc-300 transition-colors" title="Nudge Left (10ms)">
            <ChevronLeft size={12} />
          </button>
          <input
            type="number"
            value={region.start.toFixed(3)}
            onChange={handleTimeChange}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            step="0.01"
            className="w-14 bg-black/60 text-[9px] font-mono text-center text-zinc-200 rounded border border-white/10 focus:border-amber-500/50 focus:outline-none py-0.5 tabular-nums"
          />
          <button onClick={(e) => handleNudge(e, 0.01)} className="p-0.5 hover:bg-white/10 rounded text-zinc-300 transition-colors" title="Nudge Right (10ms)">
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="absolute top-1.5 right-1.5 p-1 bg-black/50 backdrop-blur-md text-zinc-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80 hover:text-white border border-white/10 z-10"
        title="Delete Region"
      >
        <X size={11} />
      </button>

      {/* Left & Right Trim Handles */}
      <div
        className="absolute top-0 bottom-0 left-0 w-2.5 cursor-ew-resize hover:bg-amber-400/30 active:bg-amber-400/50 z-10"
        onMouseDown={(e) => { e.stopPropagation(); setIsTrimming('left'); }}
        title="Trim Start"
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-2.5 cursor-ew-resize hover:bg-amber-400/30 active:bg-amber-400/50 z-10"
        onMouseDown={(e) => { e.stopPropagation(); setIsTrimming('right'); }}
        title="Trim End"
      />
    </div>
  );
}
