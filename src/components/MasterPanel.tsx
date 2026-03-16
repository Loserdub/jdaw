import React from 'react';
import { useDAWStore } from '../lib/store';
import { Volume2 } from 'lucide-react';
import { EffectRack } from './EffectRack';

export function MasterPanel() {
  const { master, updateMaster, addMasterEffect, updateMasterEffect, removeMasterEffect } = useDAWStore();

  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-10 border-b border-white/5 flex justify-between items-center bg-white/5 px-4 shrink-0">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Master
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <button 
            onClick={() => updateMaster({ muted: !master.muted })}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${master.muted ? 'active-state text-amber-400 border-amber-500/50' : 'skeuo-button text-slate-400'}`}
          >
            M
          </button>
        </div>
        
        <div className="flex items-center gap-3 skeuo-input px-3 py-2 rounded-xl mb-3">
          <Volume2 size={14} className="text-slate-400 shrink-0" />
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={master.volume}
            onChange={(e) => updateMaster({ volume: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-emerald-400"
          />
        </div>

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
