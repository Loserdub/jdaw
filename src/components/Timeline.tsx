import React, { useEffect, useRef, useState } from 'react';
import { useDAWStore } from '../lib/store';
import { engine } from '../lib/engine';
import { RegionView } from './RegionView';
import { ZoomIn, ZoomOut, Maximize2, Upload, LocateFixed } from 'lucide-react';
import { importAudioFile } from '../lib/audioImport';
import { AutomationLane } from './AutomationLane';

interface TimelineProps {
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function Timeline({ scrollRef, onScroll }: TimelineProps) {
  const {
    tracks, regions, duration, loopEnabled, loopStart, loopEnd, setLoopRegion,
    isPlaying, isRecording, recordStartTime, bpm,
    splitRegion, joinRegions, clipboardRegion, setClipboardRegion, addRegion, snapToGrid,
    zoom, setZoom, zoomIn, zoomOut, zoomToFit,
    followPlayhead, toggleFollowPlayhead
  } = useDAWStore();

  const [playheadTime, setPlayheadTime] = useState(0);
  const [draggingLoop, setDraggingLoop] = useState<'start' | 'end' | 'both' | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragOverTimeline, setIsDragOverTimeline] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    regionId?: string;
    trackId?: string;
    time: number;
  } | null>(null);

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef || internalContainerRef;

  const secondsPerBeat = 60 / bpm;
  const pixelsPerBeat = secondsPerBeat * zoom;
  const pixelsPerBar = pixelsPerBeat * 4;
  const totalBeats = Math.ceil(duration / secondsPerBeat);
  const totalBars = Math.ceil(totalBeats / 4);
  const armedTrackId = tracks.find(t => t.armed)?.id;
  const playheadPos = playheadTime * zoom;

  // Dynamic bar numbering interval and subdivision tiers based on zoom
  let barInterval = 1;
  if (pixelsPerBar < 25) {
    barInterval = 16;
  } else if (pixelsPerBar < 45) {
    barInterval = 8;
  } else if (pixelsPerBar < 80) {
    barInterval = 4;
  } else if (pixelsPerBar < 140) {
    barInterval = 2;
  } else {
    barInterval = 1;
  }

  const showBeatLines = pixelsPerBeat >= 25;
  const showSubBeats = pixelsPerBeat >= 90;

  // Adaptive Grid Snapping depending on current Zoom level
  const snapTime = (time: number) => {
    if (!snapToGrid) return time;
    let snapInterval: number;
    if (zoom < 35) {
      snapInterval = secondsPerBeat * 4; // 1 Bar
    } else if (zoom < 75) {
      snapInterval = secondsPerBeat; // 1 Beat (1/4 note)
    } else if (zoom < 160) {
      snapInterval = secondsPerBeat / 2; // 1/8 note
    } else if (zoom < 320) {
      snapInterval = secondsPerBeat / 4; // 1/16 note
    } else {
      snapInterval = secondsPerBeat / 8; // 1/32 note
    }
    return Math.round(time / snapInterval) * snapInterval;
  };

  // Playhead listener & Page Follow (bounces to next section when hitting edge)
  useEffect(() => {
    const listener = (time: number) => {
      setPlayheadTime(time);

      if (followPlayhead && (useDAWStore.getState().isPlaying || useDAWStore.getState().isRecording)) {
        const container = containerRef.current;
        if (!container) return;

        const currentZoom = useDAWStore.getState().zoom;
        const playheadX = time * currentZoom;
        const scrollLeft = container.scrollLeft;
        const clientWidth = container.clientWidth;

        // If playhead crosses past the right edge (or jumps before the left edge)
        if (playheadX >= scrollLeft + clientWidth - 4) {
          // Bounce to next section with a 32px breathing room margin on the left
          container.scrollLeft = playheadX - 32;
        } else if (playheadX < scrollLeft - 10) {
          // Looped or jumped backwards: reposition view to current playhead
          container.scrollLeft = Math.max(0, playheadX - 32);
        }
      }
    };
    engine.addPlayheadListener(listener);
    return () => engine.removePlayheadListener(listener);
  }, [followPlayhead, containerRef]);

  // Wheel Zoom (Ctrl + Wheel or Alt + Wheel or Trackpad Pinch)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const scrollLeft = container.scrollLeft;
        const currentZoom = useDAWStore.getState().zoom;
        const timeAtMouse = (scrollLeft + mouseX) / currentZoom;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = Math.max(15, Math.min(600, Math.round(currentZoom * zoomFactor)));

        if (newZoom !== currentZoom) {
          useDAWStore.getState().setZoom(newZoom);
          requestAnimationFrame(() => {
            if (container) {
              container.scrollLeft = Math.max(0, timeAtMouse * newZoom - mouseX);
            }
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef]);

  // Touch Pinch-to-Zoom (Mobile & Tablets)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let initialDistance: number | null = null;
    let initialZoom = 100;
    let initialMidpointTime = 0;
    let initialMidpointX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        initialZoom = useDAWStore.getState().zoom;
        const rect = container.getBoundingClientRect();
        initialMidpointX = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
        initialMidpointTime = (container.scrollLeft + initialMidpointX) / initialZoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        const scale = currentDistance / initialDistance;
        const newZoom = Math.max(15, Math.min(600, Math.round(initialZoom * scale)));

        if (newZoom !== useDAWStore.getState().zoom) {
          useDAWStore.getState().setZoom(newZoom);
          container.scrollLeft = Math.max(0, initialMidpointTime * newZoom - initialMidpointX);
        }
      }
    };

    const handleTouchEnd = () => {
      initialDistance = null;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef]);

  // Loop Drag Handling
  useEffect(() => {
    if (!draggingLoop) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const time = Math.max(0, x / zoom);

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

    const handleMouseUp = () => setDraggingLoop(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLoop, loopStart, loopEnd, dragOffset, setLoopRegion, zoom, containerRef]);

  const handleLoopDragStart = (e: React.MouseEvent, type: 'start' | 'end' | 'both') => {
    e.stopPropagation();
    setDraggingLoop(type);
    if (type === 'both') {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const time = Math.max(0, x / zoom);
      setDragOffset(time - loopStart);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    let time = Math.max(0, x / zoom);
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
    const time = Math.max(0, x / zoom);

    setContextMenu({ x: e.clientX, y: e.clientY, regionId, trackId, time });
  };

  const handleTrackContextMenu = (e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const time = Math.max(0, x / zoom);

    setContextMenu({ x: e.clientX, y: e.clientY, trackId, time });
  };

  const handleSplit = () => {
    if (contextMenu?.regionId) splitRegion(contextMenu.regionId, contextMenu.time);
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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, trackId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTimeline(false);

    // 1. External files dropped
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(
        f => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|aiff|weba)$/i.test(f.name)
      );

      if (files.length > 0) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft;
        const dropTime = snapTime(Math.max(0, x / zoom));

        for (let i = 0; i < files.length; i++) {
          const destTrackId = i === 0 ? trackId : undefined;
          await importAudioFile(files[i], destTrackId, dropTime);
        }
        return;
      }
    }

    // 2. Moving existing region between tracks
    const regionId = e.dataTransfer.getData('text/plain');
    const offsetStr = e.dataTransfer.getData('text/offset');
    if (!regionId) return;

    const offsetX = offsetStr ? parseFloat(offsetStr) : 0;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft - offsetX;
    let newStart = Math.max(0, x / zoom);
    newStart = snapTime(newStart);

    if (trackId) {
      useDAWStore.getState().updateRegion(regionId, { trackId, start: newStart });
    } else {
      // Dropped on empty timeline space -> create new track for this region
      const state = useDAWStore.getState();
      const region = state.regions.find(r => r.id === regionId);
      if (region) {
        const newTrackId = Math.random().toString(36).substring(2, 9);
        const originalTrack = state.tracks.find(t => t.id === region.trackId);
        const newTrackName = originalTrack ? `${originalTrack.name} (Copy)` : `Audio ${state.tracks.length + 1}`;

        useDAWStore.setState(prev => ({
          tracks: [
            ...prev.tracks,
            {
              id: newTrackId,
              name: newTrackName,
              volume: 0.8,
              pan: 0,
              muted: false,
              solo: false,
              armed: false,
              inputType: region.buffer ? 'file' : 'midi',
              effects: [],
              sends: [],
              synthSettings: { oscillatorType: 'square', attack: 0.01, release: 0.1 }
            }
          ],
          selectedTrackId: newTrackId
        }));

        useDAWStore.getState().updateRegion(regionId, { trackId: newTrackId, start: newStart });
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && !isDragOverTimeline) {
      setIsDragOverTimeline(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTimeline(false);
  };

  const handleFit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (containerRef.current) {
      zoomToFit(containerRef.current.clientWidth);
    }
  };

  return (
    <div
      className="w-full h-full overflow-auto relative select-none"
      ref={containerRef}
      onScroll={onScroll}
      onDrop={(e) => handleDrop(e)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Ruler ── */}
      <div
        className="h-9 bg-white/[0.03] border-b border-white/7 sticky top-0 z-20 relative cursor-pointer"
        style={{ width: `${duration * zoom}px` }}
        onClick={handleTimelineClick}
      >
        {/* Adaptive Bar and Beat Markers */}
        {Array.from({ length: totalBars }).map((_, barIdx) => {
          const barNum = barIdx + 1;
          const isMajor = (barNum - 1) % barInterval === 0;
          const barLeft = barIdx * pixelsPerBar;

          return (
            <React.Fragment key={barIdx}>
              {/* Bar line & number */}
              <div
                className={`absolute top-0 bottom-0 border-l ${isMajor ? 'border-white/20' : 'border-white/5'}`}
                style={{ left: `${barLeft}px` }}
              >
                {isMajor && (
                  <span className="absolute top-1.5 left-1 text-[9px] font-mono select-none font-semibold text-zinc-300 pointer-events-none">
                    {barNum}
                  </span>
                )}
              </div>

              {/* Sub-beats inside bar */}
              {showBeatLines && [1, 2, 3].map((beatOffset) => (
                <div
                  key={beatOffset}
                  className="absolute top-4 bottom-0 border-l border-white/5 pointer-events-none"
                  style={{ left: `${barLeft + beatOffset * pixelsPerBeat}px` }}
                >
                  {showSubBeats && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] font-mono select-none text-zinc-600">
                      {barNum}.{beatOffset + 1}
                    </span>
                  )}
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {/* Loop region indicator in ruler */}
        {loopEnabled && (
          <div
            className="absolute top-0 h-5 bg-amber-500/15 border-x-2 border-amber-400/60 cursor-move"
            style={{
              left: `${loopStart * zoom}px`,
              width: `${(loopEnd - loopStart) * zoom}px`
            }}
            onMouseDown={(e) => handleLoopDragStart(e, 'both')}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute top-0 bottom-0 left-0 w-2 -ml-1 cursor-ew-resize hover:bg-amber-400/40"
              onMouseDown={(e) => handleLoopDragStart(e, 'start')}
            />
            <div
              className="absolute top-0 bottom-0 right-0 w-2 -mr-1 cursor-ew-resize hover:bg-amber-400/40"
              onMouseDown={(e) => handleLoopDragStart(e, 'end')}
            />
          </div>
        )}
      </div>

      {/* ── Tracks area ── */}
      <div className="relative" style={{ width: `${duration * zoom}px` }}>
        {/* Loop background overlay */}
        {loopEnabled && (
          <div
            className="absolute top-0 bottom-0 bg-amber-500/[0.04] border-x border-amber-500/20 pointer-events-none z-10"
            style={{
              left: `${loopStart * zoom}px`,
              width: `${(loopEnd - loopStart) * zoom}px`
            }}
          />
        )}

        {tracks.map(track => (
          <div
            key={track.id}
            className="border-b border-white/5 bg-white/[0.01] relative flex flex-col"
            style={{ height: track.showAutomation ? '224px' : '140px' }}
          >
            {/* Top track clips row (140px height) */}
            <div
              className="relative w-full h-[140px] shrink-0"
              onDrop={(e) => handleDrop(e, track.id)}
              onDragOver={handleDragOver}
              onContextMenu={(e) => handleTrackContextMenu(e, track.id)}
            >
              {/* Adaptive Grid lines inside track */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                {Array.from({ length: totalBars }).map((_, barIdx) => {
                  const barLeft = barIdx * pixelsPerBar;
                  const isMajor = (barIdx) % barInterval === 0;

                  return (
                    <React.Fragment key={barIdx}>
                      <div
                        className={`absolute top-0 bottom-0 border-l ${isMajor ? 'border-zinc-500' : 'border-zinc-700'}`}
                        style={{ left: `${barLeft}px` }}
                      />
                      {showBeatLines && [1, 2, 3].map((beatOffset) => (
                        <div
                          key={beatOffset}
                          className="absolute top-0 bottom-0 border-l border-zinc-800"
                          style={{ left: `${barLeft + beatOffset * pixelsPerBeat}px` }}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Regions */}
              {regions.filter(r => r.trackId === track.id).map(region => (
                <RegionView
                  key={region.id}
                  region={region}
                  pixelsPerSecond={zoom}
                  onContextMenu={(e, regionId) => handleRegionContextMenu(e, regionId, track.id)}
                />
              ))}

              {/* Real-time recording region */}
              {isRecording && armedTrackId === track.id && playheadTime > recordStartTime && (
                <div
                  className="absolute top-2 h-[124px] bg-red-500/15 border border-red-500/40 rounded-xl overflow-hidden z-10"
                  style={{
                    left: `${recordStartTime * zoom}px`,
                    width: `${(playheadTime - recordStartTime) * zoom}px`
                  }}
                >
                  <div className="absolute top-0 left-0 px-2 py-0.5 text-[9px] font-mono text-red-300 bg-red-500/30 rounded-br-lg">
                    REC
                  </div>
                </div>
              )}
            </div>

            {/* Automation Lane (84px height) */}
            {track.showAutomation && (
              <div className="w-full shrink-0">
                <AutomationLane
                  track={track}
                  zoom={zoom}
                  duration={duration}
                  playheadTime={playheadTime}
                  snapTime={snapTime}
                />
              </div>
            )}
          </div>
        ))}

        {/* ── Empty drop zone below tracks to create new track or move region ── */}
        <div
          className="h-28 border-b border-dashed border-white/5 hover:border-amber-500/30 transition-colors flex items-center justify-center text-zinc-600 text-xs gap-2 select-none cursor-pointer"
          onDrop={(e) => handleDrop(e)}
          onDragOver={handleDragOver}
          onClick={() => useDAWStore.getState().addTrack()}
        >
          <Upload size={13} className="text-zinc-600" />
          <span className="text-[10px] font-mono text-zinc-500">
            + Drop audio file or region here to create a new track
          </span>
        </div>

        {/* ── Playhead ── */}
        <div
          className={`absolute top-0 bottom-0 w-px z-30 pointer-events-none ${
            isRecording
              ? 'bg-red-500 shadow-[0_0_12px_rgba(248,113,113,0.7)]'
              : isPlaying
              ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.7)]'
              : 'bg-amber-500/60 shadow-[0_0_4px_rgba(245,158,11,0.3)]'
          }`}
          style={{ transform: `translateX(${playheadPos}px)` }}
        >
          {/* Arrow head */}
          <div className={`absolute -top-3 -left-2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] ${
            isRecording ? 'border-t-red-500' :
            isPlaying ? 'border-t-amber-400' :
            'border-t-amber-500/60'
          }`} />
        </div>
      </div>

      {/* ── Floating Zoom & Follow HUD in corner ── */}
      <div className="sticky bottom-3 right-3 ml-auto w-fit z-40 flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md border border-white/10 p-1 rounded-xl shadow-xl">
        <button
          onClick={toggleFollowPlayhead}
          className={`p-1.5 rounded-lg transition-all ${
            followPlayhead
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }`}
          title={followPlayhead ? 'Follow Playhead (Active - page bounces with playhead)' : 'Follow Playhead (Disabled - click to enable)'}
        >
          <LocateFixed size={13} />
        </button>
        <div className="w-px h-3.5 bg-white/10 mx-0.5" />
        <button
          onClick={zoomOut}
          className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors"
          title="Zoom Out (Ctrl + Scroll Down)"
        >
          <ZoomOut size={13} />
        </button>
        <span className="text-[10px] font-mono font-semibold text-zinc-300 px-1 tabular-nums w-10 text-center">
          {Math.round((zoom / 100) * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors"
          title="Zoom In (Ctrl + Scroll Up)"
        >
          <ZoomIn size={13} />
        </button>
        <div className="w-px h-3.5 bg-white/10 mx-0.5" />
        <button
          onClick={handleFit}
          className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors"
          title="Zoom to Fit Project"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1.5 min-w-[160px] text-xs text-zinc-200 overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.regionId ? (
            <>
              <button
                className="w-full text-left px-4 py-2 hover:bg-amber-500/15 hover:text-amber-300 transition-colors"
                onClick={() => { handleSplit(); setContextMenu(null); }}
              >
                Split at Cursor
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-amber-500/15 hover:text-amber-300 transition-colors"
                onClick={() => { handleJoin(); setContextMenu(null); }}
              >
                Join with Next
              </button>
              <div className="h-px bg-white/8 my-1 mx-3" />
              <button
                className="w-full text-left px-4 py-2 hover:bg-amber-500/15 hover:text-amber-300 transition-colors"
                onClick={() => { handleCopy(); setContextMenu(null); }}
              >
                Copy
              </button>
            </>
          ) : (
            <button
              className={`w-full text-left px-4 py-2 transition-colors ${
                clipboardRegion ? 'hover:bg-amber-500/15 hover:text-amber-300' : 'opacity-40 cursor-not-allowed'
              }`}
              onClick={() => { if (clipboardRegion) { handlePaste(); setContextMenu(null); } }}
            >
              Paste
            </button>
          )}
        </div>
      )}

      {/* ── Drag Overlay Feedback ── */}
      {isDragOverTimeline && (
        <div className="absolute inset-0 bg-amber-500/10 backdrop-blur-xs border-2 border-dashed border-amber-400 flex flex-col items-center justify-center pointer-events-none z-50">
          <Upload size={32} className="text-amber-400 mb-2 animate-bounce" />
          <span className="text-sm font-bold text-amber-300">Drop Audio to Insert Track</span>
          <span className="text-xs text-amber-400/80 mt-1">Inserts at playhead position or creates a new track</span>
        </div>
      )}
    </div>
  );
}
