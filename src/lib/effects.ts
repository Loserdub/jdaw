import { AudioEffect } from './store';

export abstract class BaseEffect {
  input: GainNode;
  output: GainNode;
  ctx: BaseAudioContext;
  enabled: boolean = true;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
  }

  abstract updateParams(params: Record<string, number>): void;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.updateRouting();
  }

  protected abstract updateRouting(): void;

  disconnect() {
    this.input.disconnect();
    this.output.disconnect();
  }
}

export class ReverbEffect extends BaseEffect {
  convolver: ConvolverNode;
  wetGain: GainNode;
  dryGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.convolver = ctx.createConvolver();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();

    this.updateRouting();
  }

  protected updateRouting() {
    this.input.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();

    if (this.enabled) {
      this.input.connect(this.convolver);
      this.convolver.connect(this.wetGain);
      this.wetGain.connect(this.output);

      this.input.connect(this.dryGain);
      this.dryGain.connect(this.output);
    } else {
      this.input.connect(this.output);
    }
  }

  updateParams(params: Record<string, number>) {
    const mix = params.mix ?? 0.5;
    this.dryGain.gain.value = 1 - mix;
    this.wetGain.gain.value = mix;

    // Re-generate IR if decay changes
    if (params.decay && (!this.convolver.buffer || this.convolver.buffer.duration !== params.decay)) {
      this.convolver.buffer = this.generateImpulseResponse(params.decay);
    }
  }

  private generateImpulseResponse(duration: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (sampleRate * (duration / 5)));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    return impulse;
  }
}

export class DelayEffect extends BaseEffect {
  delay: DelayNode;
  feedback: GainNode;
  wetGain: GainNode;
  dryGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = ctx.createDelay(5.0);
    this.feedback = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();

    this.updateRouting();
  }

  protected updateRouting() {
    this.input.disconnect();
    this.delay.disconnect();
    this.feedback.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();

    if (this.enabled) {
      this.input.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wetGain);
      this.wetGain.connect(this.output);

      this.input.connect(this.dryGain);
      this.dryGain.connect(this.output);
    } else {
      this.input.connect(this.output);
    }
  }

  updateParams(params: Record<string, number>) {
    if (params.time !== undefined) this.delay.delayTime.value = params.time;
    if (params.feedback !== undefined) this.feedback.gain.value = params.feedback;
    
    const mix = params.mix ?? 0.5;
    this.dryGain.gain.value = 1 - mix;
    this.wetGain.gain.value = mix;
  }
}

export class EQEffect extends BaseEffect {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  highMid: BiquadFilterNode;
  high: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 100;
    this.low.gain.value = 0;
    
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.gain.value = 0;
    this.mid.Q.value = 1.0;

    this.highMid = ctx.createBiquadFilter();
    this.highMid.type = 'peaking';
    this.highMid.frequency.value = 3500;
    this.highMid.gain.value = 0;
    this.highMid.Q.value = 1.0;
    
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 8000;
    this.high.gain.value = 0;

    this.updateRouting();
  }

  protected updateRouting() {
    this.input.disconnect();
    this.low.disconnect();
    this.mid.disconnect();
    this.highMid.disconnect();
    this.high.disconnect();

    if (this.enabled) {
      this.input.connect(this.low);
      this.low.connect(this.mid);
      this.mid.connect(this.highMid);
      this.highMid.connect(this.high);
      this.high.connect(this.output);
    } else {
      this.input.connect(this.output);
    }
  }

  updateParams(params: Record<string, number>) {
    if (params.lowFreq !== undefined) this.low.frequency.value = Math.max(20, Math.min(1000, params.lowFreq));
    if (params.lowGain !== undefined) this.low.gain.value = Math.max(-24, Math.min(24, params.lowGain));
    if (params.lowQ !== undefined) this.low.Q.value = Math.max(0.1, Math.min(10, params.lowQ));
    
    if (params.midFreq !== undefined) this.mid.frequency.value = Math.max(100, Math.min(8000, params.midFreq));
    if (params.midGain !== undefined) this.mid.gain.value = Math.max(-24, Math.min(24, params.midGain));
    if (params.midQ !== undefined) this.mid.Q.value = Math.max(0.1, Math.min(10, params.midQ));

    if (params.highMidFreq !== undefined) this.highMid.frequency.value = Math.max(500, Math.min(16000, params.highMidFreq));
    if (params.highMidGain !== undefined) this.highMid.gain.value = Math.max(-24, Math.min(24, params.highMidGain));
    if (params.highMidQ !== undefined) this.highMid.Q.value = Math.max(0.1, Math.min(10, params.highMidQ));
    
    if (params.highFreq !== undefined) this.high.frequency.value = Math.max(1000, Math.min(20000, params.highFreq));
    if (params.highGain !== undefined) this.high.gain.value = Math.max(-24, Math.min(24, params.highGain));
    if (params.highQ !== undefined) this.high.Q.value = Math.max(0.1, Math.min(10, params.highQ));
  }
}

