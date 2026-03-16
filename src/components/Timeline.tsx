import React, { useEffect, useRef, useState } from 'react';
import { useDAWStore } from '../lib/store';
import { engine } from '../lib/engine';
import { RegionView } from './RegionView';

interface TimelineProps {
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function Timeline({ scrollRef, onScroll }: TimelineProps) {
  const { tracks, regions, duration, loopEnabled, loopStart, loopEnd, setLoopRegion, isPlaying, isRecording, recordStartTime, bpm, splitRegion, joinRegions, clipboardRegion, setClipboardRegion, addRegion, snapToGrid } = useDAWStore();
  const [playheadPos, setPlayheadPos] = useState(0);
  const [draggingLoop, setDraggingLoop] = useState<'start' | 'end' | 'both' | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    regionId?: string;
    trackId?: string;
    time: number;
  } | null>(null);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  
  // Use either the provided scrollRef or the internal one
  const containerRef = scrollRef || internalContainerRef;
  const PIXELS_PER_SECOND = 100; // Zoom level

  const secondsPerBeat = 60 / bpm;
  const pixelsPerBeat = secondsPerBeat * PIXELS_PER_SECOND;
  const totalBeats = Math.ceil(duration / secondsPerBeat);
  const armedTrackId = tracks.find(t => t.armed)?.id;
  const playheadTime = playheadPos / PIXELS_PER_SECOND;

  const snapTime = (time: number) => {
    if (!snapToGrid) return time;
    const snapInterval = secondsPerBeat / 4; // 16th note snapping
    return Math.round(time / snapInterval) * snapInterval;
  };

  useEffect(() => {
    const listener = (time: number) => {
      setPlayheadPos(time * PIXELS_PER_SECOND);
    };
    engine.addPlayheadListener(listener);
    return () => engine.removePlayheadListener(listener);
  }, []);

