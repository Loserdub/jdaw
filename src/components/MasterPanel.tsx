import React from 'react';
import { useDAWStore } from '../lib/store';
import { Volume2 } from 'lucide-react';
import { EffectRack } from './EffectRack';

export function MasterPanel() {
  const { master, updateMaster, addMasterEffect, updateMasterEffect, removeMasterEffect } = useDAWStore();

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="h-10 border-b border-white/5 flex items-center bg-white/[0.03] px-3 shrink-0">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          Master
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Mute */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateMaster({ muted: !master.muted })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
              master.muted
                ? 'bg-amber-500/15 border border-amber-500/35 text-amber-400'
                : 'skeuo-button text-zinc-500 hover:text-zinc-200'
            }`}
            title="Mute Master"
          >
            M
          </button>
          <span className="text-[10px] text-zinc-500">
            {master.muted ? 'Muted' : 'Live'}
          </span>
        </div>

        {/* Master Volume */}
        <div className="flex items-center gap-2 skeuo-input px-2.5 py-1.5 rounded-xl">
          <Volume2 size={12} className="text-emerald-400 shrink-0" />
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={master.volume}
            onChange={(e) => updateMaster({ volume: parseFloat(e.target.value) })}
            className="w-full range-emerald"
          />
          <span className="text-[9px] font-mono text-zinc-500 w-7 text-right tabular-nums glow-emerald text-emerald-400">
            {Math.round(master.volume * 100)}
          </span>
        </div>

        {/* Master Effects */}
        <EffectRack
          effects={master.effects}
          onAddEffect={(type) => addMasterEffect(type)}
          onUpdateEffect={(effectId, updates) => updateMasterEffect(effectId, updates)}
          onRemoveEffect={(effectId) => removeMasterEffect(effectId)}
        />
      </div>
    </div>
  );
}
