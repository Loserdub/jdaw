import React from 'react';
import { useDAWStore, AudioEffect, EffectType } from '../lib/store';
import { Trash2, Power, Activity } from 'lucide-react';

interface EffectParamsProps {
  effect: AudioEffect;
  onChange: (updates: Partial<AudioEffect>) => void;
}

function EffectParams({ effect, onChange }: EffectParamsProps) {
  const updateParam = (key: string, value: number) => {
    onChange({ params: { ...effect.params, [key]: value } });
  };

  const renderSlider = (label: string, key: string, min: number, max: number, step: number = 0.01) => (
    <div className="flex flex-col gap-1" key={key}>
      <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
        <span className="uppercase tracking-wide">{label}</span>
        <span>{effect.params[key]?.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={effect.params[key] ?? 0}
        onChange={(e) => updateParam(key, parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );

  switch (effect.type) {
    case 'reverb':
      return (
        <div className="flex flex-col gap-2">
          {renderSlider('Mix', 'mix', 0, 1)}
          {renderSlider('Decay', 'decay', 0.1, 10, 0.1)}
        </div>
      );
    case 'delay':
      return (
        <div className="flex flex-col gap-2">
          {renderSlider('Mix', 'mix', 0, 1)}
          {renderSlider('Time', 'time', 0.01, 2)}
          {renderSlider('Fdbk', 'feedback', 0, 0.95)}
        </div>
      );
    case 'eq':
      return (
        <div className="flex flex-col gap-2">
          {renderSlider('Low G', 'lowGain', -24, 24, 1)}
          {renderSlider('Mid G', 'midGain', -24, 24, 1)}
          {renderSlider('Hi G', 'highGain', -24, 24, 1)}
          {renderSlider('Low F', 'lowFreq', 20, 1000, 10)}
          {renderSlider('Mid F', 'midFreq', 200, 5000, 10)}
          {renderSlider('Hi F', 'highFreq', 1000, 20000, 100)}
        </div>
      );
    case 'compressor':
      return (
        <div className="flex flex-col gap-2">
          {renderSlider('Thresh', 'threshold', -100, 0, 1)}
          {renderSlider('Ratio', 'ratio', 1, 20, 0.1)}
          {renderSlider('Atk', 'attack', 0, 1, 0.001)}
          {renderSlider('Rel', 'release', 0, 1, 0.01)}
        </div>
      );
    default:
      return null;
  }
}

interface EffectRackProps {
  effects: AudioEffect[];
  onAddEffect: (type: EffectType) => void;
  onUpdateEffect: (id: string, updates: Partial<AudioEffect>) => void;
  onRemoveEffect: (id: string) => void;
}

export function EffectRack({ effects, onAddEffect, onUpdateEffect, onRemoveEffect }: EffectRackProps) {
  return (
    <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-0.5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-[9px] uppercase font-bold text-zinc-600 tracking-widest">Effects</span>
        <select
          className="text-[9px] bg-black/30 border border-white/8 rounded px-1.5 py-0.5 text-zinc-400 outline-none hover:border-amber-500/30 hover:text-amber-400 cursor-pointer transition-colors"
          onChange={(e) => {
            if (e.target.value) {
              onAddEffect(e.target.value as EffectType);
              e.target.value = '';
            }
          }}
          value=""
        >
          <option value="" disabled>+ Add</option>
          <option value="reverb">Reverb</option>
          <option value="delay">Delay</option>
          <option value="eq">EQ</option>
          <option value="compressor">Compressor</option>
        </select>
      </div>

      {/* Effect cards */}
      <div className="flex flex-col gap-1.5">
        {effects.map(effect => (
          <div
            key={effect.id}
            className="bg-black/20 border border-white/5 rounded-xl p-2.5 flex flex-col gap-2 hover:border-white/10 transition-colors"
          >
            {/* Card header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                {/* Power LED */}
                <button
                  onClick={() => onUpdateEffect(effect.id, { enabled: !effect.enabled })}
                  className={`p-1 rounded-md transition-all ${
                    effect.enabled
                      ? 'text-amber-400 bg-amber-500/10 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
                      : 'text-zinc-600 bg-black/30'
                  }`}
                  title="Toggle"
                >
                  <Power size={10} />
                </button>
                <span className="text-[10px] font-semibold text-zinc-300 capitalize tracking-wide">
                  {effect.type}
                </span>
              </div>
              <button
                onClick={() => onRemoveEffect(effect.id)}
                className="text-zinc-600 hover:text-red-400 transition-colors p-0.5 rounded"
              >
                <Trash2 size={10} />
              </button>
            </div>

            {/* Params */}
            <div className={effect.enabled ? '' : 'opacity-40 pointer-events-none'}>
              <EffectParams effect={effect} onChange={(updates) => onUpdateEffect(effect.id, updates)} />
            </div>

            {effect.type === 'eq' && (
              <button
                onClick={() => useDAWStore.getState().setActiveBottomTab('eq')}
                className="flex items-center justify-center gap-1 w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-[9px] font-semibold py-1 rounded-lg transition-colors"
              >
                <Activity size={10} />
                <span>Open Visual Curve</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
