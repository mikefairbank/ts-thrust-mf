var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const volumeTable = new Float32Array(16);
{
  let f = 1;
  for (let i = 0; i < 15; i++) {
    volumeTable[i] = f / 4;
    f *= Math.pow(10, -0.1);
  }
  volumeTable[15] = 0;
}
const mosToChipChannel = [3, 2, 1, 0];
const pitchLookupTableLow = [
  240,
  183,
  130,
  79,
  32,
  243,
  200,
  160,
  123,
  87,
  53,
  22
];
const pitchLookupTableHigh = [
  231,
  215,
  203,
  195,
  183,
  170,
  162,
  154,
  146,
  138,
  130,
  122
];
const channelPitchOffset = [0, 0, 1, 2];
const LFSR_INITIAL = 16384;
const LATCH_FLAG = 128;
const CHANNEL_MASK = 3;
const VOLUME_MASK = 15;
const NOISE_CONTROL_MASK = 7;
const PERIOD_LOW_MASK = 15;
const PERIOD_HIGH_MASK = 63;
const PERIOD_UPPER_BITS = 1008;
const NOISE_PERIOD_512 = 16;
const NOISE_PERIOD_1024 = 32;
const NOISE_PERIOD_2048 = 64;
const WHITE_NOISE_FLAG = 4;
const PERIOD_10BIT_MASK = 1023;
const MOS_VOLUME_SILENT = 199;
const MOS_VOLUME_LOUDEST = 63;
const MOS_VOLUME_CLAMP_SILENT = 192;
const MOS_NO_ENVELOPE = 255;
const MOS_BUFFER_MASK = 15;
const MOS_OCCUPIED_FLAG = 128;
const MOS_HOLD_FLAG = 4;
const MOS_COUNTDOWN_INITIAL = 5;
const MOS_CHANNEL_FLUSH_FLAG = 16;
const MOS_VOLUME_OFFSET = 64;
const MOS_VOLUME_CHANGE_MASK = 248;
const MOS_CHIP_VOLUME_XOR = 15;
const MOS_STEP_LENGTH_MASK = 127;
const MOS_AUTO_REPEAT_FLAG = 128;
const MOS_VOLUME_OFF = 15;
const MOS_PERIOD_HIGH_MASK = 3;
const PITCH_SECTION_COMPLETE = 3;
const RELEASE_COMPLETE = 4;
class SN76489 {
  // effective noise period
  constructor() {
    __publicField(this, "period", new Uint16Array(4));
    // 10-bit tone period or 3-bit noise control
    __publicField(this, "counter", new Float64Array(4));
    // fractional counters for sample-rate conversion
    __publicField(this, "polarity", [1, 1, 1, 1]);
    // +1 or -1
    __publicField(this, "vol", new Float32Array(4));
    // looked-up volume per channel
    __publicField(this, "lfsr", LFSR_INITIAL);
    // 15-bit linear feedback shift register
    __publicField(this, "latchedReg", 0);
    // last latched register index (0-7)
    __publicField(this, "noisePeriod", NOISE_PERIOD_512);
    for (let i = 0; i < 4; i++) this.vol[i] = 0;
  }
  write(value) {
    if (value & LATCH_FLAG) {
      const channel = value >> 5 & CHANNEL_MASK;
      const isVolume = value >> 4 & 1;
      this.latchedReg = channel << 1 | isVolume;
      if (isVolume) {
        this.vol[channel] = volumeTable[value & VOLUME_MASK];
      } else if (channel === 3) {
        const newCtrl = value & NOISE_CONTROL_MASK;
        if (newCtrl !== this.period[3]) {
          this.lfsr = LFSR_INITIAL;
        }
        this.period[3] = newCtrl;
        this.updateNoisePeriod();
      } else {
        this.period[channel] = this.period[channel] & PERIOD_UPPER_BITS | value & PERIOD_LOW_MASK;
      }
    } else {
      const reg = this.latchedReg;
      const channel = reg >> 1;
      const isVolume = reg & 1;
      if (isVolume) {
        this.vol[channel] = volumeTable[value & VOLUME_MASK];
      } else if (channel === 3) {
        const newCtrl = value & NOISE_CONTROL_MASK;
        if (newCtrl !== this.period[3]) {
          this.lfsr = LFSR_INITIAL;
        }
        this.period[3] = newCtrl;
        this.updateNoisePeriod();
      } else {
        this.period[channel] = (value & PERIOD_HIGH_MASK) << 4 | this.period[channel] & PERIOD_LOW_MASK;
      }
    }
  }
  updateNoisePeriod() {
    const ctrl = this.period[3] & CHANNEL_MASK;
    if (ctrl === 0) this.noisePeriod = NOISE_PERIOD_512;
    else if (ctrl === 1) this.noisePeriod = NOISE_PERIOD_1024;
    else if (ctrl === 2) this.noisePeriod = NOISE_PERIOD_2048;
    else this.noisePeriod = 0;
  }
  generate(out, offset, length, sampleRate2) {
    const step = 25e4 / sampleRate2;
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (let ch = 0; ch < 3; ch++) {
        this.counter[ch] -= step;
        if (this.counter[ch] <= 0) {
          const p = this.period[ch] || 1024;
          this.counter[ch] += p;
          if (this.counter[ch] <= 0) this.counter[ch] = p;
          this.polarity[ch] = -this.polarity[ch];
        }
        sample += this.polarity[ch] * this.vol[ch];
      }
      this.counter[3] -= step;
      if (this.counter[3] <= 0) {
        const np = this.noisePeriod === 0 ? this.period[2] || 1024 : this.noisePeriod;
        this.counter[3] += np;
        if (this.counter[3] <= 0) this.counter[3] = np;
        const isWhite = (this.period[3] & WHITE_NOISE_FLAG) !== 0;
        if (isWhite) {
          const feedback = (this.lfsr & 1 ^ this.lfsr >> 1 & 1) << 14;
          this.lfsr = this.lfsr >> 1 | feedback;
        } else {
          this.lfsr >>= 1;
          if (this.lfsr === 0) this.lfsr = LFSR_INITIAL;
        }
      }
      sample += (this.lfsr & 1 ? 1 : -1) * this.vol[3];
      out[offset + i] = sample;
    }
  }
}
class MOSSoundChannel {
  constructor() {
    __publicField(this, "occupancy", 0);
    __publicField(this, "volume", MOS_VOLUME_SILENT);
    __publicField(this, "phaseCounter", 0);
    __publicField(this, "basePitch", 0);
    __publicField(this, "section", MOS_NO_ENVELOPE);
    __publicField(this, "sectionCountdownProgress", 0);
    __publicField(this, "duration", 0);
    __publicField(this, "countdown20Hz", MOS_COUNTDOWN_INITIAL);
    __publicField(this, "envelopeOffset", MOS_NO_ENVELOPE);
    __publicField(this, "stepCountdownProgress", 0);
    __publicField(this, "pitch", 0);
    __publicField(this, "pitchOffset", 0);
    // Circular buffer: 16 bytes, holds up to 5 sounds × 3 bytes
    __publicField(this, "buffer", new Uint8Array(16));
    __publicField(this, "bufReadPos", 0);
    __publicField(this, "bufWritePos", 0);
    __publicField(this, "bufCount", 0);
  }
  reset() {
    this.occupancy = 0;
    this.volume = MOS_VOLUME_SILENT;
    this.phaseCounter = 0;
    this.basePitch = 0;
    this.section = MOS_NO_ENVELOPE;
    this.sectionCountdownProgress = 0;
    this.duration = 0;
    this.countdown20Hz = MOS_COUNTDOWN_INITIAL;
    this.envelopeOffset = MOS_NO_ENVELOPE;
    this.stepCountdownProgress = 0;
    this.pitch = 0;
    this.pitchOffset = 0;
    this.bufReadPos = 0;
    this.bufWritePos = 0;
    this.bufCount = 0;
  }
  pushByte(b) {
    this.buffer[this.bufWritePos] = b;
    this.bufWritePos = this.bufWritePos + 1 & MOS_BUFFER_MASK;
  }
  popByte() {
    const b = this.buffer[this.bufReadPos];
    this.bufReadPos = this.bufReadPos + 1 & MOS_BUFFER_MASK;
    return b;
  }
  hasSound() {
    return this.bufCount > 0;
  }
  flushBuffer() {
    this.bufReadPos = 0;
    this.bufWritePos = 0;
    this.bufCount = 0;
  }
}
class MOSSoundSystem {
  constructor(chip) {
    __publicField(this, "channels");
    __publicField(this, "envelopeBuffer", new Uint8Array(64));
    // 4 envelopes × 16 bytes
    __publicField(this, "chip");
    this.chip = chip;
    this.channels = [
      new MOSSoundChannel(),
      new MOSSoundChannel(),
      new MOSSoundChannel(),
      new MOSSoundChannel()
    ];
  }
  osword7(channel, amplitude, pitch, duration) {
    const chIndex = channel & CHANNEL_MASK;
    const flush = (channel & MOS_CHANNEL_FLUSH_FLAG) !== 0;
    const ch = this.channels[chIndex];
    if (flush) {
      ch.flushBuffer();
      ch.bufCount = 0;
      ch.duration = 0;
    }
    let byte0 = 0;
    if (amplitude > 0) {
      byte0 = (amplitude - 1 & VOLUME_MASK) << 3;
    } else {
      byte0 = LATCH_FLAG | (-amplitude & VOLUME_MASK) << 3;
    }
    ch.pushByte(byte0);
    ch.pushByte(pitch & 255);
    ch.pushByte(duration & 255);
    ch.bufCount++;
    ch.occupancy = MOS_OCCUPIED_FLAG;
    if (ch.duration === 0 && ch.phaseCounter >= RELEASE_COMPLETE) {
    }
  }
  osword8(envNumber, data) {
    const base = (envNumber - 1) * 16;
    for (let i = 1; i <= 13; i++) {
      this.envelopeBuffer[base + i] = data[i] & 255;
    }
    this.envelopeBuffer[base + 14] = 0;
    this.envelopeBuffer[base + 15] = 0;
  }
  silenceAll() {
    for (let ch = 0; ch < 4; ch++) {
      this.channels[ch].reset();
      this.chip.write(LATCH_FLAG | mosToChipChannel[ch] << 5 | 16 | MOS_VOLUME_OFF);
    }
  }
  tick() {
    for (let chIdx = 3; chIdx >= 0; chIdx--) {
      const ch = this.channels[chIdx];
      if (!(ch.occupancy & MOS_OCCUPIED_FLAG)) continue;
      if (ch.duration === 0) {
        this.checkForNextSound(chIdx);
      } else if (ch.duration !== MOS_NO_ENVELOPE) {
        ch.countdown20Hz--;
        if (ch.countdown20Hz === 0) {
          ch.countdown20Hz = MOS_COUNTDOWN_INITIAL;
          ch.duration--;
          if (ch.duration === 0) {
            this.checkForNextSound(chIdx);
          }
        }
      }
      if (!(ch.occupancy & MOS_OCCUPIED_FLAG)) continue;
      if (ch.stepCountdownProgress !== 0) {
        ch.stepCountdownProgress--;
        if (ch.stepCountdownProgress !== 0) continue;
      }
      if (ch.envelopeOffset === MOS_NO_ENVELOPE) continue;
      const envBase = ch.envelopeOffset;
      ch.stepCountdownProgress = this.envelopeBuffer[envBase + 1] & MOS_STEP_LENGTH_MASK;
      if (ch.phaseCounter < RELEASE_COMPLETE) {
        let targetRaw;
        if (ch.phaseCounter < 2) {
          targetRaw = this.envelopeBuffer[envBase + 12 + ch.phaseCounter];
        } else {
          targetRaw = 0;
        }
        const targetAmplitude = targetRaw - MOS_VOLUME_LOUDEST & 255;
        const currentStep = this.envelopeBuffer[envBase + 8 + ch.phaseCounter];
        const oldVolume = ch.volume;
        let newVolume = ch.volume + currentStep & 255;
        const overflow = ((oldVolume ^ newVolume) & (currentStep ^ newVolume) & 128) !== 0;
        if (overflow) {
          if (newVolume & LATCH_FLAG) {
            newVolume = MOS_VOLUME_LOUDEST;
          } else {
            newVolume = MOS_VOLUME_CLAMP_SILENT;
          }
        }
        const bit6 = newVolume >> 6 & 1;
        const bit7 = newVolume >> 7 & 1;
        if (bit6 !== bit7) {
          if (newVolume & LATCH_FLAG) {
            newVolume = MOS_VOLUME_CLAMP_SILENT;
          } else {
            newVolume = MOS_VOLUME_LOUDEST;
          }
        }
        ch.volume = newVolume;
        const distance = ch.volume - targetAmplitude & 255;
        const stepMinus1 = currentStep - 1 & 255;
        if (!((distance ^ stepMinus1) & 128)) {
          ch.volume = targetAmplitude;
          ch.phaseCounter++;
        }
        if ((oldVolume ^ ch.volume) & MOS_VOLUME_CHANGE_MASK) {
          const chipVol = (ch.volume - MOS_VOLUME_OFFSET & 255) >> 3 ^ MOS_CHIP_VOLUME_XOR;
          this.chip.write(LATCH_FLAG | mosToChipChannel[chIdx] << 5 | 16 | chipVol & VOLUME_MASK);
        }
      }
      if (ch.section === PITCH_SECTION_COMPLETE) continue;
      if (ch.sectionCountdownProgress !== 0) {
        ch.sectionCountdownProgress--;
        const pitchChange2 = this.signedByte(this.envelopeBuffer[envBase + 2 + ch.section]);
        ch.pitchOffset = ch.pitchOffset + pitchChange2 & 255;
        const actualPitch2 = ch.basePitch + ch.pitchOffset & 255;
        this.setPitch(chIdx, actualPitch2);
        continue;
      }
      ch.section = ch.section + 1 & 255;
      if (ch.section === PITCH_SECTION_COMPLETE) {
        if (!(this.envelopeBuffer[envBase + 1] & MOS_AUTO_REPEAT_FLAG)) {
          ch.section = 0;
          ch.pitchOffset = 0;
        } else {
          continue;
        }
      }
      ch.sectionCountdownProgress = this.envelopeBuffer[envBase + 5 + ch.section];
      if (ch.sectionCountdownProgress === 0) continue;
      ch.sectionCountdownProgress--;
      const pitchChange = this.signedByte(this.envelopeBuffer[envBase + 2 + ch.section]);
      ch.pitchOffset = ch.pitchOffset + pitchChange & 255;
      const actualPitch = ch.basePitch + ch.pitchOffset & 255;
      this.setPitch(chIdx, actualPitch);
    }
  }
  signedByte(b) {
    return b > 127 ? b - 256 : b;
  }
  checkForNextSound(chIdx) {
    const ch = this.channels[chIdx];
    if (ch.phaseCounter < RELEASE_COMPLETE) {
      if (ch.phaseCounter !== RELEASE_COMPLETE) {
        ch.phaseCounter = PITCH_SECTION_COMPLETE;
      }
    }
    if (!ch.hasSound()) {
      if (ch.phaseCounter >= RELEASE_COMPLETE || ch.envelopeOffset === MOS_NO_ENVELOPE) {
        ch.occupancy = 0;
        this.chip.write(LATCH_FLAG | mosToChipChannel[chIdx] << 5 | 16 | MOS_VOLUME_OFF);
      }
      return;
    }
    ch.bufCount--;
    this.readNewSound(chIdx);
  }
  readNewSound(chIdx) {
    const ch = this.channels[chIdx];
    const byte0 = ch.popByte();
    const holdBit = byte0 & MOS_HOLD_FLAG;
    if (holdBit) {
      if (ch.envelopeOffset === MOS_NO_ENVELOPE) {
        this.chip.write(LATCH_FLAG | mosToChipChannel[chIdx] << 5 | 16 | MOS_VOLUME_OFF);
      }
      ch.popByte();
      ch.duration = ch.popByte();
      return;
    }
    const isDirectVolume = (byte0 & LATCH_FLAG) !== 0;
    const envVolBits = byte0 >> 3 & VOLUME_MASK;
    if (isDirectVolume) {
      ch.volume = MOS_VOLUME_SILENT + envVolBits * 8 & 255;
      ch.envelopeOffset = MOS_NO_ENVELOPE;
      const chipVol = (ch.volume - MOS_VOLUME_OFFSET & 255) >> 3 ^ MOS_CHIP_VOLUME_XOR;
      this.chip.write(LATCH_FLAG | mosToChipChannel[chIdx] << 5 | 16 | chipVol & VOLUME_MASK);
    } else {
      ch.envelopeOffset = envVolBits * 16;
      ch.volume = MOS_VOLUME_SILENT;
      const chipVol = (ch.volume - MOS_VOLUME_OFFSET & 255) >> 3 ^ MOS_CHIP_VOLUME_XOR;
      this.chip.write(LATCH_FLAG | mosToChipChannel[chIdx] << 5 | 16 | chipVol & VOLUME_MASK);
    }
    ch.countdown20Hz = MOS_COUNTDOWN_INITIAL;
    ch.stepCountdownProgress = 1;
    ch.sectionCountdownProgress = 0;
    ch.phaseCounter = 0;
    ch.pitchOffset = 0;
    ch.section = MOS_NO_ENVELOPE;
    ch.basePitch = ch.popByte();
    ch.pitch = ch.basePitch;
    ch.duration = ch.popByte();
    this.setPitch(chIdx, ch.basePitch);
  }
  setPitch(chIdx, pitchByte) {
    const chipCh = mosToChipChannel[chIdx];
    if (chIdx === 0) {
      this.chip.write(LATCH_FLAG | chipCh << 5 | pitchByte & NOISE_CONTROL_MASK);
    } else {
      const period = this.pitchToPeriod(pitchByte, chIdx);
      this.chip.write(LATCH_FLAG | chipCh << 5 | period & PERIOD_LOW_MASK);
      this.chip.write(period >> 4 & PERIOD_HIGH_MASK);
    }
  }
  pitchToPeriod(pitch, mosChannel) {
    const fractional = pitch & 3;
    let semitoneIndex = pitch >> 2;
    let octave = 0;
    while (semitoneIndex >= 12) {
      octave++;
      semitoneIndex -= 12;
    }
    let periodLow = pitchLookupTableLow[semitoneIndex];
    let periodHigh = pitchLookupTableHigh[semitoneIndex] & MOS_PERIOD_HIGH_MASK;
    const fractionalStep = pitchLookupTableHigh[semitoneIndex] >> 4;
    for (let i = 0; i < fractional; i++) {
      periodLow -= fractionalStep;
      if (periodLow < 0) {
        periodLow += 256;
        periodHigh--;
        if (periodHigh < 0) periodHigh += 4;
      }
    }
    let period = (periodHigh & MOS_PERIOD_HIGH_MASK) << 8 | periodLow & 255;
    period >>= octave;
    period += channelPitchOffset[mosChannel];
    return period & PERIOD_10BIT_MASK;
  }
}
class SN76489Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    __publicField(this, "chip", new SN76489());
    __publicField(this, "mos", new MOSSoundSystem(this.chip));
    __publicField(this, "tickCounter", 0);
    __publicField(this, "samplesPerTick", 0);
    this.samplesPerTick = sampleRate / 100;
    this.tickCounter = 0;
    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case "osword7":
          this.mos.osword7(msg.channel, msg.amplitude, msg.pitch, msg.duration);
          break;
        case "osword8":
          this.mos.osword8(msg.envNumber, msg.data);
          break;
        case "silenceAll":
          this.mos.silenceAll();
          break;
      }
    };
  }
  process(_inputs, outputs, _params) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const buf = output[0];
    const len = buf.length;
    let pos = 0;
    while (pos < len) {
      const untilTick = Math.ceil(this.samplesPerTick - this.tickCounter);
      const chunk = Math.min(untilTick, len - pos);
      this.chip.generate(buf, pos, chunk, sampleRate);
      this.tickCounter += chunk;
      pos += chunk;
      if (this.tickCounter >= this.samplesPerTick) {
        this.tickCounter -= this.samplesPerTick;
        this.mos.tick();
      }
    }
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(buf);
    }
    return true;
  }
}
registerProcessor("sn76489-processor", SN76489Processor);
