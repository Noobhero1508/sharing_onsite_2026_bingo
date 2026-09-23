/* Âm thanh cơ khí tại chỗ — mô phỏng đúng bộ mẫu cũ, không tải tệp hoặc gọi mạng. */
(function () {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.compressor = null;
      this.master = null;
      this.isMuted = false;
      this.available = Boolean(window.AudioContext || window.webkitAudioContext);
      this.voices = new Set();
      this.motor = null;
      this.motorWanted = false;
      this.motorStopTimer = null;
    }

    init() {
      if (!this.available || document.hidden) return false;
      try {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AudioContext();
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.value = -11;
          this.compressor.knee.value = 6;
          this.compressor.ratio.value = 5;
          this.compressor.attack.value = 0.003;
          this.compressor.release.value = 0.16;
          this.master = this.ctx.createGain();
          this.master.gain.value = this.isMuted ? 0 : 0.76;
          this.compressor.connect(this.master);
          this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx.state !== 'closed';
      } catch (_) {
        this.available = false;
        return false;
      }
    }

    tone(frequency, endFrequency, duration, volume, type = 'triangle', delay = 0) {
      if (this.isMuted || !this.init()) return;
      const t = this.ctx.currentTime + delay;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, t);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume, t + Math.min(0.009, duration / 5));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      oscillator.connect(gain);
      gain.connect(this.compressor);
      const voice = { source: oscillator, nodes: [oscillator, gain] };
      this.voices.add(voice);
      oscillator.onended = () => this.releaseVoice(voice);
      oscillator.start(t);
      oscillator.stop(t + duration + 0.015);
    }

    releaseVoice(voice) {
      this.voices.delete(voice);
      voice.nodes.forEach((node) => { try { node.disconnect(); } catch (_) {} });
    }

    playLever() {
      // Same two-part pull from the supplied sample: a low metal thud and spring return.
      this.tone(140, 35, 0.15, 0.38, 'triangle');
      this.tone(420, 160, 0.08, 0.19, 'square', 0.12);
    }

    playTick(pitchMod = 1) {
      // Ratchet tooth: short sawtooth through a narrow bandpass, as in the sample.
      const pitch = Math.max(0.9, Math.min(1.2, pitchMod));
      if (this.isMuted || !this.init()) return;
      const t = this.ctx.currentTime;
      const oscillator = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(700 * pitch, t);
      oscillator.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.025);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 * pitch, t);
      filter.Q.setValueAtTime(3, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);
      const voice = { source: oscillator, nodes: [oscillator, filter, gain] };
      this.voices.add(voice);
      oscillator.onended = () => this.releaseVoice(voice);
      oscillator.start(t);
      oscillator.stop(t + 0.035);
    }

    startMotor() {
      this.motorWanted = true;
      if (this.motor || this.isMuted || !this.init()) return;
      const t = this.ctx.currentTime;
      const oscillator = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(65, t);
      oscillator.frequency.linearRampToValueAtTime(110, t + 0.8);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.095, t + 0.4);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);
      const motor = { oscillator, filter, gain };
      this.motor = motor;
      oscillator.onended = () => {
        [oscillator, filter, gain].forEach((node) => { try { node.disconnect(); } catch (_) {} });
        if (this.motor === motor) this.motor = null;
      };
      oscillator.start(t);
    }

    setMotorSpeed(progress = 0) {
      if (!this.motor || !this.ctx) return;
      const speed = Math.max(0, Math.min(1, progress));
      const t = this.ctx.currentTime;
      this.motor.oscillator.frequency.setTargetAtTime(65 + speed * 45, t, 0.055);
      this.motor.filter.frequency.setTargetAtTime(280 + speed * 260, t, 0.07);
    }

    stopMotor(immediate = false) {
      this.motorWanted = false;
      if (this.motorStopTimer) { clearTimeout(this.motorStopTimer); this.motorStopTimer = null; }
      const motor = this.motor;
      if (!motor || !this.ctx) return;
      this.motor = null;
      const t = this.ctx.currentTime;
      const tail = immediate ? 0.008 : 0.3;
      motor.gain.gain.cancelScheduledValues(t);
      motor.gain.gain.setValueAtTime(motor.gain.gain.value, t);
      motor.gain.gain.linearRampToValueAtTime(0.0001, t + tail);
      try { motor.oscillator.stop(t + tail + 0.015); } catch (_) {}
      if (!immediate) this.motorStopTimer = setTimeout(() => { this.motorStopTimer = null; }, (tail + 0.05) * 1000);
    }

    playWin() {
      // The sample's short musical confirmation plus its mechanical locking thump.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((note, index) => this.tone(note, note, 0.42, 0.18, 'sine', index * 0.09));
      this.tone(120, 30, 0.22, 0.28, 'triangle');
    }

    playWhoosh() {
      // Keep the supplied sample's short card movement cue.
      this.tone(220, 550, 0.15, 0.055, 'triangle');
      this.tone(550, 140, 0.2, 0.035, 'triangle', 0.15);
    }

    playModal(open = true) {
      this.tone(open ? 320 : 580, open ? 640 : 260, 0.18, 0.11, 'sine');
    }

    playZoom(open = true) {
      this.tone(open ? 260 : 620, open ? 780 : 200, 0.22, 0.15, 'triangle');
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      const resumeMotor = this.motorWanted || Boolean(this.motor);
      if (this.master && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(this.isMuted ? 0 : 0.76, t, 0.008);
      }
      if (this.isMuted) {
        this.stopMotor(true);
        this.motorWanted = resumeMotor;
      } else {
        this.init();
        if (this.motorWanted) this.startMotor();
      }
      return this.isMuted;
    }

    stopAll() {
      this.stopMotor(true);
      for (const voice of [...this.voices]) {
        try { voice.source.stop(); } catch (_) {}
      }
      this.voices.clear();
    }
  }

  window.SoundEngine = SoundEngine;
  window.sfx = new SoundEngine();
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.sfx.stopAll(); });
  window.addEventListener('pagehide', () => window.sfx.stopAll());
})();
