import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useDAWStore, AudioEffect } from '../lib/store';
import { engine } from '../lib/engine';
import { Sliders, Power, RotateCcw, Sparkles, Activity, Check, Volume2 } from 'lucide-react';

interface BandConfig {
  id: number;
  name: string;
  type: 'lowshelf' | 'peaking' | 'highshelf';
  color: string;
  freqKey: string;
  gainKey: string;
  qKey: string;
  defaultFreq: number;
  minFreq: number;
  maxFreq: number;
}

const BANDS: BandConfig[] = [
  { id: 1, name: 'Low', type: 'lowshelf', color: '#38bdf8', freqKey: 'lowFreq', gainKey: 'lowGain', qKey: 'lowQ', defaultFreq: 100, minFreq: 20, maxFreq: 800 },
  { id: 2, name: 'Low Mid', type: 'peaking', color: '#f59e0b', freqKey: 'midFreq', gainKey: 'midGain', qKey: 'midQ', defaultFreq: 1000, minFreq: 100, maxFreq: 6000 },
  { id: 3, name: 'High Mid', type: 'peaking', color: '#f97316', freqKey: 'highMidFreq', gainKey: 'highMidGain', qKey: 'highMidQ', defaultFreq: 3500, minFreq: 500, maxFreq: 14000 },
  { id: 4, name: 'High', type: 'highshelf', color: '#c084fc', freqKey: 'highFreq', gainKey: 'highGain', qKey: 'highQ', defaultFreq: 8000, minFreq: 1500, maxFreq: 20000 }
];

const PRESETS: Record<string, Record<string, number>> = {
  'Vocal Clarity': { lowFreq: 120, lowGain: -3, lowQ: 0.7, midFreq: 500, midGain: -2.5, midQ: 1.2, highMidFreq: 3200, highMidGain: 3, highMidQ: 1.0, highFreq: 10000, highGain: 2.5, highQ: 0.7 },
  'Bass Punch': { lowFreq: 80, lowGain: 4.5, lowQ: 0.8, midFreq: 350, midGain: -3, midQ: 1.4, highMidFreq: 2500, highMidGain: 1, highMidQ: 1.0, highFreq: 7000, highGain: 0, highQ: 0.7 },
  'Acoustic Warmth': { lowFreq: 150, lowGain: 2, lowQ: 0.7, midFreq: 800, midGain: -1.5, midQ: 1.0, highMidFreq: 4500, highMidGain: 2, highMidQ: 0.9, highFreq: 12000, highGain: 3, highQ: 0.8 },
  'Mid Scoop': { lowFreq: 100, lowGain: 2.5, lowQ: 0.7, midFreq: 1000, midGain: -5, midQ: 1.2, highMidFreq: 3000, highMidGain: -3, highMidQ: 1.2, highFreq: 9000, highGain: 3.5, highQ: 0.7 },
  'Flat / Reset': { lowFreq: 100, lowGain: 0, lowQ: 0.7, midFreq: 1000, midGain: 0, midQ: 1.0, highMidFreq: 3500, highMidGain: 0, highMidQ: 1.0, highFreq: 8000, highGain: 0, highQ: 0.7 }
};

