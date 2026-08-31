/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Transport } from './components/Transport';
import { TrackList } from './components/TrackList';
import { Timeline } from './components/Timeline';
import { MasterPanel } from './components/MasterPanel';
import { BottomPanel } from './components/BottomPanel';
import { Download } from 'lucide-react';
import { engine } from './lib/engine';
import { importAudioFile } from './lib/audioImport';

type SidePanel = 'tracks' | 'master';

export default function App() {
  const [isExporting, setIsExporting] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('tracks');
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await engine.exportAudio();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export audio.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleRightScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftScrollRef.current) {
      leftScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleGlobalDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(
        f => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|aiff|weba)$/i.test(f.name)
      );
      for (const file of files) {
        await importAudioFile(file);
      }
    }
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden p-2 md:p-3 gap-2 md:gap-3"
      onDrop={handleGlobalDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ── Header / Transport Bar ── */}
      <header className="glass-panel rounded-2xl flex items-center justify-between px-4 md:px-5 py-2.5 shrink-0 gap-3">
        {/* Logo */}
        <h1 className="text-base font-bold tracking-tight text-amber-400 glow-amber shrink-0">
          <a
            href="https://trustnodelogic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-amber-300 transition-all group"
            title="Visit Trust Node Logic (Justin Ray)"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-105 transition-transform">
              <path d="M2 12h4l3-9 5 18 3-9h5"/>
            </svg>
            <span className="font-bold tracking-wider">J-DAW</span>
          </a>
        </h1>

        {/* Transport — fills center */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <Transport />
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-colors border border-amber-500/25 disabled:opacity-40 text-xs font-semibold shrink-0"
        >
          <Download size={13} />
          <span className="hidden sm:inline">{isExporting ? 'Exporting…' : 'Export WAV'}</span>
          <span className="sm:hidden">{isExporting ? '…' : 'WAV'}</span>
        </button>
      </header>

      {/* ── Main Area ── */}
      <div className="flex flex-1 gap-2 md:gap-3 overflow-hidden min-h-0">

        {/* ── Left: Track / Master Panel (desktop side-by-side, mobile tabbed) ── */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col w-56 md:w-64 lg:w-72 shrink-0">
          {/* Mobile tab strip */}
          <div className="flex gap-1 px-2 pt-2 border-b border-white/5 shrink-0 md:hidden">
            <button
              className={`tab-btn ${sidePanel === 'tracks' ? 'active' : ''}`}
              onClick={() => setSidePanel('tracks')}
            >
              Tracks
            </button>
            <button
              className={`tab-btn ${sidePanel === 'master' ? 'active' : ''}`}
              onClick={() => setSidePanel('master')}
            >
              Master
            </button>
          </div>

          {/* Tracks tab content */}
          <div className={`flex-1 overflow-hidden flex-col ${sidePanel === 'tracks' ? 'flex' : 'hidden'} md:flex`}>
            <TrackList scrollRef={leftScrollRef} onScroll={handleLeftScroll} />
          </div>

          {/* Master tab content — mobile only (desktop uses dedicated right column) */}
          <div className={`flex-1 overflow-hidden flex-col ${sidePanel === 'master' ? 'flex' : 'hidden'} md:hidden`}>
            <MasterPanel />
          </div>
        </div>

        {/* ── Center: Timeline ── */}
        <div className="glass-panel rounded-2xl overflow-hidden flex-1 relative min-w-0">
          <Timeline scrollRef={rightScrollRef} onScroll={handleRightScroll} />
        </div>

        {/* ── Right: Master Panel (desktop only) ── */}
        <div className={`glass-panel rounded-2xl overflow-hidden flex-col w-56 md:w-60 lg:w-64 shrink-0 hidden md:flex`}>
          <MasterPanel />
        </div>
      </div>

      {/* ── Bottom Panel ── */}
      <BottomPanel />

      {/* ── Bottom Footer / Copyright Bar ── */}
      <footer className="flex items-center justify-between px-2 text-[10px] text-zinc-500 font-mono shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <span>© {new Date().getFullYear()} Justin Ray</span>
          <span className="text-zinc-700">•</span>
          <a
            href="https://trustnodelogic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400/80 hover:text-amber-300 transition-colors hover:underline"
          >
            trustnodelogic.com
          </a>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-zinc-600 text-[9px]">
          <span>All Rights Reserved</span>
          <span className="text-zinc-700">•</span>
          <span>Web Audio DAW</span>
        </div>
      </footer>
    </div>
  );
}
