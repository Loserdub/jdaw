import React, { useEffect, useState } from 'react';
import { useDAWStore, SynthOscillatorType, AudioEffect, EffectType } from '../lib/store';
import { engine } from '../lib/engine';
import { Volume2, Power, Trash2, Sliders, Music, Zap } from 'lucide-react';

// Computer keyboard mappings to MIDI notes (C4 = 60)
const KEY_MAP: Record<string, number> = {
  'a': 60,  // C4
  'w': 61,  // C#4
  's': 62,  // D4
  'e': 63,  // D#4
  'd': 64,  // E4
  'f': 65,  // F4
  't': 66,  // F#4
  'g': 67,  // G4
  'y': 68,  // G#4
  'h': 69,  // A4
  'u': 70,  // A#4
  'j': 71,  // B4
  'k': 72,  // C5
  'o': 73,  // C#5
  'l': 74,  // D5
  'p': 75,  // D#5
  ';': 76   // E5
};

export function BottomPanel() {
  const { 
    tracks, 
    selectedTrackId, 
    updateTrack, 
    updateTrackSynthSettings, 
    addTrackEffect, 
    updateTrackEffect, 
    removeTrackEffect 
  } = useDAWStore();

  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // MIDI Keyboard trigger functions
  const playNote = (note: number) => {
    if (!selectedTrackId) return;
    engine.playMidiNote(note, 100, selectedTrackId);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.add(note);
      return next;
    });
  };

  const stopNote = (note: number) => {
    engine.stopMidiNote(note);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  };

  // Keyboard listeners for musical typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent double trigger
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      // Don't trigger if user is typing in an input box
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined && selectedTrack?.inputType === 'midi') {
        playNote(note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined) {
        stopNote(note);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedTrackId, selectedTrack?.inputType]);

  if (!selectedTrack) {
    return (
      <div className="h-64 glass-panel rounded-3xl flex items-center justify-center text-slate-400 font-medium">
        Select a track to view control dashboard
      </div>
    );
  }

  // White and Black key note arrays
  const whiteKeys = [
    { note: 60, label: 'C4', keyLabel: 'A' },
    { note: 62, label: 'D4', keyLabel: 'S' },
    { note: 64, label: 'E4', keyLabel: 'D' },
    { note: 65, label: 'F4', keyLabel: 'F' },
    { note: 67, label: 'G4', keyLabel: 'G' },
    { note: 69, label: 'A4', keyLabel: 'H' },
    { note: 71, label: 'B4', keyLabel: 'J' },
    { note: 72, label: 'C5', keyLabel: 'K' },
    { note: 74, label: 'D5', keyLabel: 'L' },
    { note: 76, label: 'E5', keyLabel: ';' }
  ];

  const blackKeys = [
    { note: 61, label: 'C#4', keyLabel: 'W', leftIndex: 0 },
    { note: 63, label: 'D#4', keyLabel: 'E', leftIndex: 1 },
    { note: 66, label: 'F#4', keyLabel: 'T', leftIndex: 3 },
    { note: 68, label: 'G#4', keyLabel: 'Y', leftIndex: 4 },
    { note: 70, label: 'A#4', keyLabel: 'U', leftIndex: 5 },
    { note: 73, label: 'C#5', keyLabel: 'O', leftIndex: 7 },
    { note: 75, label: 'D#5', keyLabel: 'P', leftIndex: 8 }
  ];

  const renderEffectSliders = (effect: AudioEffect) => {
    const updateParam = (key: string, val: number) => {
      updateTrackEffect(selectedTrack.id, effect.id, {
        params: { ...effect.params, [key]: val }
      });
    };

    const renderSlider = (lbl: string, key: string, min: number, max: number, step = 0.01) => (
      <div className="flex flex-col gap-0.5" key={key}>
        <div className="flex justify-between text-[9px] text-slate-400 font-mono">
          <span>{lbl}</span>
          <span>{effect.params[key]?.toFixed(2)}</span>
        </div>
        <input 
          type="range"
          min={min} max={max} step={step}
          value={effect.params[key] ?? 0}
          onChange={(e) => updateParam(key, parseFloat(e.target.value))}
          className="w-full h-1 bg-black/50 rounded appearance-none cursor-pointer accent-sky-400"
        />
      </div>
    );

    switch (effect.type) {
      case 'reverb':
        return (
          <>
            {renderSlider('Mix', 'mix', 0, 1)}
            {renderSlider('Decay', 'decay', 0.1, 10, 0.1)}
          </>
        );
      case 'delay':
        return (
          <>
            {renderSlider('Mix', 'mix', 0, 1)}
            {renderSlider('Time', 'time', 0.01, 2)}
            {renderSlider('Fdbk', 'feedback', 0, 0.95)}
          </>
        );
      case 'eq':
        return (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {renderSlider('Low G', 'lowGain', -24, 24, 1)}
            {renderSlider('Mid G', 'midGain', -24, 24, 1)}
            {renderSlider('High G', 'highGain', -24, 24, 1)}
            {renderSlider('Mid F', 'midFreq', 200, 5000, 10)}
          </div>
        );
      case 'compressor':
        return (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {renderSlider('Thresh', 'threshold', -100, 0, 1)}
            {renderSlider('Ratio', 'ratio', 1, 20, 0.1)}
            {renderSlider('Atk', 'attack', 0.001, 1, 0.001)}
            {renderSlider('Rel', 'release', 0.01, 1, 0.01)}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-64 glass-panel rounded-3xl p-4 flex gap-4 overflow-hidden shrink-0 border border-white/5 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
      {/* COLUMN 1: SELECTED TRACK PARAMETERS & ADSR */}
      <div className="w-80 flex flex-col justify-between border-r border-white/5 pr-4 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="text-sky-400 shrink-0" size={16} />
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest truncate">
            Track: {selectedTrack.name}
          </h2>
        </div>

        {/* Volume & Pan */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3 skeuo-input px-3 py-1.5 rounded-xl">
            <Volume2 size={14} className="text-slate-400 shrink-0" />
            <input 
              type="range"
              min="0" max="1" step="0.01"
              value={selectedTrack.volume}
              onChange={(e) => updateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })}
              className="w-full h-1 bg-black/50 rounded appearance-none cursor-pointer accent-sky-400"
            />
            <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
              {Math.round(selectedTrack.volume * 100)}%
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Pan</span>
            <input 
              type="range"
              min="-1" max="1" step="0.05"
              value={selectedTrack.pan}
              onChange={(e) => updateTrack(selectedTrack.id, { pan: parseFloat(e.target.value) })}
              className="w-32 h-1 bg-black/50 rounded appearance-none cursor-pointer accent-sky-400"
            />
            <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
              {selectedTrack.pan === 0 ? 'C' : selectedTrack.pan > 0 ? `R${Math.round(selectedTrack.pan * 100)}` : `L${Math.round(Math.abs(selectedTrack.pan) * 100)}`}
            </span>
          </div>
        </div>

        {/* Synth ADSR Envelope (MIDI input only) */}
        {selectedTrack.inputType === 'midi' ? (
          <div className="bg-black/20 border border-white/5 rounded-xl p-2.5 flex flex-col gap-2 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider">Synth Settings</span>
              <select
                value={selectedTrack.synthSettings.oscillatorType}
                onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { oscillatorType: e.target.value as SynthOscillatorType })}
                className="bg-black/40 border border-white/10 text-[10px] font-medium text-slate-200 rounded px-1.5 py-0.5 outline-none cursor-pointer"
              >
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="triangle">Triangle</option>
                <option value="sine">Sine</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>Attack</span>
                  <span>{selectedTrack.synthSettings.attack.toFixed(3)}s</span>
                </div>
                <input 
                  type="range"
                  min="0.001" max="1.5" step="0.005"
                  value={selectedTrack.synthSettings.attack}
                  onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { attack: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-black/50 rounded appearance-none cursor-pointer accent-indigo-400"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>Release</span>
                  <span>{selectedTrack.synthSettings.release.toFixed(2)}s</span>
                </div>
                <input 
                  type="range"
                  min="0.01" max="2.0" step="0.01"
                  value={selectedTrack.synthSettings.release}
                  onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { release: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-black/50 rounded appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-slate-500 border border-dashed border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center mt-2 flex-1">
            <Zap size={14} className="mb-1" />
            <span>Select MIDI input type to unlock Synth Envelope parameters</span>
          </div>
        )}
      </div>

      {/* COLUMN 2: HORIZONTAL FX PEDALS */}
      <div className="flex-1 flex flex-col justify-between border-r border-white/5 pr-4 overflow-hidden">
        <div className="flex justify-between items-center mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-emerald-400" />
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              Insert Effects Chain
            </h2>
          </div>
          <select
            className="text-[10px] bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-slate-300 outline-none hover:bg-black/60 cursor-pointer"
            onChange={(e) => {
              if (e.target.value) {
                addTrackEffect(selectedTrack.id, e.target.value as EffectType);
                e.target.value = '';
              }
            }}
            value=""
          >
            <option value="" disabled>+ Add Effect</option>
            <option value="reverb">Reverb</option>
            <option value="delay">Delay</option>
            <option value="eq">EQ</option>
            <option value="compressor">Compressor</option>
          </select>
        </div>

        {/* Pedals Container */}
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 items-center no-scrollbar">
          {selectedTrack.effects.length === 0 ? (
            <div className="flex-1 h-full border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-slate-500 text-[10px]">
              No insert effects active on this track
            </div>
          ) : (
            selectedTrack.effects.map(effect => (
              <div 
                key={effect.id} 
                className="w-36 h-full bg-black/25 border border-white/5 rounded-2xl p-2.5 flex flex-col justify-between shrink-0 hover:border-white/10 transition-colors shadow-lg relative"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateTrackEffect(selectedTrack.id, effect.id, { enabled: !effect.enabled })}
                      className={`p-1 rounded-md transition-colors ${effect.enabled ? 'text-sky-400 bg-sky-500/10' : 'text-slate-500 bg-black/40'}`}
                      title="Toggle Effect Power"
                    >
                      <Power size={10} />
                    </button>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider truncate w-16">
                      {effect.type}
                    </span>
                  </div>
                  <button
                    onClick={() => removeTrackEffect(selectedTrack.id, effect.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                    title="Delete Effect"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 flex-1 justify-center">
                  {renderEffectSliders(effect)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* COLUMN 3: VIRTUAL MIDI KEYBOARD */}
      <div className="w-[380px] flex flex-col justify-between shrink-0 overflow-hidden">
        <div className="flex justify-between items-center mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              Keyboard instrument
            </h2>
          </div>
          {selectedTrack.inputType === 'midi' && (
            <span className="text-[9px] font-mono text-indigo-400 animate-pulse bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              Musical Typing Active
            </span>
          )}
        </div>

        {/* Keyboard container */}
        <div className="flex-1 relative flex items-start select-none bg-black/40 rounded-2xl border border-white/5 p-2 overflow-hidden h-full">
          {selectedTrack.inputType === 'midi' ? (
            <div className="relative w-full h-full flex">
              {/* White keys */}
              {whiteKeys.map((k) => {
                const isActive = activeNotes.has(k.note);
                return (
                  <div
                    key={k.note}
                    onMouseDown={() => playNote(k.note)}
                    onMouseUp={() => stopNote(k.note)}
                    onMouseLeave={() => activeNotes.has(k.note) && stopNote(k.note)}
                    className={`flex-1 flex flex-col justify-end items-center pb-2 cursor-pointer transition-all border-r border-black/40 rounded-md shadow-md ${
                      isActive 
                        ? 'bg-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.8)] border-purple-400' 
                        : 'bg-white hover:bg-slate-100 text-slate-600'
                    }`}
                    style={{ height: '95%' }}
                  >
                    <span className="text-[8px] font-bold font-mono uppercase">{k.keyLabel}</span>
                  </div>
                );
              })}

              {/* Black keys */}
              {blackKeys.map((k) => {
                const isActive = activeNotes.has(k.note);
                const whiteKeyWidthPercent = 100 / whiteKeys.length;
                const leftOffset = (k.leftIndex + 1) * whiteKeyWidthPercent;
                
                return (
                  <div
                    key={k.note}
                    onMouseDown={(e) => { e.stopPropagation(); playNote(k.note); }}
                    onMouseUp={(e) => { e.stopPropagation(); stopNote(k.note); }}
                    onMouseLeave={(e) => activeNotes.has(k.note) && stopNote(k.note)}
                    className={`absolute z-10 w-5 flex flex-col justify-end items-center pb-2 cursor-pointer transition-all border border-black rounded-b-md shadow-xl -ml-2.5 ${
                      isActive 
                        ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.9)] border-purple-500' 
                        : 'bg-[#1e1e2f] hover:bg-[#2e2e42] text-slate-400'
                    }`}
                    style={{ 
                      left: `${leftOffset}%`, 
                      height: '60%' 
                    }}
                  >
                    <span className="text-[8px] font-bold font-mono uppercase">{k.keyLabel}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 text-[10px] p-4 border border-dashed border-white/5 rounded-xl">
              <Zap size={16} className="text-slate-600 mb-1" />
              <span>Keyboard is disabled.<br />Change track input type to <b>MIDI</b> and Arm recording to play.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
