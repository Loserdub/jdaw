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

type BottomTab = 'params' | 'fx' | 'keys';

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
  const [activeTab, setActiveTab] = useState<BottomTab>('params');

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // MIDI Keyboard trigger functions
  const playNote = (note: number) => {
    if (!selectedTrackId) return;
    engine.playMidiNote(note, 100, selectedTrackId);
    setActiveNotes(prev => { const next = new Set(prev); next.add(note); return next; });
  };

  const stopNote = (note: number) => {
    engine.stopMidiNote(note);
    setActiveNotes(prev => { const next = new Set(prev); next.delete(note); return next; });
  };

  // Keyboard listeners for musical typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined && selectedTrack?.inputType === 'midi') playNote(note);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined) stopNote(note);
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
      <div className="h-12 glass-panel rounded-2xl flex items-center justify-center text-zinc-600 text-xs font-medium shrink-0">
        Select a track to view controls
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
      updateTrackEffect(selectedTrack.id, effect.id, { params: { ...effect.params, [key]: val } });
    };

    const renderSlider = (lbl: string, key: string, min: number, max: number, step = 0.01) => (
      <div className="flex flex-col gap-0.5" key={key}>
        <div className="flex justify-between text-[8px] text-zinc-500 font-mono">
          <span className="uppercase tracking-wide">{lbl}</span>
          <span>{effect.params[key]?.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={min} max={max} step={step}
          value={effect.params[key] ?? 0}
          onChange={(e) => updateParam(key, parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
    );

    switch (effect.type) {
      case 'reverb':   return <>{renderSlider('Mix',    'mix',       0,    1)}{renderSlider('Decay',  'decay',     0.1,  10, 0.1)}</>;
      case 'delay':    return <>{renderSlider('Mix',    'mix',       0,    1)}{renderSlider('Time',   'time',      0.01, 2)}{renderSlider('Fdbk',  'feedback',  0,    0.95)}</>;
      case 'eq':       return (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {renderSlider('Low G', 'lowGain',  -24, 24, 1)}
          {renderSlider('Mid G', 'midGain',  -24, 24, 1)}
          {renderSlider('Hi G',  'highGain', -24, 24, 1)}
          {renderSlider('Mid F', 'midFreq',  200, 5000, 10)}
        </div>
      );
      case 'compressor': return (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {renderSlider('Thresh', 'threshold', -100, 0, 1)}
          {renderSlider('Ratio',  'ratio',       1,  20, 0.1)}
          {renderSlider('Atk',    'attack',    0.001, 1, 0.001)}
          {renderSlider('Rel',    'release',   0.01,  1, 0.01)}
        </div>
      );
      default: return null;
    }
  };

  /* ── Section header helper ── */
  const SectionHeader = ({ icon, label, right }: { icon: React.ReactNode; label: string; right?: React.ReactNode }) => (
    <div className="flex justify-between items-center mb-2 shrink-0">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      </div>
      {right}
    </div>
  );

  return (
    <div className="glass-panel rounded-2xl shrink-0 overflow-hidden border border-white/5">
      {/* ── Mobile tab strip ── */}
      <div className="flex gap-1 px-2 pt-2 border-b border-white/5 md:hidden">
        <button className={`tab-btn ${activeTab === 'params' ? 'active' : ''}`} onClick={() => setActiveTab('params')}>
          Params
        </button>
        <button className={`tab-btn ${activeTab === 'fx' ? 'active' : ''}`} onClick={() => setActiveTab('fx')}>
          FX Chain
        </button>
        <button className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`} onClick={() => setActiveTab('keys')}>
          Keyboard
        </button>
        <span className="ml-auto text-[9px] font-semibold text-zinc-600 self-center pr-1">{selectedTrack.name}</span>
      </div>

      {/* ── Main content row ── */}
      <div className="flex gap-0 h-56 md:h-64">

        {/* ── COLUMN 1: Track Parameters ── */}
        <div className={`w-full md:w-72 lg:w-80 flex flex-col border-r border-white/5 p-3 shrink-0 ${activeTab === 'params' ? 'flex' : 'hidden'} md:flex`}>
          <SectionHeader
            icon={<Sliders size={13} className="text-amber-400" />}
            label={`Track: ${selectedTrack.name}`}
          />

          <div className="flex flex-col gap-2.5 flex-1">
            {/* Volume */}
            <div className="flex items-center gap-2 skeuo-input px-2.5 py-1.5 rounded-xl">
              <Volume2 size={12} className="text-zinc-500 shrink-0" />
              <input
                type="range" min="0" max="1" step="0.01"
                value={selectedTrack.volume}
                onChange={(e) => updateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[9px] font-mono text-zinc-500 w-8 text-right tabular-nums">
                {Math.round(selectedTrack.volume * 100)}%
              </span>
            </div>

            {/* Pan */}
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] uppercase font-bold text-zinc-600 tracking-wider w-7 shrink-0">Pan</span>
              <input
                type="range" min="-1" max="1" step="0.05"
                value={selectedTrack.pan}
                onChange={(e) => updateTrack(selectedTrack.id, { pan: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[9px] font-mono text-zinc-500 w-10 text-right tabular-nums">
                {selectedTrack.pan === 0 ? 'C' : selectedTrack.pan > 0 ? `R${Math.round(selectedTrack.pan * 100)}` : `L${Math.round(Math.abs(selectedTrack.pan) * 100)}`}
              </span>
            </div>

            {/* Synth ADSR — MIDI only */}
            {selectedTrack.inputType === 'midi' ? (
              <div className="bg-black/20 border border-white/5 rounded-xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-amber-400/80 tracking-wider">Synth</span>
                  <select
                    value={selectedTrack.synthSettings.oscillatorType}
                    onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { oscillatorType: e.target.value as SynthOscillatorType })}
                    className="bg-black/40 border border-white/8 text-[9px] font-medium text-zinc-300 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-amber-500/30"
                  >
                    <option value="square">Square</option>
                    <option value="sawtooth">Sawtooth</option>
                    <option value="triangle">Triangle</option>
                    <option value="sine">Sine</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[8px] font-mono text-zinc-500">
                      <span>Attack</span>
                      <span>{selectedTrack.synthSettings.attack.toFixed(3)}s</span>
                    </div>
                    <input
                      type="range" min="0.001" max="1.5" step="0.005"
                      value={selectedTrack.synthSettings.attack}
                      onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { attack: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[8px] font-mono text-zinc-500">
                      <span>Release</span>
                      <span>{selectedTrack.synthSettings.release.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range" min="0.01" max="2.0" step="0.01"
                      value={selectedTrack.synthSettings.release}
                      onChange={(e) => updateTrackSynthSettings(selectedTrack.id, { release: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[9px] text-zinc-600 border border-dashed border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center flex-1">
                <Zap size={13} className="text-zinc-700 mb-1" />
                <span>Set input to <b className="text-zinc-500">MIDI</b> to unlock Synth controls</span>
              </div>
            )}
          </div>
        </div>

        {/* ── COLUMN 2: FX Chain ── */}
        <div className={`flex-1 flex flex-col border-r border-white/5 p-3 overflow-hidden ${activeTab === 'fx' ? 'flex' : 'hidden'} md:flex`}>
          <SectionHeader
            icon={<Sliders size={13} className="text-emerald-400" />}
            label="Insert FX"
            right={
              <select
                className="text-[9px] bg-black/30 border border-white/8 rounded px-1.5 py-0.5 text-zinc-400 outline-none hover:border-amber-500/30 hover:text-amber-400 cursor-pointer transition-colors"
                onChange={(e) => {
                  if (e.target.value) { addTrackEffect(selectedTrack.id, e.target.value as EffectType); e.target.value = ''; }
                }}
                value=""
              >
                <option value="" disabled>+ Add Effect</option>
                <option value="reverb">Reverb</option>
                <option value="delay">Delay</option>
                <option value="eq">EQ</option>
                <option value="compressor">Compressor</option>
              </select>
            }
          />

          {/* Pedals row */}
          <div className="flex-1 flex gap-2 overflow-x-auto pb-1 items-stretch no-scrollbar">
            {selectedTrack.effects.length === 0 ? (
              <div className="flex-1 border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-zinc-700 text-[9px]">
                No effects on this track
              </div>
            ) : (
              selectedTrack.effects.map(effect => (
                <div
                  key={effect.id}
                  className="w-36 bg-black/20 border border-white/5 rounded-2xl p-2.5 flex flex-col justify-between shrink-0 hover:border-white/10 transition-colors"
                >
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateTrackEffect(selectedTrack.id, effect.id, { enabled: !effect.enabled })}
                        className={`p-1 rounded-md transition-all ${
                          effect.enabled
                            ? 'text-amber-400 bg-amber-500/10 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
                            : 'text-zinc-600 bg-black/30'
                        }`}
                        title="Toggle"
                      >
                        <Power size={9} />
                      </button>
                      <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider truncate w-16">
                        {effect.type}
                      </span>
                    </div>
                    <button
                      onClick={() => removeTrackEffect(selectedTrack.id, effect.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>

                  <div className={`flex flex-col gap-1.5 flex-1 justify-center ${effect.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    {renderEffectSliders(effect)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── COLUMN 3: Virtual MIDI Keyboard ── */}
        <div className={`w-full md:w-[360px] flex flex-col shrink-0 p-3 overflow-hidden ${activeTab === 'keys' ? 'flex' : 'hidden'} md:flex`}>
          <SectionHeader
            icon={<Music size={13} className="text-amber-400/70" />}
            label="Keyboard"
            right={
              selectedTrack.inputType === 'midi' ? (
                <span className="text-[8px] font-mono text-amber-400 animate-pulse bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  Musical Typing On
                </span>
              ) : null
            }
          />

          <div className="flex-1 relative flex items-start select-none bg-black/30 rounded-xl border border-white/5 p-1.5 overflow-hidden">
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
                      className={`flex-1 flex flex-col justify-end items-center pb-1.5 cursor-pointer transition-all border-r border-black/30 rounded-b-md shadow-sm ${
                        isActive
                          ? 'bg-amber-400 text-amber-900 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                          : 'bg-zinc-100 hover:bg-zinc-50 text-zinc-500'
                      }`}
                      style={{ height: '95%' }}
                    >
                      <span className="text-[7px] font-bold font-mono">{k.keyLabel}</span>
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
                      className={`absolute z-10 w-5 flex flex-col justify-end items-center pb-1.5 cursor-pointer transition-all border border-black rounded-b-md shadow-lg -ml-2.5 ${
                        isActive
                          ? 'bg-amber-500 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.8)]'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-500'
                      }`}
                      style={{ left: `${leftOffset}%`, height: '60%' }}
                    >
                      <span className="text-[6px] font-bold font-mono">{k.keyLabel}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600 text-[9px] p-4 border border-dashed border-white/5 rounded-xl w-full">
                <Zap size={14} className="text-zinc-700 mb-1.5" />
                <span>Set track input to <b className="text-zinc-500">MIDI</b> to enable keyboard</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