  useEffect(() => {
    if (!draggingLoop) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const time = Math.max(0, x / PIXELS_PER_SECOND);

      if (draggingLoop === 'start') {
        setLoopRegion(Math.min(time, loopEnd - 0.1), loopEnd);
      } else if (draggingLoop === 'end') {
        setLoopRegion(loopStart, Math.max(time, loopStart + 0.1));
      } else if (draggingLoop === 'both') {
        const loopDuration = loopEnd - loopStart;
        const newStart = Math.max(0, time - dragOffset);
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
  }, [draggingLoop, loopStart, loopEnd, dragOffset, setLoopRegion]);

  const handleLoopDragStart = (e: React.MouseEvent, type: 'start' | 'end' | 'both') => {
    e.stopPropagation();
    setDraggingLoop(type);
    if (type === 'both') {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const time = Math.max(0, x / PIXELS_PER_SECOND);
      setDragOffset(time - loopStart);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    let time = Math.max(0, x / PIXELS_PER_SECOND);
    time = snapTime(time);
    engine.setPlayhead(time);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleRegionContextMenu = (e: React.MouseEvent, regionId: string, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const time = Math.max(0, x / PIXELS_PER_SECOND);
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      regionId,
      trackId,
      time
    });
  };

  const handleTrackContextMenu = (e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const time = Math.max(0, x / PIXELS_PER_SECOND);
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      trackId,
      time
    });
  };

  const handleSplit = () => {
    if (contextMenu?.regionId) {
      splitRegion(contextMenu.regionId, contextMenu.time);
    }
  };

  const handleCopy = () => {
    if (contextMenu?.regionId) {
      const region = regions.find(r => r.id === contextMenu.regionId);
      if (region) setClipboardRegion(region);
    }
  };

  const handlePaste = () => {
    if (clipboardRegion && contextMenu?.trackId) {
      addRegion({
        ...clipboardRegion,
        id: Math.random().toString(36).substring(2, 9),
        trackId: contextMenu.trackId,
        start: contextMenu.time
      });
    }
  };

  const handleJoin = () => {
    if (contextMenu?.regionId) {
      const region = regions.find(r => r.id === contextMenu.regionId);
      if (!region) return;
      
      const trackRegions = regions.filter(r => r.trackId === region.trackId).sort((a, b) => a.start - b.start);
      const currentIndex = trackRegions.findIndex(r => r.id === region.id);
      
      if (currentIndex !== -1 && currentIndex < trackRegions.length - 1) {
        const nextRegion = trackRegions[currentIndex + 1];
        joinRegions(region.id, nextRegion.id);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, trackId: string) => {
    e.preventDefault();
    const regionId = e.dataTransfer.getData('text/plain');
    const offsetStr = e.dataTransfer.getData('text/offset');
    if (!regionId) return;
    
    const offsetX = offsetStr ? parseFloat(offsetStr) : 0;
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft - offsetX;
    let newStart = Math.max(0, x / PIXELS_PER_SECOND);
    
    newStart = snapTime(newStart);
    
    useDAWStore.getState().updateRegion(regionId, { trackId, start: newStart });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="w-full h-full overflow-auto relative" ref={containerRef} onScroll={onScroll}>
      {/* Ruler */}
      <div 
        className="h-10 bg-white/5 border-b border-white/10 sticky top-0 z-20 relative backdrop-blur-md"
        style={{ width: `${duration * PIXELS_PER_SECOND}px` }}
        onClick={handleTimelineClick}
      >
        {Array.from({ length: totalBeats }).map((_, i) => (
          <div 
            key={i} 
            className="absolute top-0 bottom-0 border-l border-white/10" 
            style={{ left: `${i * pixelsPerBeat}px` }}
          >
            <span className={`absolute top-2 left-1.5 text-[10px] font-mono ${i % 4 === 0 ? 'text-slate-300 font-bold' : 'text-slate-500'}`}>
              {i % 4 === 0 ? Math.floor(i / 4) + 1 : ''}
            </span>
          </div>
        ))}
        
        {/* Loop Region Indicator in Ruler */}
        {loopEnabled && (
          <div 
            className="absolute top-0 h-5 bg-sky-500/20 border-x-2 border-sky-400 cursor-move shadow-[inset_0_0_8px_rgba(56,189,248,0.2)]"
            style={{ 
              left: `${loopStart * PIXELS_PER_SECOND}px`, 
              width: `${(loopEnd - loopStart) * PIXELS_PER_SECOND}px` 
            }}
            onMouseDown={(e) => handleLoopDragStart(e, 'both')}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="absolute top-0 bottom-0 left-0 w-2 -ml-1 cursor-ew-resize hover:bg-sky-400/50"
              onMouseDown={(e) => handleLoopDragStart(e, 'start')}
            />
            <div 
              className="absolute top-0 bottom-0 right-0 w-2 -mr-1 cursor-ew-resize hover:bg-sky-400/50"
              onMouseDown={(e) => handleLoopDragStart(e, 'end')}
            />
          </div>
        )}
      </div>

      {/* Tracks Area */}
      <div className="relative" style={{ width: `${duration * PIXELS_PER_SECOND}px` }}>
        {/* Loop Background Overlay */}
        {loopEnabled && (
          <div 
            className="absolute top-0 bottom-0 bg-sky-500/5 border-x border-sky-500/30 pointer-events-none z-10"
            style={{ 
              left: `${loopStart * PIXELS_PER_SECOND}px`, 
              width: `${(loopEnd - loopStart) * PIXELS_PER_SECOND}px` 
            }}
          />
        )}
        
        {tracks.map(track => (
          <div 
            key={track.id} 
            className="border-b border-white/5 bg-white/[0.01] relative group"
            style={{ height: `${200 + (track.effects.length * 180)}px` }}
            onDrop={(e) => handleDrop(e, track.id)}
            onDragOver={handleDragOver}
            onContextMenu={(e) => handleTrackContextMenu(e, track.id)}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              {Array.from({ length: totalBeats }).map((_, i) => (
                <div 
                  key={i} 
                  className={`absolute top-0 bottom-0 border-l ${i % 4 === 0 ? 'border-slate-500' : 'border-slate-700'}`} 
                  style={{ left: `${i * pixelsPerBeat}px` }} 
                />
              ))}
            </div>
            
            {/* Regions */}
            {regions.filter(r => r.trackId === track.id).map(region => (
              <RegionView 
                key={region.id} 
                region={region} 
                pixelsPerSecond={PIXELS_PER_SECOND} 
                onContextMenu={(e, regionId) => handleRegionContextMenu(e, regionId, track.id)}
              />
            ))}

            {/* Real-time recording region */}
            {isRecording && armedTrackId === track.id && playheadTime > recordStartTime && (
              <div 
                className="absolute top-2 h-[132px] bg-red-500/20 border border-red-500/50 rounded-xl overflow-hidden shadow-[inset_0_0_12px_rgba(239,68,68,0.2)] z-10 backdrop-blur-sm"
                style={{
                  left: `${recordStartTime * PIXELS_PER_SECOND}px`,
                  width: `${(playheadTime - recordStartTime) * PIXELS_PER_SECOND}px`
                }}
              >
                <div className="absolute top-0 left-0 px-2 py-1 text-[10px] font-mono text-red-200 bg-red-500/40 rounded-br-lg backdrop-blur-md">
                  Recording...
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Playhead */}
        <div 
          className={`absolute top-0 bottom-0 w-px z-30 pointer-events-none transition-shadow duration-100 ${
            isRecording ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 
            isPlaying ? 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]' : 
            'bg-sky-500 shadow-[0_0_5px_rgba(14,165,233,0.3)]'
          }`}
          style={{ transform: `translateX(${playheadPos}px)` }}
        >
          <div className={`absolute -top-3 -left-2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] ${
            isRecording ? 'border-t-red-500' : 
            isPlaying ? 'border-t-sky-400' : 
            'border-t-sky-500'
          }`} />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#1e293b] border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px] text-sm text-slate-200"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.regionId ? (
            <>
              <button 
                className="w-full text-left px-4 py-2 hover:bg-sky-500/20 hover:text-sky-300 transition-colors"
                onClick={() => { handleSplit(); setContextMenu(null); }}
              >
                Split at Playhead/Cursor
              </button>
              <button 
                className="w-full text-left px-4 py-2 hover:bg-sky-500/20 hover:text-sky-300 transition-colors"
                onClick={() => { handleJoin(); setContextMenu(null); }}
              >
                Join with Next
              </button>
              <div className="h-px bg-white/10 my-1" />
              <button 
                className="w-full text-left px-4 py-2 hover:bg-sky-500/20 hover:text-sky-300 transition-colors"
                onClick={() => { handleCopy(); setContextMenu(null); }}
              >
                Copy
              </button>
            </>
          ) : null}
          
          <button 
            className={`w-full text-left px-4 py-2 transition-colors ${clipboardRegion ? 'hover:bg-sky-500/20 hover:text-sky-300' : 'opacity-50 cursor-not-allowed'}`}
            onClick={() => { if (clipboardRegion) { handlePaste(); setContextMenu(null); } }}
            disabled={!clipboardRegion}
          >
            Paste
          </button>
        </div>
      )}
    </div>
  );
}
