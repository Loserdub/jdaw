/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transport } from './components/Transport';
import { TrackList } from './components/TrackList';
import { Timeline } from './components/Timeline';
import { MasterPanel } from './components/MasterPanel';
import { Download } from 'lucide-react';
import { engine } from './lib/engine';
import { useState, useRef } from 'react';

export default function App() {
  const [isExporting, setIsExporting] = useState(false);
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

  return (
    <div className="flex flex-col h-screen font-sans overflow-hidden p-4 gap-4">
      <header className="glass-panel rounded-3xl flex items-center justify-between px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">
          <a href="https://www.jray.me" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-sky-300 transition-colors cursor-pointer">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h4l3-9 5 18 3-9h5"/>
            </svg>
            J-WAVE
          </a>
        </h1>
        <Transport />
        <button 
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 rounded-xl transition-colors border border-sky-500/30 disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? 'Exporting...' : 'Export WAV'}
        </button>
      </header>
      
      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col w-72 shrink-0">
          <TrackList scrollRef={leftScrollRef} onScroll={handleLeftScroll} />
        </div>
        <div className="glass-panel rounded-3xl overflow-hidden flex-1 relative">
          <Timeline scrollRef={rightScrollRef} onScroll={handleRightScroll} />
        </div>
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col w-72 shrink-0">
          <MasterPanel />
        </div>
      </div>
    </div>
  );
}
