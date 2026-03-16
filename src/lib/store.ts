import { create } from 'zustand';

export type InputType = 'microphone' | 'midi' | 'file';

export type EffectType = 'reverb' | 'delay' | 'eq' | 'compressor';

export interface AudioEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface Track {
  id: string;
  name: string;
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  muted: boolean;
  solo: boolean;
  armed: boolean;
  inputType: InputType;
  effects: AudioEffect[];
  sends: { busId: string; amount: number }[];
}

export interface Bus {
  id: string;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effects: AudioEffect[];
}

export interface MidiNote {
  note: number;
  velocity: number;
  start: number; // offset from region start in seconds
  duration: number; // in seconds
}

export interface Region {
  id: string;
  trackId: string;
  buffer?: AudioBuffer;
  midiNotes?: MidiNote[];
  start: number; // offset in seconds
  duration: number; // total duration of the region
  bufferOffset?: number; // offset into the audio buffer in seconds
}

interface DAWState {
  tracks: Track[];
  buses: Bus[];
  master: Bus;
  regions: Region[];
  isPlaying: boolean;
  isRecording: boolean;
  recordStartTime: number;
  duration: number; // total duration of the project in seconds
  bpm: number;
  metronomeEnabled: boolean;
  
  addTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addTrackEffect: (trackId: string, type: EffectType) => void;
  updateTrackEffect: (trackId: string, effectId: string, updates: Partial<AudioEffect>) => void;
  removeTrackEffect: (trackId: string, effectId: string) => void;
  updateTrackSend: (trackId: string, busId: string, amount: number) => void;

  addBus: () => void;
  removeBus: (id: string) => void;
  updateBus: (id: string, updates: Partial<Bus>) => void;
  addBusEffect: (busId: string, type: EffectType) => void;
  updateBusEffect: (busId: string, effectId: string, updates: Partial<AudioEffect>) => void;
  removeBusEffect: (busId: string, effectId: string) => void;

  updateMaster: (updates: Partial<Bus>) => void;
  addMasterEffect: (type: EffectType) => void;
  updateMasterEffect: (effectId: string, updates: Partial<AudioEffect>) => void;
  removeMasterEffect: (effectId: string) => void;

  addRegion: (region: Region) => void;
  updateRegion: (id: string, updates: Partial<Region>) => void;
  removeRegion: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean, startTime?: number) => void;
  setDuration: (duration: number) => void;
  setBpm: (bpm: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  
  snapToGrid: boolean;
  setSnapToGrid: (enabled: boolean) => void;
  
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopRegion: (start: number, end: number) => void;
  
  clipboardRegion: Region | null;
  setClipboardRegion: (region: Region | null) => void;
  splitRegion: (id: string, splitTime: number) => void;
  joinRegions: (id1: string, id2: string) => void;
  trimRegion: (id: string, newStart: number, newDuration: number, newBufferOffset?: number) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const defaultEffectParams: Record<EffectType, Record<string, number>> = {
  reverb: { mix: 0.5, decay: 2.0, preDelay: 0.01 },
  delay: { mix: 0.5, time: 0.3, feedback: 0.4 },
  eq: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 250, midFreq: 1000, highFreq: 4000 },
  compressor: { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }
};

