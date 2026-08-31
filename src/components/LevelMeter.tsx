import React, { useEffect, useRef, useState } from 'react';
import { engine } from '../lib/engine';

interface LevelMeterProps {
  trackId?: string;
  isMaster?: boolean;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  showClipIndicator?: boolean;
  showDbReadout?: boolean;
  accentColor?: 'amber' | 'emerald';
}

export function LevelMeter({
  trackId,
  isMaster = false,
  orientation = 'horizontal',
  className = '',
  showClipIndicator = true,
  showDbReadout = false,
  accentColor = 'amber'
}: LevelMeterProps) {
  const [level, setLevel] = useState(0);
  const [peakHold, setPeakHold] = useState(0);
  const [isClipped, setIsClipped] = useState(false);

  const levelRef = useRef(0);
  const peakHoldRef = useRef(0);
  const peakHoldTimerRef = useRef<number>(0);
  const clipTimerRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const updateMeter = () => {
      if (!active) return;

      const data = isMaster
        ? engine.getMasterLevel()
        : trackId
        ? engine.getTrackLevel(trackId)
        : { peak: 0, rms: 0, isClipping: false };

      const instantPeak = Math.max(0, Math.min(1.2, data.peak));

      // Smooth falloff decay
      if (instantPeak > levelRef.current) {
        levelRef.current = instantPeak;
      } else {
        levelRef.current = Math.max(0, levelRef.current * 0.88 - 0.005);
      }

      // Peak hold logic
      const now = performance.now();
      if (instantPeak >= peakHoldRef.current) {
        peakHoldRef.current = instantPeak;
        peakHoldTimerRef.current = now + 1200; // Hold for 1.2s
      } else if (now > peakHoldTimerRef.current) {
        peakHoldRef.current = Math.max(0, peakHoldRef.current * 0.94 - 0.01);
      }

      // Clip indicator logic
      if (data.isClipping) {
        clipTimerRef.current = now + 2000; // Light up for 2s
      }

      setLevel(levelRef.current);
      setPeakHold(peakHoldRef.current);
      setIsClipped(now < clipTimerRef.current);

      animFrameRef.current = requestAnimationFrame(updateMeter);
    };

    animFrameRef.current = requestAnimationFrame(updateMeter);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [trackId, isMaster]);

  // Convert normalized level (0-1) to percentage (0-100%)
  const levelPercent = Math.min(100, Math.round(level * 100));
  const peakHoldPercent = Math.min(100, Math.round(peakHold * 100));

  // Convert level to dB (approximate 0dB = 1.0, -60dB = 0.001)
  const dbValue = level > 0.0001 ? (20 * Math.log10(level)).toFixed(1) : '-inf';

  if (orientation === 'vertical') {
    return (
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        {/* Clip LED */}
        {showClipIndicator && (
          <div
            className={`w-2.5 h-1.5 rounded-sm transition-colors cursor-pointer ${
              isClipped
                ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse'
                : 'bg-zinc-800'
            }`}
            onClick={() => {
              clipTimerRef.current = 0;
              setIsClipped(false);
            }}
            title="Clip Indicator (Click to reset)"
          />
        )}

        {/* Vertical Meter Bar */}
        <div className="relative w-2 bg-black/60 rounded-full overflow-hidden border border-white/5 h-28 flex flex-col justify-end">
          {/* Main Meter Fill */}
          <div
            className={`w-full rounded-full transition-all duration-75 ${
              accentColor === 'emerald'
                ? 'bg-gradient-to-t from-emerald-600 via-emerald-400 to-amber-400'
                : 'bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500'
            }`}
            style={{ height: `${levelPercent}%` }}
          />

          {/* Peak Hold Line */}
          {peakHoldPercent > 1 && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white shadow-[0_0_4px_#fff]"
              style={{ bottom: `${peakHoldPercent}%` }}
            />
          )}
        </div>

        {/* dB readout */}
        {showDbReadout && (
          <span className="text-[8px] font-mono text-zinc-500 tabular-nums">
            {dbValue}
          </span>
        )}
      </div>
    );
  }

  // Horizontal Meter Bar (Default)
  return (
    <div className={`flex items-center gap-1.5 w-full ${className}`}>
      {/* Horizontal Meter Track */}
      <div className="relative flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
        {/* Fill */}
        <div
          className={`h-full rounded-full transition-all duration-75 ${
            accentColor === 'emerald'
              ? 'bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-400'
              : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
          }`}
          style={{ width: `${levelPercent}%` }}
        />

        {/* Peak Hold Tick */}
        {peakHoldPercent > 2 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_#fff]"
            style={{ left: `${peakHoldPercent}%` }}
          />
        )}
      </div>

      {/* Clip Indicator LED */}
      {showClipIndicator && (
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors cursor-pointer ${
            isClipped
              ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse'
              : 'bg-zinc-800'
          }`}
          onClick={() => {
            clipTimerRef.current = 0;
            setIsClipped(false);
          }}
          title="Clip Indicator"
        />
      )}

      {/* dB readout */}
      {showDbReadout && (
        <span className="text-[8px] font-mono text-zinc-500 tabular-nums w-8 text-right shrink-0">
          {dbValue}
        </span>
      )}
    </div>
  );
}
