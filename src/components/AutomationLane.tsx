import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useDAWStore, Track, AutomationPoint } from '../lib/store';
import { getAvailableTrackAutomationParams, AUTOMATION_PARAMS, evaluateAutomationCurve } from '../lib/automation';
import { Trash2, Plus, Sliders, X } from 'lucide-react';

interface AutomationLaneProps {
  track: Track;
  zoom: number;
  duration: number;
  playheadTime: number;
  snapTime: (time: number) => number;
}

export function AutomationLane({ track, zoom, duration, playheadTime, snapTime }: AutomationLaneProps) {
  const {
    setTrackAutomationParam,
    addAutomationPoint,
    updateAutomationPoint,
    removeAutomationPoint,
    clearTrackAutomation,
    toggleTrackAutomation
  } = useDAWStore();

  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; time: number; val: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableParams = useMemo(() => getAvailableTrackAutomationParams(track), [track]);
  const activeParamKey = track.activeAutomationParam || 'volume';
  const paramMeta = AUTOMATION_PARAMS[activeParamKey] || AUTOMATION_PARAMS['volume'];

  const automationData = track.automations?.[activeParamKey];
  const points = useMemo(() => {
    return [...(automationData?.points || [])].sort((a, b) => a.time - b.time);
  }, [automationData]);

  const laneHeight = 84;
  const totalWidth = duration * zoom;

  // Normalized (0..1) to Y coordinate
  const valToY = (val: number, height: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    return (height - 12) - clamped * (height - 24);
  };

  // Y coordinate to Normalized (0..1)
  const yToVal = (y: number, height: number) => {
    const norm = ((height - 12) - y) / (height - 24);
    return Math.max(0, Math.min(1, norm));
  };

  // Render vector curve on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = totalWidth;
    canvas.height = laneHeight;

    ctx.clearRect(0, 0, totalWidth, laneHeight);

    // ── 1. Horizontal Reference Guides ──
    const guideValues = [1.0, 0.5, 0.0];
    guideValues.forEach(v => {
      const y = valToY(v, laneHeight);
      ctx.strokeStyle = v === 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(totalWidth, y);
      ctx.stroke();
    });

    // ── 2. Vector Automation Curve ──
    const defaultNorm = paramMeta.defaultValue;
    const effectivePoints = points.length > 0 ? points : [];

    ctx.beginPath();
    if (effectivePoints.length === 0) {
      const y = valToY(defaultNorm, laneHeight);
      ctx.moveTo(0, y);
      ctx.lineTo(totalWidth, y);
    } else {
      // Start from time 0 with first point's value
      const firstY = valToY(effectivePoints[0].value, laneHeight);
      ctx.moveTo(0, firstY);
      ctx.lineTo(effectivePoints[0].time * zoom, firstY);

      for (let i = 1; i < effectivePoints.length; i++) {
        const pt = effectivePoints[i];
        const px = pt.time * zoom;
        const py = valToY(pt.value, laneHeight);
        ctx.lineTo(px, py);
      }

      // End at totalWidth with last point's value
      const lastPoint = effectivePoints[effectivePoints.length - 1];
      const lastY = valToY(lastPoint.value, laneHeight);
      ctx.lineTo(totalWidth, lastY);
    }

    // Fill under curve
    ctx.save();
    ctx.lineTo(totalWidth, laneHeight);
    ctx.lineTo(0, laneHeight);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, laneHeight);
    grad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Main Stroke Line
    ctx.beginPath();
    if (effectivePoints.length === 0) {
      const y = valToY(defaultNorm, laneHeight);
      ctx.moveTo(0, y);
      ctx.lineTo(totalWidth, y);
    } else {
      const firstY = valToY(effectivePoints[0].value, laneHeight);
      ctx.moveTo(0, firstY);
      ctx.lineTo(effectivePoints[0].time * zoom, firstY);

      for (let i = 1; i < effectivePoints.length; i++) {
        const pt = effectivePoints[i];
        ctx.lineTo(pt.time * zoom, valToY(pt.value, laneHeight));
      }

      const lastPoint = effectivePoints[effectivePoints.length - 1];
      ctx.lineTo(totalWidth, valToY(lastPoint.value, laneHeight));
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── 3. Draw Nodes ──
    effectivePoints.forEach(pt => {
      const nx = pt.time * zoom;
      const ny = valToY(pt.value, laneHeight);
      const isHovered = hoveredPointId === pt.id;
      const isDragging = draggingPointId === pt.id;

      if (isHovered || isDragging) {
        ctx.beginPath();
        ctx.arc(nx, ny, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(nx, ny, isDragging ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // ── 4. Playhead Follower Dot ──
    const currentNormVal = evaluateAutomationCurve(points, playheadTime, paramMeta.defaultValue);
    const playheadDotX = playheadTime * zoom;
    const playheadDotY = valToY(currentNormVal, laneHeight);

    ctx.beginPath();
    ctx.arc(playheadDotX, playheadDotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

  }, [points, totalWidth, laneHeight, zoom, hoveredPointId, draggingPointId, playheadTime, paramMeta]);

  // Handle Canvas Clicking (Add new node or select node)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check if clicked an existing point
    let foundPoint: AutomationPoint | null = null;
    for (const pt of points) {
      const px = pt.time * zoom;
      const py = valToY(pt.value, laneHeight);
      if (Math.hypot(clickX - px, clickY - py) <= 10) {
        foundPoint = pt;
        break;
      }
    }

    if (foundPoint) {
      if (e.button === 2) {
        // Right click to delete
        e.preventDefault();
        removeAutomationPoint(track.id, activeParamKey, foundPoint.id);
      } else {
        setDraggingPointId(foundPoint.id);
      }
    } else if (e.button === 0) {
      // Left click on empty space -> Add new point
      const clickedTime = snapTime(Math.max(0, clickX / zoom));
      const clickedVal = yToVal(clickY, laneHeight);
      addAutomationPoint(track.id, activeParamKey, clickedTime, clickedVal);
    }
  };

  // Node Dragging Effect
  useEffect(() => {
    if (!draggingPointId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = Math.max(0, Math.min(totalWidth, e.clientX - rect.left));
      const mouseY = Math.max(0, Math.min(laneHeight, e.clientY - rect.top));

      const newTime = snapTime(Math.max(0, mouseX / zoom));
      const newVal = yToVal(mouseY, laneHeight);

      updateAutomationPoint(track.id, activeParamKey, draggingPointId, {
        time: newTime,
        value: newVal
      });
    };

    const handleMouseUp = () => {
      setDraggingPointId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPointId, track.id, activeParamKey, totalWidth, laneHeight, zoom, snapTime]);

  // Hover tracker for cursor tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let hoveredId: string | null = null;
    for (const pt of points) {
      const px = pt.time * zoom;
      const py = valToY(pt.value, laneHeight);
      if (Math.hypot(x - px, y - py) <= 10) {
        hoveredId = pt.id;
        break;
      }
    }
    setHoveredPointId(hoveredId);

    const t = x / zoom;
    const v = yToVal(y, laneHeight);
    setMousePos({ x, y, time: t, val: v });
  };

  const handleMouseLeave = () => {
    setHoveredPointId(null);
    setMousePos(null);
  };

  const currentPlayheadVal = evaluateAutomationCurve(points, playheadTime, paramMeta.defaultValue);

  return (
    <div className="flex flex-col bg-zinc-950/90 border-b border-white/8 relative select-none">
      {/* ── Automation Header Bar (Sticky on Left) ── */}
      <div className="h-6 bg-black/60 border-b border-white/5 px-2 flex items-center justify-between sticky left-0 z-20 w-fit min-w-[280px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
            <Sliders size={10} />
            <span>Auto</span>
          </span>

          {/* Param Selector Dropdown */}
          <select
            value={activeParamKey}
            onChange={(e) => setTrackAutomationParam(track.id, e.target.value)}
            className="bg-black/60 border border-white/10 text-[9px] font-semibold text-zinc-300 rounded px-1.5 py-0.5 outline-none hover:border-amber-500/40 cursor-pointer"
          >
            {availableParams.map(p => (
              <option key={p.key} value={p.key} className="bg-zinc-900">
                {p.label}
              </option>
            ))}
          </select>

          {/* Current Real-time Value Readout */}
          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 tabular-nums">
            {paramMeta.format(currentPlayheadVal)}
          </span>
        </div>

        {/* Clear & Close */}
        <div className="flex items-center gap-1">
          {points.length > 0 && (
            <button
              onClick={() => clearTrackAutomation(track.id, activeParamKey)}
              className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors"
              title="Clear all automation points"
            >
              <Trash2 size={10} />
            </button>
          )}
          <button
            onClick={() => toggleTrackAutomation(track.id)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
            title="Hide Automation Lane"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* ── Interactive Automation Canvas Area ── */}
      <div
        ref={containerRef}
        className="relative cursor-crosshair overflow-hidden"
        style={{ width: `${totalWidth}px`, height: `${laneHeight}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="block w-full h-full pointer-events-none" />

        {/* Cursor Value Tooltip */}
        {mousePos && (
          <div
            className="absolute z-30 pointer-events-none bg-black/80 backdrop-blur-md border border-amber-500/30 px-1.5 py-0.5 rounded text-[8px] font-mono text-amber-300 shadow-lg -translate-x-1/2 -translate-y-6"
            style={{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }}
          >
            {paramMeta.format(mousePos.val)} @ {mousePos.time.toFixed(2)}s
          </div>
        )}
      </div>
    </div>
  );
}