export function VisualEQ() {
  const {
    tracks,
    selectedTrackId,
    master,
    addTrackEffect,
    updateTrackEffect,
    addMasterEffect,
    updateMasterEffect
  } = useDAWStore();

  const [targetScope, setTargetScope] = useState<'track' | 'master'>('track');
  const [activeBandIndex, setActiveBandIndex] = useState<number>(1);
  const [isDraggingNode, setIsDraggingNode] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // Find existing EQ or target effect
  const activeEffect: AudioEffect | null = useMemo(() => {
    if (targetScope === 'track') {
      return selectedTrack?.effects.find(e => e.type === 'eq') || null;
    } else {
      return master.effects.find(e => e.type === 'eq') || null;
    }
  }, [targetScope, selectedTrack, master]);

  // Ensure EQ exists on track/master
  const handleEnsureEQ = () => {
    if (targetScope === 'track' && selectedTrack) {
      addTrackEffect(selectedTrack.id, 'eq');
    } else if (targetScope === 'master') {
      addMasterEffect('eq');
    }
  };

  const updateParam = (key: string, val: number) => {
    if (!activeEffect) return;
    const newParams = { ...activeEffect.params, [key]: val };
    if (targetScope === 'track' && selectedTrack) {
      updateTrackEffect(selectedTrack.id, activeEffect.id, { params: newParams });
    } else if (targetScope === 'master') {
      updateMasterEffect(activeEffect.id, { params: newParams });
    }
  };

  const setAllParams = (params: Record<string, number>) => {
    if (!activeEffect) return;
    if (targetScope === 'track' && selectedTrack) {
      updateTrackEffect(selectedTrack.id, activeEffect.id, { params });
    } else if (targetScope === 'master') {
      updateMasterEffect(activeEffect.id, { params });
    }
  };

  const toggleBypass = () => {
    if (!activeEffect) return;
    if (targetScope === 'track' && selectedTrack) {
      updateTrackEffect(selectedTrack.id, activeEffect.id, { enabled: !activeEffect.enabled });
    } else if (targetScope === 'master') {
      updateMasterEffect(activeEffect.id, { enabled: !activeEffect.enabled });
    }
  };

  // Convert log frequency (20Hz - 20000Hz) to canvas X
  const freqToX = (freq: number, width: number) => {
    const minF = Math.log10(20);
    const maxF = Math.log10(20000);
    const f = Math.log10(Math.max(20, Math.min(20000, freq)));
    return ((f - minF) / (maxF - minF)) * width;
  };

  // Convert canvas X to log frequency
  const xToFreq = (x: number, width: number) => {
    const minF = Math.log10(20);
    const maxF = Math.log10(20000);
    const norm = Math.max(0, Math.min(1, x / width));
    return Math.pow(10, minF + norm * (maxF - minF));
  };

  // Convert dB (-18 to +18) to canvas Y
  const dbToY = (db: number, height: number) => {
    const maxDb = 18;
    const norm = Math.max(-maxDb, Math.min(maxDb, db)) / maxDb;
    return (height / 2) - norm * (height / 2) * 0.85;
  };

  // Convert canvas Y to dB
  const yToDb = (y: number, height: number) => {
    const maxDb = 18;
    const norm = ((height / 2) - y) / ((height / 2) * 0.85);
    return Math.max(-maxDb, Math.min(maxDb, norm * maxDb));
  };

  // Mathematical Biquad magnitude response calculation
  const calcBiquadResponse = (freq: number, type: 'lowshelf' | 'peaking' | 'highshelf', f0: number, gainDb: number, Q: number): number => {
    if (gainDb === 0) return 0;
    const w = 2 * Math.PI * (freq / 44100);
    const w0 = 2 * Math.PI * (f0 / 44100);
    const A = Math.pow(10, gainDb / 40);
    const alpha = Math.sin(w0) / (2 * Q);

    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

    if (type === 'peaking') {
      b0 = 1 + alpha * A;
      b1 = -2 * Math.cos(w0);
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * Math.cos(w0);
      a2 = 1 - alpha / A;
    } else if (type === 'lowshelf') {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * Math.cos(w0) + sq);
      b1 = 2 * A * ((A - 1) - (A + 1) * Math.cos(w0));
      b2 = A * ((A + 1) - (A - 1) * Math.cos(w0) - sq);
      a0 = (A + 1) + (A - 1) * Math.cos(w0) + sq;
      a1 = -2 * ((A - 1) + (A + 1) * Math.cos(w0));
      a2 = (A + 1) + (A - 1) * Math.cos(w0) - sq;
    } else if (type === 'highshelf') {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * Math.cos(w0) + sq);
      b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w0));
      b2 = A * ((A + 1) + (A - 1) * Math.cos(w0) - sq);
      a0 = (A + 1) - (A - 1) * Math.cos(w0) + sq;
      a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w0));
      a2 = (A + 1) - (A - 1) * Math.cos(w0) - sq;
    }

    const phi = Math.sin(w / 2) ** 2;
    const num = (b0 + b1 + b2) ** 2 - 4 * (b0 * b1 + 4 * b0 * b2 + b1 * b2) * phi + 16 * b0 * b2 * phi ** 2;
    const den = (a0 + a1 + a2) ** 2 - 4 * (a0 * a1 + 4 * a0 * a2 + a1 * a2) * phi + 16 * a0 * a2 * phi ** 2;

    if (den <= 0 || num <= 0) return 0;
    const mag = Math.sqrt(num / den);
    return 20 * Math.log10(mag);
  };

  // Render Canvas Loop (60 FPS FFT Spectrum + Curve + Node Handles)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;

    const render = () => {
      if (!active) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // ── 1. Background Grid & Frequency Guides ──
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;

      const freqLines = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000];
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '8px monospace';

      freqLines.forEach(freq => {
        const x = freqToX(freq, width);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        ctx.fillText(label, x + 2, height - 4);
      });

      // Decibel Grid Lines
      const dbLines = [12, 6, 0, -6, -12];
      dbLines.forEach(db => {
        const y = dbToY(db, height);
        ctx.strokeStyle = db === 0 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = db === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 4, y - 2);
      });

      // ── 2. Live FFT Frequency Spectrum ──
      const freqData = engine.getFrequencyData(targetScope === 'track' ? selectedTrackId : null);
      if (freqData && freqData.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, height);

        const binCount = freqData.length;
        const nyquist = 22050;

        for (let i = 0; i < binCount; i++) {
          const binFreq = (i / binCount) * nyquist;
          if (binFreq < 20 || binFreq > 20000) continue;

          const x = freqToX(binFreq, width);
          const val = freqData[i] / 255; // 0 to 1
          const y = height - val * height * 0.9;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const specGradient = ctx.createLinearGradient(0, 0, 0, height);
        specGradient.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        specGradient.addColorStop(0.6, 'rgba(245, 158, 11, 0.1)');
        specGradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
        ctx.fillStyle = specGradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── 3. Composite EQ Curve ──
      const params = activeEffect?.params || {};
      const enabled = activeEffect?.enabled ?? true;

      const p1 = { f: params.lowFreq ?? 100, g: params.lowGain ?? 0, q: params.lowQ ?? 0.7 };
      const p2 = { f: params.midFreq ?? 1000, g: params.midGain ?? 0, q: params.midQ ?? 1.0 };
      const p3 = { f: params.highMidFreq ?? 3500, g: params.highMidGain ?? 0, q: params.highMidQ ?? 1.0 };
      const p4 = { f: params.highFreq ?? 8000, g: params.highGain ?? 0, q: params.highQ ?? 0.7 };

      const points: { x: number; y: number }[] = [];
      const numSteps = 160;

      for (let s = 0; s <= numSteps; s++) {
        const x = (s / numSteps) * width;
        const f = xToFreq(x, width);

        let totalDb = 0;
        if (enabled) {
          totalDb += calcBiquadResponse(f, 'lowshelf', p1.f, p1.g, p1.q);
          totalDb += calcBiquadResponse(f, 'peaking', p2.f, p2.g, p2.q);
          totalDb += calcBiquadResponse(f, 'peaking', p3.f, p3.g, p3.q);
          totalDb += calcBiquadResponse(f, 'highshelf', p4.f, p4.g, p4.q);
        }

        const y = dbToY(totalDb, height);
        points.push({ x, y });
      }

      // Filled Area under EQ Curve
      if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(width, height / 2);
        ctx.lineTo(0, height / 2);
        ctx.closePath();

        const curveFill = ctx.createLinearGradient(0, 0, 0, height);
        curveFill.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
        curveFill.addColorStop(0.5, 'rgba(245, 158, 11, 0.05)');
        curveFill.addColorStop(1, 'rgba(245, 158, 11, 0.15)');
        ctx.fillStyle = curveFill;
        ctx.fill();

        // Main Curve Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.strokeStyle = enabled ? '#f59e0b' : '#71717a';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = enabled ? '#f59e0b' : 'transparent';
        ctx.shadowBlur = enabled ? 8 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── 4. Band Interactive Node Handles ──
      BANDS.forEach((band, idx) => {
        const fKey = band.freqKey;
        const gKey = band.gainKey;
        const freq = params[fKey] ?? band.defaultFreq;
        const gain = enabled ? (params[gKey] ?? 0) : 0;

        const nx = freqToX(freq, width);
        const ny = dbToY(gain, height);
        const isSelected = activeBandIndex === idx;

        // Outer glow on selected/active
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.fill();
        }

        // Inner node dot
        ctx.beginPath();
        ctx.arc(nx, ny, isSelected ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle = band.color;
        ctx.shadowColor = band.color;
        ctx.shadowBlur = isSelected ? 10 : 4;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Band number label on node
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${band.id}`, nx, ny);
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeEffect, targetScope, selectedTrackId, activeBandIndex]);

  // Dragging Node Logic
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !activeEffect) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const params = activeEffect.params || {};

    // Find closest band node
    let closestBand = -1;
    let minDist = 30; // 30px hit radius

    BANDS.forEach((band, idx) => {
      const f = params[band.freqKey] ?? band.defaultFreq;
      const g = params[band.gainKey] ?? 0;
      const nx = freqToX(f, width);
      const ny = dbToY(g, height);
      const dist = Math.hypot(clickX - nx, clickY - ny);
      if (dist < minDist) {
        minDist = dist;
        closestBand = idx;
      }
    });

    if (closestBand !== -1) {
      setActiveBandIndex(closestBand);
      setIsDraggingNode(closestBand);
    }
  };

  useEffect(() => {
    if (isDraggingNode === null || !activeEffect) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const mouseX = Math.max(0, Math.min(width, e.clientX - rect.left));
      const mouseY = Math.max(0, Math.min(height, e.clientY - rect.top));

      const band = BANDS[isDraggingNode];
      const newFreq = Math.round(Math.max(band.minFreq, Math.min(band.maxFreq, xToFreq(mouseX, width))));
      const newGain = parseFloat(yToDb(mouseY, height).toFixed(1));

      updateParam(band.freqKey, newFreq);
      updateParam(band.gainKey, newGain);
    };

    const handleMouseUp = () => {
      setIsDraggingNode(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingNode, activeEffect]);

  // Mouse wheel to adjust Q-factor on canvas
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!activeEffect) return;

    const band = BANDS[activeBandIndex];
    const currentQ = activeEffect.params[band.qKey] ?? 1.0;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newQ = Math.max(0.2, Math.min(8.0, parseFloat((currentQ + delta).toFixed(2))));
    updateParam(band.qKey, newQ);
  };

  const activeBand = BANDS[activeBandIndex];
  const currentParams = activeEffect?.params || {};

  return (
    <div className="flex flex-col h-full bg-zinc-950/85 rounded-2xl overflow-hidden border border-white/5 select-none">
      {/* ── Top Header Toolbar ── */}
      <div className="h-10 bg-white/[0.03] border-b border-white/8 px-3 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase tracking-wider">
            <Activity size={13} />
            <span>Parametric EQ</span>
          </div>

          {/* Scope Selector: Track vs Master */}
          <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => setTargetScope('track')}
              className={`px-2 py-0.5 rounded-md text-[9px] font-semibold transition-colors ${
                targetScope === 'track' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {selectedTrack ? selectedTrack.name : 'Track'}
            </button>
            <button
              onClick={() => setTargetScope('master')}
              className={`px-2 py-0.5 rounded-md text-[9px] font-semibold transition-colors ${
                targetScope === 'master' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Master
            </button>
          </div>
        </div>

        {/* Action Controls & Presets */}
        {activeEffect ? (
          <div className="flex items-center gap-2">
            {/* Presets dropdown */}
            <select
              onChange={(e) => {
                if (e.target.value && PRESETS[e.target.value]) {
                  setAllParams(PRESETS[e.target.value]);
                  e.target.value = '';
                }
              }}
              className="bg-black/50 border border-white/10 text-[9px] font-medium text-zinc-300 rounded px-1.5 py-0.5 outline-none hover:border-amber-500/40 cursor-pointer"
              value=""
            >
              <option value="" disabled>Presets</option>
              {Object.keys(PRESETS).map(name => (
                <option key={name} value={name} className="bg-zinc-900">{name}</option>
              ))}
            </select>

            {/* Bypass Button */}
            <button
              onClick={toggleBypass}
              className={`p-1.5 rounded-lg transition-all border ${
                activeEffect.enabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  : 'bg-zinc-900 border-white/5 text-zinc-600'
              }`}
              title="Toggle EQ Bypass"
            >
              <Power size={11} />
            </button>

            {/* Reset */}
            <button
              onClick={() => setAllParams(PRESETS['Flat / Reset'])}
              className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors"
              title="Reset EQ to Flat"
            >
              <RotateCcw size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleEnsureEQ}
            className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors"
          >
            <Sparkles size={11} />
            <span>Enable EQ on {targetScope === 'track' ? 'Track' : 'Master'}</span>
          </button>
        )}
      </div>

      {/* ── Main Interactive Canvas ── */}
      {!activeEffect ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2">
          <Activity size={24} className="text-zinc-600 mb-1" />
          <p className="text-xs">No EQ inserted on this {targetScope}.</p>
          <button
            onClick={handleEnsureEQ}
            className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors mt-2"
          >
            <Sparkles size={12} /> Insert 4-Band Visual EQ
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Canvas Graph Viewport */}
          <div className="flex-1 relative cursor-crosshair bg-black/40 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-full block"
              onMouseDown={handleMouseDown}
              onWheel={handleWheel}
            />

            {/* Live Readout Badge for Selected Band */}
            <div className="absolute top-2 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-lg text-[9px] font-mono shadow-xl pointer-events-none">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeBand.color }} />
              <span className="text-zinc-400 font-semibold">{activeBand.name}:</span>
              <span className="text-amber-400 font-bold">{currentParams[activeBand.freqKey] ?? activeBand.defaultFreq}Hz</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-200">{(currentParams[activeBand.gainKey] ?? 0) > 0 ? '+' : ''}{(currentParams[activeBand.gainKey] ?? 0).toFixed(1)}dB</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Q: {(currentParams[activeBand.qKey] ?? 1.0).toFixed(2)}</span>
            </div>
          </div>

          {/* ── Bottom 4-Band Strip Controls ── */}
          <div className="h-16 bg-white/[0.02] border-t border-white/5 px-2 py-1.5 flex items-center justify-between gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            {BANDS.map((band, idx) => {
              const isSelected = activeBandIndex === idx;
              const freq = currentParams[band.freqKey] ?? band.defaultFreq;
              const gain = currentParams[band.gainKey] ?? 0;
              const q = currentParams[band.qKey] ?? (idx === 0 || idx === 3 ? 0.7 : 1.0);

              return (
                <div
                  key={band.id}
                  onClick={() => setActiveBandIndex(idx)}
                  className={`flex-1 min-w-[110px] p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/[0.08] border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                      : 'bg-black/30 border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between text-[8px] font-bold">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: band.color }} />
                      <span className={isSelected ? 'text-amber-300' : 'text-zinc-400'}>{band.name}</span>
                    </div>
                    <span className="font-mono text-zinc-500 font-normal">{freq}Hz</span>
                  </div>

                  <div className="flex items-center justify-between text-[8px] font-mono mt-0.5">
                    <span className={gain > 0 ? 'text-emerald-400' : gain < 0 ? 'text-amber-400' : 'text-zinc-500'}>
                      {gain > 0 ? '+' : ''}{gain.toFixed(1)}dB
                    </span>
                    <span className="text-zinc-500">Q:{q.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