export class CompressorEffect extends BaseEffect {
  compressor: DynamicsCompressorNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.compressor = ctx.createDynamicsCompressor();
    this.updateRouting();
  }

  protected updateRouting() {
    this.input.disconnect();
    this.compressor.disconnect();

    if (this.enabled) {
      this.input.connect(this.compressor);
      this.compressor.connect(this.output);
    } else {
      this.input.connect(this.output);
    }
  }

  updateParams(params: Record<string, number>) {
    if (params.threshold !== undefined) this.compressor.threshold.value = params.threshold;
    if (params.knee !== undefined) this.compressor.knee.value = params.knee;
    if (params.ratio !== undefined) this.compressor.ratio.value = params.ratio;
    if (params.attack !== undefined) this.compressor.attack.value = params.attack;
    if (params.release !== undefined) this.compressor.release.value = params.release;
  }
}

export function createEffect(ctx: BaseAudioContext, type: string): BaseEffect {
  switch (type) {
    case 'reverb': return new ReverbEffect(ctx);
    case 'delay': return new DelayEffect(ctx);
    case 'eq': return new EQEffect(ctx);
    case 'compressor': return new CompressorEffect(ctx);
    default: throw new Error(`Unknown effect type: ${type}`);
  }
}

export class EffectChain {
  ctx: BaseAudioContext;
  input: GainNode;
  output: GainNode;
  effects: Map<string, BaseEffect> = new Map();
  effectOrder: string[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  sync(effectConfigs: AudioEffect[]) {
    const newOrder = effectConfigs.map(e => e.id);
    let needsRebuild = false;

    // Check for new or removed effects, or order changes
    if (this.effectOrder.length !== newOrder.length || !this.effectOrder.every((id, i) => id === newOrder[i])) {
      needsRebuild = true;
    }

    // Remove old effects
    for (const id of this.effects.keys()) {
      if (!newOrder.includes(id)) {
        this.effects.get(id)?.disconnect();
        this.effects.delete(id);
        needsRebuild = true;
      }
    }

    // Add new effects and update params
    for (const config of effectConfigs) {
      let effect = this.effects.get(config.id);
      if (!effect) {
        effect = createEffect(this.ctx, config.type);
        this.effects.set(config.id, effect);
        needsRebuild = true;
      }
      effect.setEnabled(config.enabled);
      effect.updateParams(config.params);
    }

    if (needsRebuild) {
      this.effectOrder = newOrder;
      this.rebuildChain();
    }
  }

  private rebuildChain() {
    this.input.disconnect();
    for (const effect of this.effects.values()) {
      effect.output.disconnect();
    }

    let currentNode: AudioNode = this.input;

    for (const id of this.effectOrder) {
      const effect = this.effects.get(id);
      if (effect) {
        currentNode.connect(effect.input);
        currentNode = effect.output;
      }
    }

    currentNode.connect(this.output);
  }

  disconnect() {
    this.input.disconnect();
    this.output.disconnect();
    for (const effect of this.effects.values()) {
      effect.disconnect();
    }
    this.effects.clear();
  }
}
