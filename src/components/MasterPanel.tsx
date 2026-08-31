import React from 'react';
import { useDAWStore } from '../lib/store';
import { Volume2 } from 'lucide-react';
import { EffectRack } from './EffectRack';
import { LevelMeter } from './LevelMeter';

export function MasterPanel() {
  const { master, updateMaster, addMasterEffect, updateMasterEffect, removeMasterEffect } = useDAWStore();

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="h-10 border-b border-white/5 flex items-center justify-between bg-white/[0.03] px-3 shrink-0">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          Master
        </span>
        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          MAIN OUT
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
          <span className="text-[10px] text-zinc-400 font-medium">
            {master.muted ? 'Muted' : 'Live Output'}
          </span>
        </div>

        {/* Master Volume & Meter */}
        <div className="flex flex-col gap-2 bg-black/20 border border-white/5 p-2.5 rounded-xl">
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

          {/* Master VU / Peak Meter */}
          <div className="flex flex-col gap-1 px-1">
            <div className="flex justify-between text-[8px] font-mono text-zinc-500">
              <span>L/R PEAK</span>
              <span>0 dBFS</span>
            </div>
            <LevelMeter isMaster accentColor="emerald" showDbReadout />
          </div>
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
