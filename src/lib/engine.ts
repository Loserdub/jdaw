import { useDAWStore, Track, Region, MidiNote, Bus } from './store';
import { EffectChain } from './effects';

export class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  masterEffects: EffectChain;
  
  // Track nodes
  trackGains: Map<string, GainNode> = new Map();
  trackPanners: Map<string, StereoPannerNode> = new Map();
  trackEffects: Map<string, EffectChain> = new Map();
  trackSends: Map<string, Map<string, GainNode>> = new Map(); // trackId -> busId -> GainNode
  
  // Bus nodes
  busGains: Map<string, GainNode> = new Map();
  busPanners: Map<string, StereoPannerNode> = new Map();
  busEffects: Map<string, EffectChain> = new Map();
  
  // Playback nodes
  activeSources: AudioBufferSourceNode[] = [];
  activeMidiOscillators: Map<string, { osc: OscillatorNode, gain: GainNode }[]> = new Map();
  
  // MIDI
  midiAccess: any = null;
  midiInitAttempted = false;
  activeMidiNotes: Map<number, { osc: OscillatorNode, gain: GainNode }> = new Map();
  recordedMidiNotes: MidiNote[] = [];
  
  // Recording & Monitoring
  mediaStream: MediaStream | null = null;
  mediaRecorder: MediaRecorder | null = null;
  monitorSource: MediaStreamAudioSourceNode | null = null;
  recordedChunks: Blob[] = [];
  recordStartTime = 0;
  armedTrackId: string | null = null;
  
  // Playhead
  playheadTime = 0; // logical time in seconds
  lastCtxTime = 0; // AudioContext time when playback started
  isPlaying = false;
  
  // Metronome
  nextNoteTime = 0;
  currentBeat = 0;
  
  // Callbacks
  private playheadListeners: Set<(time: number) => void> = new Set();
  animationFrameId: number | null = null;

  addPlayheadListener(listener: (time: number) => void) {
    this.playheadListeners.add(listener);
  }

  removePlayheadListener(listener: (time: number) => void) {
    this.playheadListeners.delete(listener);
  }

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterEffects = new EffectChain(this.ctx);
    
    this.masterGain.connect(this.masterEffects.input);
    this.masterEffects.output.connect(this.ctx.destination);
    
    const state = useDAWStore.getState();
    this.syncBuses(state.buses);
    this.syncTracks(state.tracks);
    this.syncMaster(state.master);
    
    // Subscribe to store changes to update gains and pans
    useDAWStore.subscribe((state, prevState) => {
      this.syncBuses(state.buses);
      this.syncTracks(state.tracks);
      this.syncMaster(state.master);
      
      // Handle input monitoring
      const armedTrack = state.tracks.find(t => t.armed);
      const prevArmedTrack = prevState.tracks.find(t => t.armed);
      
      if (armedTrack && !prevArmedTrack) {
        this.startInputMonitoring(armedTrack.id);
      } else if (!armedTrack && prevArmedTrack) {
        this.stopInputMonitoring();
      } else if (armedTrack && prevArmedTrack && (armedTrack.id !== prevArmedTrack.id || armedTrack.inputType !== prevArmedTrack.inputType)) {
        this.stopInputMonitoring();
        this.startInputMonitoring(armedTrack.id);
      }
    });
  }

  private syncMaster(master: Bus) {
    this.masterGain.gain.setTargetAtTime(master.muted ? 0 : master.volume, this.ctx.currentTime, 0.01);
    this.masterEffects.sync(master.effects);
  }

  private syncBuses(buses: Bus[]) {
    buses.forEach(bus => {
      if (!this.busGains.has(bus.id)) {
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        const effects = new EffectChain(this.ctx);
        
        gain.connect(effects.input);
        effects.output.connect(panner);
        panner.connect(this.masterGain);
        
        this.busGains.set(bus.id, gain);
        this.busPanners.set(bus.id, panner);
        this.busEffects.set(bus.id, effects);
      }
      
      const gain = this.busGains.get(bus.id)!;
      const panner = this.busPanners.get(bus.id)!;
      const effects = this.busEffects.get(bus.id)!;
      
      const anySolo = buses.some(b => b.solo);
      let effectiveVolume = bus.volume;
      if (bus.muted) effectiveVolume = 0;
      if (anySolo && !bus.solo) effectiveVolume = 0;
      
      try {
        gain.gain.setTargetAtTime(effectiveVolume, this.ctx.currentTime, 0.01);
        panner.pan.setTargetAtTime(bus.pan, this.ctx.currentTime, 0.01);
      } catch (e) {
        gain.gain.value = effectiveVolume;
        panner.pan.value = bus.pan;
      }
      
      effects.sync(bus.effects);
    });
    
    // Cleanup deleted buses
    this.busGains.forEach((gain, id) => {
      if (!buses.find(b => b.id === id)) {
        gain.disconnect();
        this.busPanners.get(id)?.disconnect();
        this.busEffects.get(id)?.disconnect();
        this.busGains.delete(id);
        this.busPanners.delete(id);
        this.busEffects.delete(id);
      }
    });
  }

  private syncTracks(tracks: Track[]) {
    tracks.forEach(track => {
      if (!this.trackGains.has(track.id)) {
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        const effects = new EffectChain(this.ctx);
        
        gain.connect(effects.input);
        effects.output.connect(panner);
        panner.connect(this.masterGain);
        
        this.trackGains.set(track.id, gain);
        this.trackPanners.set(track.id, panner);
        this.trackEffects.set(track.id, effects);
        this.trackSends.set(track.id, new Map());
      }
      
      const gain = this.trackGains.get(track.id)!;
      const panner = this.trackPanners.get(track.id)!;
      const effects = this.trackEffects.get(track.id)!;
      const sends = this.trackSends.get(track.id)!;
      
      const anySolo = tracks.some(t => t.solo);
      let effectiveVolume = track.volume;
      if (track.muted) effectiveVolume = 0;
      if (anySolo && !track.solo) effectiveVolume = 0;
      
      try {
        gain.gain.setTargetAtTime(effectiveVolume, this.ctx.currentTime, 0.01);
        panner.pan.setTargetAtTime(track.pan, this.ctx.currentTime, 0.01);
      } catch (e) {
        gain.gain.value = effectiveVolume;
        panner.pan.value = track.pan;
      }
      
      effects.sync(track.effects);
      
      // Sync sends
      track.sends.forEach(send => {
        if (!sends.has(send.busId)) {
          const sendGain = this.ctx.createGain();
          effects.output.connect(sendGain); // Post-fader, post-effects send
          const busGain = this.busGains.get(send.busId);
          if (busGain) {
            sendGain.connect(busGain);
          }
          sends.set(send.busId, sendGain);
        }
        const sendGain = sends.get(send.busId)!;
        try {
          sendGain.gain.setTargetAtTime(send.amount, this.ctx.currentTime, 0.01);
        } catch (e) {
          sendGain.gain.value = send.amount;
        }
      });
      
      // Cleanup deleted sends
      sends.forEach((sendGain, busId) => {
        if (!track.sends.find(s => s.busId === busId)) {
          sendGain.disconnect();
          sends.delete(busId);
        }
      });
    });
    
    // Cleanup deleted tracks
    this.trackGains.forEach((gain, id) => {
      if (!tracks.find(t => t.id === id)) {
        gain.disconnect();
        this.trackPanners.get(id)?.disconnect();
        this.trackEffects.get(id)?.disconnect();
        this.trackSends.get(id)?.forEach(s => s.disconnect());
        
        this.trackGains.delete(id);
        this.trackPanners.delete(id);
        this.trackEffects.delete(id);
        this.trackSends.delete(id);
      }
    });
  }

  async startInputMonitoring(trackId: string) {
    const track = useDAWStore.getState().tracks.find(t => t.id === trackId);
    
    if (track?.inputType === 'midi') {
      await this.initMidi(true);
      return;
    }

    if (track?.inputType !== 'microphone') return;

    try {
      await this.init();
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      if (this.monitorSource) {
        this.monitorSource.disconnect();
      }
      
      this.monitorSource = this.ctx.createMediaStreamSource(this.mediaStream);
      const trackGain = this.trackGains.get(trackId);
      
      if (trackGain) {
        this.monitorSource.connect(trackGain);
      }
    } catch (err) {
      console.error("[AudioEngine] Error accessing microphone for monitoring:", err);
    }
  }

  stopInputMonitoring() {
    if (this.monitorSource) {
      this.monitorSource.disconnect();
      this.monitorSource = null;
    }
    // We keep the mediaStream active so recording can start instantly,
    // or we can stop it if we want to release the mic.
    // Releasing the mic is better for privacy.
    if (this.mediaStream && !useDAWStore.getState().isRecording) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  async initMidi(showFeedback = false) {
    if (this.midiAccess) return;
    if (this.midiInitAttempted && !showFeedback) return;
    
    this.midiInitAttempted = true;

    if (navigator.requestMIDIAccess) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess();
        for (const input of this.midiAccess.inputs.values()) {
          input.onmidimessage = this.handleMidiMessage.bind(this);
        }
        this.midiAccess.onstatechange = () => {
          for (const input of this.midiAccess.inputs.values()) {
            input.onmidimessage = this.handleMidiMessage.bind(this);
          }
        };
      } catch (err) {
        console.error("[AudioEngine] MIDI access denied", err);
        if (showFeedback) {
          alert("Could not access MIDI devices. Please ensure you have granted permission in your browser settings.");
        }
      }
    } else {
      console.warn("[AudioEngine] Web MIDI API is not supported in this browser.");
      if (showFeedback) {
        alert("Your browser does not support Web MIDI. Try using Chrome or Edge to use MIDI features.");
      }
    }
  }

  async init() {
    if (this.ctx.state === 'suspended') {
      console.log('[AudioEngine] Resuming AudioContext...');
      await this.ctx.resume();
      console.log('[AudioEngine] AudioContext resumed.');
    }
    
    await this.initMidi(false);
  }

  handleMidiMessage(event: any) {
    const [status, data1, data2] = event.data;
    const command = status >> 4;
    const note = data1;
    const velocity = data2;

    const state = useDAWStore.getState();
    const armedTrack = state.tracks.find(t => t.armed && t.inputType === 'midi');
    
    if (!armedTrack) return;

    if (command === 9 && velocity > 0) {
      // Note On
      this.playMidiNote(note, velocity, armedTrack.id);
    } else if (command === 8 || (command === 9 && velocity === 0)) {
      // Note Off
      this.stopMidiNote(note);
    }
  }

  playMidiNote(note: number, velocity: number, trackId: string) {
    const trackGain = this.trackGains.get(trackId) || this.masterGain;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    
    osc.connect(gain);
    gain.connect(trackGain);
    
    const velocityNormalized = velocity / 127;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(velocityNormalized * 0.5, this.ctx.currentTime + 0.01);
    
    osc.start();
    
    this.activeMidiNotes.set(note, { osc, gain });
    
    if (useDAWStore.getState().isRecording) {
      this.recordedMidiNotes.push({
        note,
        velocity,
        start: this.playheadTime - this.recordStartTime,
        duration: 0 // Will be updated on Note Off
      });
    }
  }

  stopMidiNote(note: number) {
    const activeNote = this.activeMidiNotes.get(note);
    if (activeNote) {
      const { osc, gain } = activeNote;
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
      osc.stop(this.ctx.currentTime + 0.1);
      this.activeMidiNotes.delete(note);
      
      if (useDAWStore.getState().isRecording) {
        // Find the corresponding Note On event and set its duration
        for (let i = this.recordedMidiNotes.length - 1; i >= 0; i--) {
          const recordedNote = this.recordedMidiNotes[i];
          if (recordedNote.note === note && recordedNote.duration === 0) {
            recordedNote.duration = (this.playheadTime - this.recordStartTime) - recordedNote.start;
            break;
          }
        }
      }
    }
  }

  async play() {
    await this.init();
    if (this.isPlaying) return;
    
    console.log('[AudioEngine] Starting playback at', this.playheadTime);
    const state = useDAWStore.getState();
    if (state.loopEnabled && this.playheadTime >= state.loopEnd) {
      this.playheadTime = state.loopStart;
      this.playheadListeners.forEach(l => l(this.playheadTime));
    }
    
    this.isPlaying = true;
    this.lastCtxTime = this.ctx.currentTime;
    
    // Initialize metronome timing
    const secondsPerBeat = 60.0 / state.bpm;
    this.currentBeat = Math.ceil(this.playheadTime / secondsPerBeat);
    this.nextNoteTime = this.ctx.currentTime + (this.currentBeat * secondsPerBeat - this.playheadTime);
    
    // Schedule all regions that overlap with or are after the playhead
    state.regions.forEach(region => {
      const regionEnd = region.start + region.duration;
      if (regionEnd > this.playheadTime) {
        const trackGain = this.trackGains.get(region.trackId) || this.masterGain;
        
        if (region.buffer) {
          const source = this.ctx.createBufferSource();
          source.buffer = region.buffer;
          source.connect(trackGain);
          
          let offset = region.bufferOffset || 0;
          let delay = 0;
          
          if (this.playheadTime >= region.start) {
            offset += this.playheadTime - region.start;
            delay = 0;
          } else {
            delay = region.start - this.playheadTime;
          }
          
          source.start(this.ctx.currentTime + delay, offset, region.duration - (this.playheadTime > region.start ? this.playheadTime - region.start : 0));
          this.activeSources.push(source);
        } else if (region.midiNotes) {
          // Schedule MIDI notes
          const oscillators: { osc: OscillatorNode, gain: GainNode }[] = [];
          
          region.midiNotes.forEach(note => {
            const noteAbsoluteStart = region.start + note.start;
            const noteAbsoluteEnd = noteAbsoluteStart + note.duration;
            
            if (noteAbsoluteEnd > this.playheadTime) {
              const osc = this.ctx.createOscillator();
              const gain = this.ctx.createGain();
              
              osc.type = 'square';
              osc.frequency.value = 440 * Math.pow(2, (note.note - 69) / 12);
              
              osc.connect(gain);
              gain.connect(trackGain);
              
              let delay = 0;
              let duration = note.duration;
              
              if (this.playheadTime >= noteAbsoluteStart) {
                delay = 0;
                duration = noteAbsoluteEnd - this.playheadTime;
              } else {
                delay = noteAbsoluteStart - this.playheadTime;
              }
              
              const startTime = this.ctx.currentTime + delay;
              const velocityNormalized = note.velocity / 127;
              
              gain.gain.setValueAtTime(0, startTime);
              gain.gain.linearRampToValueAtTime(velocityNormalized * 0.5, startTime + 0.01);
              gain.gain.setValueAtTime(velocityNormalized * 0.5, startTime + duration - 0.01);
              gain.gain.linearRampToValueAtTime(0, startTime + duration);
              
              osc.start(startTime);
              osc.stop(startTime + duration);
              
              oscillators.push({ osc, gain });
            }
          });
          
          this.activeMidiOscillators.set(region.id, oscillators);
        }
      }
    });

    this.startPlayheadLoop();
  }

  stop() {
    if (!this.isPlaying && !this.mediaRecorder) return;
    
    console.log('[AudioEngine] Stopping playback/recording...');
    this.isPlaying = false;
    
    // Stop all active sources
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (e) {}
      source.disconnect();
    });
    this.activeSources = [];
    
    this.activeMidiOscillators.forEach(oscillators => {
      oscillators.forEach(({ osc, gain }) => {
        try { osc.stop(); } catch (e) {}
        osc.disconnect();
        gain.disconnect();
      });
    });
    this.activeMidiOscillators.clear();
    
    // Stop recording if active
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    } else if (useDAWStore.getState().isRecording && this.armedTrackId) {
      // Handle MIDI recording stop
      const track = useDAWStore.getState().tracks.find(t => t.id === this.armedTrackId);
      if (track && track.inputType === 'midi') {
        this.stopMidiRecording();
      }
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Update playhead position one last time
    this.updatePlayhead();
  }

  pause() {
    this.stop();
  }

  setPlayhead(time: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();
    this.playheadTime = Math.max(0, time);
    
    // Reset metronome tracking
    const state = useDAWStore.getState();
    const secondsPerBeat = 60.0 / state.bpm;
    this.currentBeat = Math.ceil(this.playheadTime / secondsPerBeat);
    this.nextNoteTime = this.ctx.currentTime + (this.currentBeat * secondsPerBeat - this.playheadTime);
    
    this.playheadListeners.forEach(l => l(this.playheadTime));
    if (wasPlaying) this.play();
  }

  async startRecording() {
    await this.init();
    const state = useDAWStore.getState();
    const armedTrack = state.tracks.find(t => t.armed);
    
    if (!armedTrack) {
      console.warn("[AudioEngine] No track armed for recording.");
      return;
    }
    
    if (armedTrack.inputType === 'midi') {
      await this.initMidi(true);
      if (!this.midiAccess) {
        console.warn("[AudioEngine] Cannot record MIDI: MIDI access not available.");
        return;
      }
      this.armedTrackId = armedTrack.id;
      this.recordStartTime = this.playheadTime;
      this.recordedMidiNotes = [];
      useDAWStore.getState().setRecording(true, this.recordStartTime);
      this.play();
      return;
    }

    if (armedTrack.inputType !== 'microphone') {
      console.warn(`[AudioEngine] Track is set to ${armedTrack.inputType}, not recording from mic. Starting playback instead.`);
      this.play();
      return;
    }
    
    this.armedTrackId = armedTrack.id;

    try {
      console.log('[AudioEngine] Requesting microphone access...');
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        console.log('[AudioEngine] MediaRecorder stopped. Processing chunks...', this.recordedChunks.length);
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          console.log('[AudioEngine] Decoding audio data...', arrayBuffer.byteLength, 'bytes');
          
          if (arrayBuffer.byteLength === 0) {
            throw new Error("Recorded audio is empty.");
          }

          const bufferCopy = arrayBuffer.slice(0);
          const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
            try {
              this.ctx.decodeAudioData(
                bufferCopy,
                (buffer) => resolve(buffer),
                (err) => reject(err || new Error("Unknown decoding error"))
              );
            } catch (e) {
              reject(e);
            }
          });
          console.log('[AudioEngine] Decoded successfully. Duration:', audioBuffer.duration);
          
          if (this.armedTrackId) {
            useDAWStore.getState().addRegion({
              id: Math.random().toString(36).substring(2, 9),
              trackId: this.armedTrackId,
              buffer: audioBuffer,
              start: this.recordStartTime,
              duration: audioBuffer.duration,
            });
          }
        } catch (decodeErr) {
          console.error('[AudioEngine] Failed to decode recorded audio:', decodeErr);
        }
        
        // Cleanup stream if not monitoring
        const currentState = useDAWStore.getState();
        const stillArmed = currentState.tracks.find(t => t.armed);
        
        if (!stillArmed && this.mediaStream) {
          this.mediaStream.getTracks().forEach(track => track.stop());
          this.mediaStream = null;
        }
        
        this.mediaRecorder = null;
        this.armedTrackId = null;
        
        useDAWStore.getState().setRecording(false);
      };
      
      this.recordStartTime = this.playheadTime;
      this.mediaRecorder.start();
      console.log('[AudioEngine] MediaRecorder started.');
      useDAWStore.getState().setRecording(true, this.recordStartTime);
      
      // Start playback of existing tracks
      this.play();
      
    } catch (err) {
      console.error("[AudioEngine] Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  }

  stopMidiRecording() {
    if (this.armedTrackId) {
      // Clean up any notes that were never released
      this.recordedMidiNotes.forEach(note => {
        if (note.duration === 0) {
          note.duration = (this.playheadTime - this.recordStartTime) - note.start;
        }
      });
      
      const duration = this.playheadTime - this.recordStartTime;
      
      // Only create a region if the duration is greater than 0
      if (duration > 0) {
        useDAWStore.getState().addRegion({
          id: Math.random().toString(36).substring(2, 9),
          trackId: this.armedTrackId,
          midiNotes: [...this.recordedMidiNotes],
          start: this.recordStartTime,
          duration: duration,
        });
      }
    }
    
    this.recordedMidiNotes = [];
    this.armedTrackId = null;
    useDAWStore.getState().setRecording(false);
  }

  private startPlayheadLoop() {
    const loop = () => {
      if (!this.isPlaying) return;
      this.updatePlayhead();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private updatePlayhead() {
    const now = this.ctx.currentTime;
    const delta = now - this.lastCtxTime;
    this.playheadTime += delta;
    this.lastCtxTime = now;
    
    const state = useDAWStore.getState();
    if (this.isPlaying && state.loopEnabled && state.loopEnd > state.loopStart && this.playheadTime >= state.loopEnd) {
      const overshoot = this.playheadTime - state.loopEnd;
      this.setPlayhead(state.loopStart + overshoot);
      return;
    }
    
    if (state.metronomeEnabled) {
      this.scheduleMetronome();
    }
    
    this.playheadListeners.forEach(l => l(this.playheadTime));
  }

  private scheduleMetronome() {
    const state = useDAWStore.getState();
    const secondsPerBeat = 60.0 / state.bpm;
    
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      // Schedule beep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      // High beep on downbeat (beat 0), lower beep on others
      osc.frequency.value = (this.currentBeat % 4 === 0) ? 1000 : 800;
      
      gain.gain.setValueAtTime(0, this.nextNoteTime);
      gain.gain.linearRampToValueAtTime(0.5, this.nextNoteTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, this.nextNoteTime + 0.1);
      
      osc.start(this.nextNoteTime);
      osc.stop(this.nextNoteTime + 0.1);
      
      // Advance to next beat
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat++;
    }
  }

  async exportAudio() {
    const state = useDAWStore.getState();
    const duration = state.duration;
    const sampleRate = this.ctx.sampleRate;
    
    // Create offline context
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    const offlineMasterGain = offlineCtx.createGain();
    const offlineMasterEffects = new EffectChain(offlineCtx);
    
    offlineMasterGain.connect(offlineMasterEffects.input);
    offlineMasterEffects.output.connect(offlineCtx.destination);
    
    offlineMasterGain.gain.value = state.master.muted ? 0 : state.master.volume;
    offlineMasterEffects.sync(state.master.effects);
    
    // Setup buses
    const offlineBusGains = new Map<string, GainNode>();
    state.buses.forEach(bus => {
      const gain = offlineCtx.createGain();
      const panner = offlineCtx.createStereoPanner();
      const effects = new EffectChain(offlineCtx);
      
      gain.connect(effects.input);
      effects.output.connect(panner);
      panner.connect(offlineMasterGain);
      
      const anySolo = state.buses.some(b => b.solo);
      let effectiveVolume = bus.volume;
      if (bus.muted) effectiveVolume = 0;
      if (anySolo && !bus.solo) effectiveVolume = 0;
      
      gain.gain.value = effectiveVolume;
      panner.pan.value = bus.pan;
      effects.sync(bus.effects);
      
      offlineBusGains.set(bus.id, gain);
    });

    // Setup tracks
    const offlineTrackGains = new Map<string, GainNode>();
    state.tracks.forEach(track => {
      const gain = offlineCtx.createGain();
      const panner = offlineCtx.createStereoPanner();
      const effects = new EffectChain(offlineCtx);
      
      gain.connect(effects.input);
      effects.output.connect(panner);
      panner.connect(offlineMasterGain);
      
      const anySolo = state.tracks.some(t => t.solo);
      let effectiveVolume = track.volume;
      if (track.muted) effectiveVolume = 0;
      if (anySolo && !track.solo) effectiveVolume = 0;
      
      gain.gain.value = effectiveVolume;
      panner.pan.value = track.pan;
      effects.sync(track.effects);
      
      // Setup sends
      track.sends.forEach(send => {
        const sendGain = offlineCtx.createGain();
        sendGain.gain.value = send.amount;
        effects.output.connect(sendGain);
        const busGain = offlineBusGains.get(send.busId);
        if (busGain) {
          sendGain.connect(busGain);
        }
      });
      
      offlineTrackGains.set(track.id, gain);
    });
    
    // Schedule regions
    state.regions.forEach(region => {
      const trackGain = offlineTrackGains.get(region.trackId) || offlineMasterGain;
      
      if (region.buffer) {
        const source = offlineCtx.createBufferSource();
        source.buffer = region.buffer;
        source.connect(trackGain);
        source.start(region.start, region.bufferOffset || 0, region.duration);
      } else if (region.midiNotes) {
        region.midiNotes.forEach(note => {
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          
          osc.type = 'square';
          osc.frequency.value = 440 * Math.pow(2, (note.note - 69) / 12);
          
          osc.connect(gain);
          gain.connect(trackGain);
          
          const startTime = region.start + note.start;
          const velocityNormalized = note.velocity / 127;
          
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(velocityNormalized * 0.5, startTime + 0.01);
          gain.gain.setValueAtTime(velocityNormalized * 0.5, startTime + note.duration - 0.01);
          gain.gain.linearRampToValueAtTime(0, startTime + note.duration);
          
          osc.start(startTime);
          osc.stop(startTime + note.duration);
        });
      }
    });
    
    // Render
    console.log('[AudioEngine] Starting offline render...');
    const renderedBuffer = await offlineCtx.startRendering();
    console.log('[AudioEngine] Render complete.');
    
    // Convert to WAV
    const wavBlob = this.bufferToWave(renderedBuffer, renderedBuffer.length);
    
    // Download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'j-wave-export.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private bufferToWave(abuffer: AudioBuffer, len: number) {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for(i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while(pos < length) {
      for(i = 0; i < numOfChan; i++) {             // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true);          // write 16-bit sample
        pos += 2;
      }
      offset++                                     // next source sample
    }

    // create Blob
    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  }
}

// Singleton instance
export const engine = new AudioEngine();
