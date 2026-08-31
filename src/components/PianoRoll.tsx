import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDAWStore, MidiNote } from '../lib/store';
import { engine } from '../lib/engine';
import { Music, Plus, Trash2, CheckSquare, Sparkles, Volume2, X } from 'lucide-react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const getNoteName = (midi: number) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};

const isBlackKey = (midi: number) => {
  const n = midi % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
};

// Default range: C3 (48) to B5 (83) -> 36 notes
const MIN_NOTE = 48; // C3
const MAX_NOTE = 83; // B5
const ROW_HEIGHT = 16; // px per semitone

export function PianoRoll() {
  const {
    tracks,
    selectedTrackId,
    selectedRegionId,
    setSelectedRegionId,
    regions,
    bpm,
    addMidiNote,
    updateMidiNote,
    removeMidiNote,
    quantizeMidiNotes,
    clearMidiNotes,
    createMidiRegion,
    setActiveBottomTab
  } = useDAWStore();

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const trackMidiRegions = useMemo(
    () => regions.filter(r => r.trackId === selectedTrackId && (r.midiNotes !== undefined || !r.buffer)),
    [regions, selectedTrackId]
  );

  // Active region being edited
  const activeRegion = useMemo(() => {
    if (selectedRegionId) {
      const found = regions.find(r => r.id === selectedRegionId);
      if (found && found.trackId === selectedTrackId) return found;
    }
    return trackMidiRegions[0] || null;
  }, [selectedRegionId, regions, selectedTrackId, trackMidiRegions]);

  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [activeAuditionNote, setActiveAuditionNote] = useState<number | null>(null);
  const [gridDivision, setGridDivision] = useState<number>(4); // 4 = 1/16th, 2 = 1/8th, 1 = 1/4th, 8 = 1/32th
  const [defaultDurationBeats, setDefaultDurationBeats] = useState<number>(1); // in beats (e.g. 0.25 = 1/16, 0.5 = 1/8, 1 = 1/4)
  const [noteVelocity, setNoteVelocity] = useState<number>(100);

  // Dragging state for moving or resizing notes
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize-end' | 'resize-start';
    noteIndex: number;
    initialStart: number;
    initialDuration: number;
    initialPitch: number;
    startX: number;
    startY: number;
  } | null>(null);

  const gridScrollRef = useRef<HTMLDivElement>(null);
  const keysScrollRef = useRef<HTMLDivElement>(null);

  const secondsPerBeat = 60 / bpm;
  const PIXELS_PER_SECOND = 120; // Piano roll horizontal zoom
  const pixelsPerBeat = secondsPerBeat * PIXELS_PER_SECOND;
  const regionDuration = activeRegion?.duration || 8;
  const totalBeats = Math.ceil(regionDuration / secondsPerBeat);
  const totalBars = Math.ceil(totalBeats / 4);
  const gridWidth = Math.max(600, regionDuration * PIXELS_PER_SECOND);

  // Notes list from MAX_NOTE down to MIN_NOTE
  const noteList = useMemo(() => {
    const list: number[] = [];
    for (let n = MAX_NOTE; n >= MIN_NOTE; n--) {
      list.push(n);
    }
    return list;
  }, []);

  // Snapping function
  const snapToGrid = (seconds: number) => {
    const snapInterval = secondsPerBeat / gridDivision;
    return Math.max(0, Math.round(seconds / snapInterval) * snapInterval);
  };

  // Sync vertical scrolling between keyboard and grid
  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (keysScrollRef.current) {
      keysScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Audition a note using track synth
  const auditionNote = (pitch: number) => {
    if (!selectedTrackId) return;
    engine.playMidiNote(pitch, noteVelocity, selectedTrackId);
    setActiveAuditionNote(pitch);
  };

  const stopAuditionNote = (pitch: number) => {
    engine.stopMidiNote(pitch);
    setActiveAuditionNote(null);
  };

  // Handle clicking on empty grid to add a note
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeRegion || dragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const clickedTime = clickX / PIXELS_PER_SECOND;
    const snappedStart = snapToGrid(clickedTime);

    const rowIndex = Math.floor(clickY / ROW_HEIGHT);
    const pitch = MAX_NOTE - rowIndex;

    if (pitch < MIN_NOTE || pitch > MAX_NOTE) return;

    const noteDuration = snapToGrid(defaultDurationBeats * secondsPerBeat);

    const newNote: MidiNote = {
      note: pitch,
      velocity: noteVelocity,
      start: snappedStart,
      duration: Math.max(secondsPerBeat / gridDivision, noteDuration)
    };

    addMidiNote(activeRegion.id, newNote);
    auditionNote(pitch);
    setTimeout(() => stopAuditionNote(pitch), 200);

    const updatedNotes = [...(activeRegion.midiNotes || []), newNote].sort((a, b) => a.start - b.start);
    const newIndex = updatedNotes.findIndex(n => n.start === snappedStart && n.note === pitch);
    setSelectedNoteIndex(newIndex !== -1 ? newIndex : null);
  };

  // Dragging logic for move & resize
  useEffect(() => {
    if (!dragState || !activeRegion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - dragState.startX) / PIXELS_PER_SECOND;
      const deltaY = Math.round((e.clientY - dragState.startY) / ROW_HEIGHT);

      if (dragState.type === 'move') {
        const newStart = Math.max(0, snapToGrid(dragState.initialStart + deltaX));
        const newPitch = Math.max(MIN_NOTE, Math.min(MAX_NOTE, dragState.initialPitch - deltaY));

        updateMidiNote(activeRegion.id, dragState.noteIndex, {
          start: newStart,
          note: newPitch
        });
      } else if (dragState.type === 'resize-end') {
        const minDuration = secondsPerBeat / gridDivision;
        const newDuration = Math.max(minDuration, snapToGrid(dragState.initialDuration + deltaX));

        updateMidiNote(activeRegion.id, dragState.noteIndex, {
          duration: newDuration
        });
      } else if (dragState.type === 'resize-start') {
        const proposedStart = snapToGrid(dragState.initialStart + deltaX);
        const maxStart = dragState.initialStart + dragState.initialDuration - (secondsPerBeat / gridDivision);
        const newStart = Math.max(0, Math.min(proposedStart, maxStart));
        const newDuration = dragState.initialDuration - (newStart - dragState.initialStart);

        updateMidiNote(activeRegion.id, dragState.noteIndex, {
          start: newStart,
          duration: Math.max(secondsPerBeat / gridDivision, newDuration)
        });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, activeRegion, gridDivision, secondsPerBeat, updateMidiNote]);

  // Handle Quantize
  const handleQuantize = () => {
    if (!activeRegion) return;
    const gridDivisionSec = secondsPerBeat / gridDivision;
    quantizeMidiNotes(activeRegion.id, gridDivisionSec);
  };

  // Handle creating a new MIDI clip if none exist
  const handleCreateClip = () => {
    if (!selectedTrackId) return;
    createMidiRegion(selectedTrackId, 0, 8);
  };

  if (!selectedTrack) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
        Select a track to open Piano Roll
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/80 rounded-2xl overflow-hidden border border-white/5">
      {/* ── Toolbar ── */}
      <div className="h-10 bg-white/[0.03] border-b border-white/8 px-3 flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase tracking-wider">
            <Music size={13} />
            <span>Piano Roll</span>
          </div>

          {/* Region selector */}
          {trackMidiRegions.length > 0 ? (
            <select
              value={activeRegion?.id || ''}
              onChange={(e) => setSelectedRegionId(e.target.value)}
              className="bg-black/50 border border-white/10 text-[10px] text-zinc-200 rounded px-2 py-1 outline-none hover:border-amber-500/40 cursor-pointer font-mono"
            >
              {trackMidiRegions.map((r, idx) => (
                <option key={r.id} value={r.id}>
                  Clip {idx + 1} ({r.start.toFixed(1)}s - {(r.start + r.duration).toFixed(1)}s)
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={handleCreateClip}
              className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
            >
              <Plus size={11} /> Create MIDI Clip
            </button>
          )}
        </div>

        {/* Quantize & Grid options */}
        {activeRegion && (
          <div className="flex items-center gap-2">
            {/* Grid Snap selector */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded px-2 py-0.5">
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Grid</span>
              <select
                value={gridDivision}
                onChange={(e) => setGridDivision(Number(e.target.value))}
                className="bg-transparent text-[10px] font-mono text-zinc-300 outline-none cursor-pointer"
              >
                <option value={1} className="bg-zinc-900">1/4</option>
                <option value={2} className="bg-zinc-900">1/8</option>
                <option value={4} className="bg-zinc-900">1/16</option>
                <option value={8} className="bg-zinc-900">1/32</option>
              </select>
            </div>

            {/* Note Length selector */}
            <div className="hidden sm:flex items-center gap-1 bg-black/40 border border-white/5 rounded px-2 py-0.5">
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Len</span>
              <select
                value={defaultDurationBeats}
                onChange={(e) => setDefaultDurationBeats(Number(e.target.value))}
                className="bg-transparent text-[10px] font-mono text-zinc-300 outline-none cursor-pointer"
              >
                <option value={0.25} className="bg-zinc-900">1/16</option>
                <option value={0.5} className="bg-zinc-900">1/8</option>
                <option value={1} className="bg-zinc-900">1/4</option>
                <option value={2} className="bg-zinc-900">1/2</option>
                <option value={4} className="bg-zinc-900">1 Bar</option>
              </select>
            </div>

            {/* Quantize Button */}
            <button
              onClick={handleQuantize}
              className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              title="Quantize notes to grid"
            >
              <Sparkles size={11} />
              <span>Quantize (Q)</span>
            </button>

            {/* Velocity control for selected note */}
            {selectedNoteIndex !== null && activeRegion.midiNotes && activeRegion.midiNotes[selectedNoteIndex] && (
              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded px-2 py-0.5">
                <Volume2 size={11} className="text-amber-400" />
                <span className="text-[9px] font-mono text-zinc-400">
                  {getNoteName(activeRegion.midiNotes[selectedNoteIndex].note)}:
                </span>
                <input
                  type="range"
                  min="1"
                  max="127"
                  value={activeRegion.midiNotes[selectedNoteIndex].velocity}
                  onChange={(e) => {
                    const vel = Number(e.target.value);
                    setNoteVelocity(vel);
                    updateMidiNote(activeRegion.id, selectedNoteIndex, { velocity: vel });
                  }}
                  className="w-16 h-1 accent-amber-400"
                  title="Note Velocity (0-127)"
                />
                <span className="text-[9px] font-mono text-zinc-400 tabular-nums w-5 text-right">
                  {activeRegion.midiNotes[selectedNoteIndex].velocity}
                </span>
              </div>
            )}

            {/* Clear notes */}
            <button
              onClick={() => activeRegion && clearMidiNotes(activeRegion.id)}
              className="p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded transition-colors"
              title="Clear all notes"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Main Piano Roll Body ── */}
      {!activeRegion ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2">
          <Music size={24} className="text-zinc-600 mb-1" />
          <p className="text-xs">No MIDI Clip selected for this track.</p>
          <button
            onClick={handleCreateClip}
            className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors mt-2"
          >
            <Plus size={13} /> Create 8-Bar MIDI Clip
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* ── Left Vertical Piano Keyboard ── */}
          <div
            ref={keysScrollRef}
            className="w-16 sm:w-20 bg-zinc-900/90 border-r border-white/10 shrink-0 overflow-y-hidden select-none"
          >
            {noteList.map((pitch) => {
              const isBlack = isBlackKey(pitch);
              const isC = pitch % 12 === 0;
              const isActive = activeAuditionNote === pitch;

              return (
                <div
                  key={pitch}
                  onMouseDown={() => auditionNote(pitch)}
                  onMouseUp={() => stopAuditionNote(pitch)}
                  onMouseLeave={() => activeAuditionNote === pitch && stopAuditionNote(pitch)}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className={`flex items-center justify-between px-1.5 cursor-pointer text-[8px] font-mono border-b border-black/40 transition-colors ${
                    isActive
                      ? 'bg-amber-400 text-black font-bold shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                      : isBlack
                      ? 'bg-zinc-950 text-zinc-500 hover:bg-zinc-800'
                      : isC
                      ? 'bg-zinc-200 text-zinc-900 font-bold hover:bg-zinc-100'
                      : 'bg-zinc-300 text-zinc-800 hover:bg-zinc-200'
                  }`}
                >
                  <span>{getNoteName(pitch)}</span>
                  {isC && <span className="w-1 h-1 rounded-full bg-amber-600" />}
                </div>
              );
            })}
          </div>

          {/* ── Center Note Grid ── */}
          <div
            ref={gridScrollRef}
            onScroll={handleGridScroll}
            className="flex-1 overflow-auto relative bg-zinc-950 no-scrollbar"
          >
            <div
              className="relative select-none"
              style={{
                width: `${gridWidth}px`,
                height: `${noteList.length * ROW_HEIGHT}px`
              }}
              onClick={handleGridClick}
            >
              {/* Row backgrounds (alternating sharp/natural lines) */}
              {noteList.map((pitch, idx) => {
                const isBlack = isBlackKey(pitch);
                return (
                  <div
                    key={pitch}
                    style={{
                      top: `${idx * ROW_HEIGHT}px`,
                      height: `${ROW_HEIGHT}px`,
                      width: '100%'
                    }}
                    className={`absolute border-b border-white/[0.04] ${
                      isBlack ? 'bg-black/40' : 'bg-white/[0.01]'
                    }`}
                  />
                );
              })}

              {/* Vertical beat and bar grid lines */}
              {Array.from({ length: totalBars }).map((_, barIdx) => {
                const barLeft = barIdx * 4 * pixelsPerBeat;
                return (
                  <React.Fragment key={barIdx}>
                    {/* Bar Line */}
                    <div
                      className="absolute top-0 bottom-0 border-l border-white/20 pointer-events-none"
                      style={{ left: `${barLeft}px` }}
                    >
                      <span className="absolute top-0.5 left-1 text-[8px] font-mono text-zinc-500 font-bold">
                        {barIdx + 1}
                      </span>
                    </div>

                    {/* Beat lines (quarter notes) */}
                    {[1, 2, 3].map((b) => (
                      <div
                        key={b}
                        className="absolute top-0 bottom-0 border-l border-white/8 pointer-events-none"
                        style={{ left: `${barLeft + b * pixelsPerBeat}px` }}
                      />
                    ))}

                    {/* Sub-beat lines (1/16th) */}
                    {gridDivision >= 4 &&
                      [0, 1, 2, 3].map((b) =>
                        [1, 2, 3].map((sub) => (
                          <div
                            key={`${b}-${sub}`}
                            className="absolute top-0 bottom-0 border-l border-white/[0.03] pointer-events-none"
                            style={{
                              left: `${barLeft + b * pixelsPerBeat + (sub * pixelsPerBeat) / 4}px`
                            }}
                          />
                        ))
                      )}
                  </React.Fragment>
                );
              })}

              {/* ── Drawn MIDI Notes ── */}
              {(activeRegion.midiNotes || []).map((note, noteIdx) => {
                const rowIndex = MAX_NOTE - note.note;
                if (rowIndex < 0 || rowIndex >= noteList.length) return null;

                const top = rowIndex * ROW_HEIGHT;
                const left = note.start * PIXELS_PER_SECOND;
                const width = Math.max(6, note.duration * PIXELS_PER_SECOND);
                const isSelected = selectedNoteIndex === noteIdx;
                const alpha = Math.max(0.6, note.velocity / 127);

                return (
                  <div
                    key={`${noteIdx}-${note.start}-${note.note}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNoteIndex(noteIdx);
                      setNoteVelocity(note.velocity);
                      auditionNote(note.note);
                      setTimeout(() => stopAuditionNote(note.note), 150);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      removeMidiNote(activeRegion.id, noteIdx);
                      setSelectedNoteIndex(null);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedNoteIndex(noteIdx);
                      setDragState({
                        type: 'move',
                        noteIndex: noteIdx,
                        initialStart: note.start,
                        initialDuration: note.duration,
                        initialPitch: note.note,
                        startX: e.clientX,
                        startY: e.clientY
                      });
                    }}
                    style={{
                      top: `${top + 1}px`,
                      left: `${left}px`,
                      width: `${width}px`,
                      height: `${ROW_HEIGHT - 2}px`
                    }}
                    className={`absolute rounded cursor-move transition-shadow flex items-center justify-between px-1 border select-none group ${
                      isSelected
                        ? 'bg-amber-400 text-black border-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.9)] z-20'
                        : 'bg-purple-500 hover:bg-purple-400 text-purple-100 border-purple-300/40 z-10'
                    }`}
                  >
                    {/* Note pitch label */}
                    <span className="text-[7px] font-mono font-bold leading-none truncate pointer-events-none">
                      {getNoteName(note.note)}
                    </span>

                    {/* Resize Handle - Right */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          type: 'resize-end',
                          noteIndex: noteIdx,
                          initialStart: note.start,
                          initialDuration: note.duration,
                          initialPitch: note.note,
                          startX: e.clientX,
                          startY: e.clientY
                        });
                      }}
                      className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r"
                    />

                    {/* Resize Handle - Left */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          type: 'resize-start',
                          noteIndex: noteIdx,
                          initialStart: note.start,
                          initialDuration: note.duration,
                          initialPitch: note.note,
                          startX: e.clientX,
                          startY: e.clientY
                        });
                      }}
                      className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
