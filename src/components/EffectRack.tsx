import React from 'react';
import { useDAWStore, AudioEffect, EffectType } from '../lib/store';
import { Settings, Trash2, Power } from 'lucide-react';

interface EffectParamsProps {
  effect: AudioEffect;
  onChange: (updates: Partial<AudioEffect>) => void;
}

function EffectParams({ effect, onChange }: EffectParamsProps) {
  const updateParam = (key: string, value: number) => {
    onChange({ params: { ...effect.params, [key]: value } });
  };

  const renderSlider = (label: string, key: string, min: number, max: number, step: number = 0.01) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span>{effect.params[key]?.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={effect.params[key] ?? 0}
        onChange={(e) => updateParam(key, parseFloat(e.target.value))}
        className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-sky-400"
      />
    </div>
  );

  switch (effect.type) {
    case 'reverb':
      return (
        <div className="flex flex-col gap-2 p-2 bg-black/20 rounded-lg">
          {renderSlider('Mix', 'mix', 0, 1)}
          {renderSlider('Decay', 'decay', 0.1, 10, 0.1)}
        </div>
      );
    case 'delay':
      return (
        <div className="flex flex-col gap-2 p-2 bg-black/20 rounded-lg">
          {renderSlider('Mix', 'mix', 0, 1)}
          {renderSlider('Time', 'time', 0.01, 2)}
          {renderSlider('Feedback', 'feedback', 0, 0.95)}
        </div>
      );
    case 'eq':
      return (
        <div className="flex flex-col gap-2 p-2 bg-black/20 rounded-lg">
          {renderSlider('Low Gain', 'lowGain', -24, 24, 1)}
          {renderSlider('Mid Gain', 'midGain', -24, 24, 1)}
          {renderSlider('High Gain', 'highGain', -24, 24, 1)}
          {renderSlider('Low Freq', 'lowFreq', 20, 1000, 10)}
          {renderSlider('Mid Freq', 'midFreq', 200, 5000, 10)}
          {renderSlider('High Freq', 'highFreq', 1000, 20000, 100)}
        </div>
      );
    case 'compressor':
      return (
        <div className="flex flex-col gap-2 p-2 bg-black/20 rounded-lg">
          {renderSlider('Threshold', 'threshold', -100, 0, 1)}
          {renderSlider('Ratio', 'ratio', 1, 20, 0.1)}
          {renderSlider('Attack', 'attack', 0, 1, 0.001)}
          {renderSlider('Release', 'release', 0, 1, 0.01)}
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
    <div className="flex flex-col gap-2 mt-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase font-bold text-slate-500">Effects</span>
        <select
          className="text-[10px] bg-black/30 border border-white/10 rounded px-1 py-0.5 text-slate-300 outline-none"
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

      <div className="flex flex-col gap-2">
        {effects.map(effect => (
          <div key={effect.id} className="bg-black/20 border border-white/5 rounded-lg p-2 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateEffect(effect.id, { enabled: !effect.enabled })}
                  className={`p-1 rounded ${effect.enabled ? 'text-sky-400 bg-sky-400/10' : 'text-slate-500 bg-black/30'}`}
                >
                  <Power size={12} />
                </button>
                <span className="text-xs font-medium text-slate-300 capitalize">{effect.type}</span>
              </div>
              <button
                onClick={() => onRemoveEffect(effect.id)}
                className="text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <EffectParams effect={effect} onChange={(updates) => onUpdateEffect(effect.id, updates)} />
          </div>
        ))}
      </div>
    </div>
  );
}