export const useDAWStore = create<DAWState>((set) => ({
  tracks: [
    { id: generateId(), name: 'Audio 1', volume: 0.8, pan: 0, muted: false, solo: false, armed: false, inputType: 'microphone', effects: [], sends: [] }
  ],
  buses: [],
  master: { id: 'master', name: 'Master', volume: 1.0, pan: 0, muted: false, solo: false, effects: [] },
  regions: [],
  isPlaying: false,
  isRecording: false,
  recordStartTime: 0,
  duration: 60, // default 1 minute
  bpm: 120,
  metronomeEnabled: false,
  snapToGrid: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 4,
  clipboardRegion: null,
  
  addTrack: () => set((state) => ({
    tracks: [...state.tracks, { id: generateId(), name: `Audio ${state.tracks.length + 1}`, volume: 0.8, pan: 0, muted: false, solo: false, armed: false, inputType: 'microphone', effects: [], sends: [] }]
  })),
  
  removeTrack: (id) => set((state) => ({
    tracks: state.tracks.filter(t => t.id !== id),
    regions: state.regions.filter(r => r.trackId !== id)
  })),
  
  updateTrack: (id, updates) => set((state) => ({
    tracks: state.tracks.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  addTrackEffect: (trackId, type) => set((state) => ({
    tracks: state.tracks.map(t => t.id === trackId ? {
      ...t,
      effects: [...t.effects, { id: generateId(), type, enabled: true, params: { ...defaultEffectParams[type] } }]
    } : t)
  })),

  updateTrackEffect: (trackId, effectId, updates) => set((state) => ({
    tracks: state.tracks.map(t => t.id === trackId ? {
      ...t,
      effects: t.effects.map(e => e.id === effectId ? { ...e, ...updates, params: { ...e.params, ...(updates.params || {}) } } : e)
    } : t)
  })),

  removeTrackEffect: (trackId, effectId) => set((state) => ({
    tracks: state.tracks.map(t => t.id === trackId ? {
      ...t,
      effects: t.effects.filter(e => e.id !== effectId)
    } : t)
  })),

  updateTrackSend: (trackId, busId, amount) => set((state) => ({
    tracks: state.tracks.map(t => {
      if (t.id !== trackId) return t;
      const existingSend = t.sends.find(s => s.busId === busId);
      if (existingSend) {
        return { ...t, sends: t.sends.map(s => s.busId === busId ? { ...s, amount } : s) };
      } else {
        return { ...t, sends: [...t.sends, { busId, amount }] };
      }
    })
  })),

  addBus: () => set((state) => ({
    buses: [...state.buses, { id: generateId(), name: `Bus ${String.fromCharCode(65 + state.buses.length)}`, volume: 0.8, pan: 0, muted: false, solo: false, effects: [] }]
  })),

  removeBus: (id) => set((state) => ({
    buses: state.buses.filter(b => b.id !== id),
    tracks: state.tracks.map(t => ({ ...t, sends: t.sends.filter(s => s.busId !== id) }))
  })),

  updateBus: (id, updates) => set((state) => ({
    buses: state.buses.map(b => b.id === id ? { ...b, ...updates } : b)
  })),

  addBusEffect: (busId, type) => set((state) => ({
    buses: state.buses.map(b => b.id === busId ? {
      ...b,
      effects: [...b.effects, { id: generateId(), type, enabled: true, params: { ...defaultEffectParams[type] } }]
    } : b)
  })),

  updateBusEffect: (busId, effectId, updates) => set((state) => ({
    buses: state.buses.map(b => b.id === busId ? {
      ...b,
      effects: b.effects.map(e => e.id === effectId ? { ...e, ...updates, params: { ...e.params, ...(updates.params || {}) } } : e)
    } : b)
  })),

  removeBusEffect: (busId, effectId) => set((state) => ({
    buses: state.buses.map(b => b.id === busId ? {
      ...b,
      effects: b.effects.filter(e => e.id !== effectId)
    } : b)
  })),

  updateMaster: (updates) => set((state) => ({
    master: { ...state.master, ...updates }
  })),

  addMasterEffect: (type) => set((state) => ({
    master: {
      ...state.master,
      effects: [...state.master.effects, { id: generateId(), type, enabled: true, params: { ...defaultEffectParams[type] } }]
    }
  })),

  updateMasterEffect: (effectId, updates) => set((state) => ({
    master: {
      ...state.master,
      effects: state.master.effects.map(e => e.id === effectId ? { ...e, ...updates, params: { ...e.params, ...(updates.params || {}) } } : e)
    }
  })),

  removeMasterEffect: (effectId) => set((state) => ({
    master: {
      ...state.master,
      effects: state.master.effects.filter(e => e.id !== effectId)
    }
  })),

  addRegion: (region) => set((state) => ({
    regions: [...state.regions, region]
  })),
  
  updateRegion: (id, updates) => set((state) => ({
    regions: state.regions.map(r => r.id === id ? { ...r, ...updates } : r)
  })),
  
  removeRegion: (id) => set((state) => ({
    regions: state.regions.filter(r => r.id !== id)
  })),
  
  setPlaying: (isPlaying) => set({ isPlaying }),
  setRecording: (isRecording, startTime = 0) => set({ isRecording, recordStartTime: startTime }),
  setDuration: (duration) => set({ duration }),
  setBpm: (bpm) => set({ bpm }),
  setMetronomeEnabled: (metronomeEnabled) => set({ metronomeEnabled }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  
  setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
  setLoopRegion: (loopStart, loopEnd) => set({ loopStart, loopEnd }),
  
  setClipboardRegion: (clipboardRegion) => set({ clipboardRegion }),
  
  splitRegion: (id, splitTime) => set((state) => {
    const region = state.regions.find(r => r.id === id);
    if (!region) return state;
    
    if (splitTime <= region.start || splitTime >= region.start + region.duration) {
      return state;
    }
    
    const localSplitTime = splitTime - region.start;
    
    const region1: Region = {
      ...region,
      duration: localSplitTime,
      midiNotes: region.midiNotes ? region.midiNotes.filter(n => n.start < localSplitTime).map(n => ({
        ...n,
        duration: Math.min(n.duration, localSplitTime - n.start)
      })) : undefined
    };
    
    const region2: Region = {
      ...region,
      id: generateId(),
      start: splitTime,
      duration: region.duration - localSplitTime,
      bufferOffset: (region.bufferOffset || 0) + localSplitTime,
      midiNotes: region.midiNotes ? region.midiNotes.filter(n => n.start + n.duration > localSplitTime).map(n => ({
        ...n,
        start: Math.max(0, n.start - localSplitTime),
        duration: n.start < localSplitTime ? n.duration - (localSplitTime - n.start) : n.duration
      })) : undefined
    };
    
    return {
      regions: [...state.regions.filter(r => r.id !== id), region1, region2]
    };
  }),
  
  joinRegions: (id1, id2) => set((state) => {
    const r1 = state.regions.find(r => r.id === id1);
    const r2 = state.regions.find(r => r.id === id2);
    if (!r1 || !r2 || r1.trackId !== r2.trackId) return state;
    
    const [first, second] = r1.start <= r2.start ? [r1, r2] : [r2, r1];
    const newDuration = Math.max(first.duration, (second.start + second.duration) - first.start);
    
    const newRegion: Region = {
      ...first,
      duration: newDuration,
    };
    
    if (first.midiNotes && second.midiNotes) {
      const secondNotesShifted = second.midiNotes.map(n => ({
        ...n,
        start: n.start + (second.start - first.start)
      }));
      newRegion.midiNotes = [...first.midiNotes, ...secondNotesShifted];
    } else if (first.buffer && second.buffer && first.buffer === second.buffer) {
      // Audio regions sharing the same buffer can be merged by expanding duration
    } else {
      // Cannot join different audio buffers easily without rendering
      return state;
    }
    
    return {
      regions: [...state.regions.filter(r => r.id !== id1 && r.id !== id2), newRegion]
    };
  }),
  
  trimRegion: (id, newStart, newDuration, newBufferOffset) => set((state) => {
    const region = state.regions.find(r => r.id === id);
    if (!region) return state;
    
    const updatedRegion: Region = {
      ...region,
      start: newStart,
      duration: newDuration,
    };
    
    if (newBufferOffset !== undefined) {
      updatedRegion.bufferOffset = newBufferOffset;
    }
    
    return {
      regions: state.regions.map(r => r.id === id ? updatedRegion : r)
    };
  }),
}));
