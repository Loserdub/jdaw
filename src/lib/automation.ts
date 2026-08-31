import { AutomationPoint, Track } from './store';

export interface AutomationParamMeta {
  key: string;
  label: string;
  category: 'track' | 'effect';
  defaultValue: number; // normalized 0..1
  format: (normalizedVal: number) => string;
  toAudioValue: (normalizedVal: number) => number;
  fromAudioValue: (audioVal: number) => number;
}

export const AUTOMATION_PARAMS: Record<string, AutomationParamMeta> = {
  'volume': {
    key: 'volume',
    label: 'Track Volume',
    category: 'track',
    defaultValue: 0.8,
    format: (v) => `${Math.round(v * 100)}%`,
    toAudioValue: (v) => Math.max(0, Math.min(1, v)),
    fromAudioValue: (v) => Math.max(0, Math.min(1, v))
  },
  'pan': {
    key: 'pan',
    label: 'Stereo Pan',
    category: 'track',
    defaultValue: 0.5,
    format: (v) => {
      const p = Math.round((v * 2 - 1) * 100);
      if (p === 0) return 'Center';
      return p > 0 ? `R${p}` : `L${Math.abs(p)}`;
    },
    toAudioValue: (v) => Math.max(-1, Math.min(1, v * 2 - 1)),
    fromAudioValue: (v) => (v + 1) / 2
  },
  'reverb:mix': {
    key: 'reverb:mix',
    label: 'Reverb: Wet Mix',
    category: 'effect',
    defaultValue: 0.5,
    format: (v) => `${Math.round(v * 100)}%`,
    toAudioValue: (v) => Math.max(0, Math.min(1, v)),
    fromAudioValue: (v) => Math.max(0, Math.min(1, v))
  },
  'delay:mix': {
    key: 'delay:mix',
    label: 'Delay: Wet Mix',
    category: 'effect',
    defaultValue: 0.5,
    format: (v) => `${Math.round(v * 100)}%`,
    toAudioValue: (v) => Math.max(0, Math.min(1, v)),
    fromAudioValue: (v) => Math.max(0, Math.min(1, v))
  },
  'delay:feedback': {
    key: 'delay:feedback',
    label: 'Delay: Feedback',
    category: 'effect',
    defaultValue: 0.4 / 0.95,
    format: (v) => `${Math.round(v * 95)}%`,
    toAudioValue: (v) => Math.max(0, Math.min(0.95, v * 0.95)),
    fromAudioValue: (v) => v / 0.95
  },
  'eq:midGain': {
    key: 'eq:midGain',
    label: 'EQ: Mid Gain',
    category: 'effect',
    defaultValue: 0.5,
    format: (v) => {
      const db = (v * 48 - 24).toFixed(1);
      return `${Number(db) > 0 ? '+' : ''}${db} dB`;
    },
    toAudioValue: (v) => v * 48 - 24,
    fromAudioValue: (v) => (v + 24) / 48
  },
  'eq:lowGain': {
    key: 'eq:lowGain',
    label: 'EQ: Low Gain',
    category: 'effect',
    defaultValue: 0.5,
    format: (v) => {
      const db = (v * 48 - 24).toFixed(1);
      return `${Number(db) > 0 ? '+' : ''}${db} dB`;
    },
    toAudioValue: (v) => v * 48 - 24,
    fromAudioValue: (v) => (v + 24) / 48
  },
  'eq:highGain': {
    key: 'eq:highGain',
    label: 'EQ: High Gain',
    category: 'effect',
    defaultValue: 0.5,
    format: (v) => {
      const db = (v * 48 - 24).toFixed(1);
      return `${Number(db) > 0 ? '+' : ''}${db} dB`;
    },
    toAudioValue: (v) => v * 48 - 24,
    fromAudioValue: (v) => (v + 24) / 48
  }
};

/**
 * Gets available automation parameters for a given track based on its inserted effects.
 */
export function getAvailableTrackAutomationParams(track: Track): AutomationParamMeta[] {
  const params: AutomationParamMeta[] = [
    AUTOMATION_PARAMS['volume'],
    AUTOMATION_PARAMS['pan']
  ];

  track.effects.forEach(eff => {
    if (eff.type === 'reverb' && AUTOMATION_PARAMS['reverb:mix']) {
      params.push(AUTOMATION_PARAMS['reverb:mix']);
    }
    if (eff.type === 'delay') {
      if (AUTOMATION_PARAMS['delay:mix']) params.push(AUTOMATION_PARAMS['delay:mix']);
      if (AUTOMATION_PARAMS['delay:feedback']) params.push(AUTOMATION_PARAMS['delay:feedback']);
    }
    if (eff.type === 'eq') {
      if (AUTOMATION_PARAMS['eq:lowGain']) params.push(AUTOMATION_PARAMS['eq:lowGain']);
      if (AUTOMATION_PARAMS['eq:midGain']) params.push(AUTOMATION_PARAMS['eq:midGain']);
      if (AUTOMATION_PARAMS['eq:highGain']) params.push(AUTOMATION_PARAMS['eq:highGain']);
    }
  });

  return params;
}

/**
 * Computes the interpolated normalized value (0..1) at a specific timestamp.
 */
export function evaluateAutomationCurve(
  points: AutomationPoint[] | undefined,
  time: number,
  defaultNormalizedVal: number
): number {
  if (!points || points.length === 0) return defaultNormalizedVal;
  if (points.length === 1) return points[0].value;

  // Sorted by time
  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  // Find surrounding segment
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    if (time >= p1.time && time <= p2.time) {
      if (p2.time === p1.time) return p1.value;
      const alpha = (time - p1.time) / (p2.time - p1.time);
      return p1.value + alpha * (p2.value - p1.value);
    }
  }

  return defaultNormalizedVal;
}
