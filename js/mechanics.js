(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const RAD = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const svg = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
  const xy = (p) => p.map((n) => n.toFixed(3)).join(' ');
  const freeze = (value) => {
    if (value && typeof value === 'object') Object.values(value).forEach(freeze);
    return value && typeof value === 'object' ? Object.freeze(value) : value;
  };

  // Involute flanks use the same module and 20-degree pressure angle within
  // each train. A half-tooth phase at each contact pairs teeth with gaps.
  function toothOutline(teeth, module) {
    const pitch = module * teeth / 2;
    const base = pitch * Math.cos(20 * RAD);
    const outer = pitch + module;
    const root = pitch - 1.25 * module;
    const involute = (radius) => {
      const t = Math.sqrt(Math.max(0, radius * radius / (base * base) - 1));
      return t - Math.atan(t);
    };
    const half = (radius) => Math.PI / (2 * teeth) + involute(pitch) - involute(radius);
    const points = [];
    for (let tooth = 0; tooth < teeth; tooth++) {
      const center = tooth * Math.PI * 2 / teeth;
      points.push(point(root, center - Math.PI / teeth));
      points.push(point(root, center - half(Math.max(base, root))));
      for (let step = 0; step <= 5; step++) {
        const radius = Math.max(base, root) + (outer - Math.max(base, root)) * step / 5;
        points.push(point(radius, center - half(radius)));
      }
      for (let step = 5; step >= 0; step--) {
        const radius = Math.max(base, root) + (outer - Math.max(base, root)) * step / 5;
        points.push(point(radius, center + half(radius)));
      }
      points.push(point(root, center + half(Math.max(base, root))));
      points.push(point(root, center + Math.PI / teeth));
    }
    return `M${points.map(xy).join('L')}Z`;
  }

  function spokeCutouts(radius) {
    const inner = radius * .31;
    const outer = radius * .72;
    let path = '';
    for (let i = 0; i < 6; i++) {
      const start = (i * 60 + 11) * RAD;
      const end = (i * 60 + 49) * RAD;
      path += `M${xy(point(inner, start))}L${xy(point(outer, start))}A${outer} ${outer} 0 0 1 ${xy(point(outer, end))}L${xy(point(inner, end))}A${inner} ${inner} 0 0 0 ${xy(point(inner, start))}Z`;
    }
    return path;
  }

  class MechanicalScene {
    constructor(options = {}) {
      this.background = document.getElementById('background-mechanics');
      this.machineMount = document.getElementById('machine-gears');
      this.sparkMount = document.getElementById('mechanical-sparks');
      this.scene = document.getElementById('scene');
      this.machine = document.getElementById('machine');
      this.motion = document.getElementById('machine-motion');
      this.reducedMotion = typeof options === 'boolean' ? options : Boolean(options.reducedMotion);
      this.hidden = document.hidden;
      this.engaged = false;
      this.phase = 0;
      this.time = 0;
      this.load = 0;
      this.driveSpeed = 10;
      this.ramp = null;
      this.kick = 0;
      this.vibration = { x: 0, y: 0 };
      this.gears = [];
      this.clusters = [];
      this.particles = [];
      this.destroyed = false;
      this.tickerAttached = false;
      this.burstSequence = 0;
      if (!this.scene || !this.background || !this.machineMount || !this.sparkMount) return;
      this.width = this.scene.clientWidth || 1920;
      this.height = this.scene.clientHeight || 1080;
      this.build();
      this.resize();
      this.onResize = () => this.resize();
      this.onVisibility = () => {
        this.hidden = document.hidden;
        if (this.hidden) { this.clearSparks(); this.resetVibration(); }
        this.updateTicker();
      };
      this.tick = (_time, delta) => this.update(Math.min((delta || 16.667) / 1000, .05));
      window.addEventListener('scene:resize', this.onResize);
      window.addEventListener('resize', this.onResize);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.updateTicker();
    }

    build() {
      // The reference shaft is a 24-tooth wheel. Every driven wheel is a
      // fixed signed ratio of that one shaft; no independent rotation tweens.
      this.addPair('far-left', this.background, 8, [40, 28], -35, true);
      this.addPair('far-right', this.background, 7.5, [40, 28], 218, true);
      this.addPair('near-left', this.background, 7, [42, 24], 38, false);
      this.addPair('machine', this.machineMount, 4.75, [24, 32], 90, true);
      this.sparkSvg = svg('svg', { class: 'mechanics-spark-layer', 'aria-hidden': 'true' });
      for (let i = 0; i < 18; i++) {
        const line = svg('line', { class: 'mechanics-spark', x1: 0, y1: 0, x2: 0, y2: 0 });
        this.sparkSvg.append(line);
        this.particles.push({ line, life: 0 });
      }
      this.sparkMount.replaceChildren(this.sparkSvg);
    }

    addPair(id, mount, module, toothCounts, directionAngle, idle) {
      const cluster = { id, module, directionAngle, idle, clutchOffset: 0, gears: [], x: 0, y: 0 };
      const layer = document.createElement('div');
      layer.className = `mechanics-cluster mechanics-cluster--${id}`;
      layer.dataset.mechanicsCluster = id;
      const supports = svg('svg', { class: 'mechanics-supports', 'aria-hidden': 'true' });
      layer.append(supports);
      mount.append(layer);
      cluster.layer = layer;
      cluster.supports = supports;
      const theta = directionAngle * RAD;
      const distance = module * (toothCounts[0] + toothCounts[1]) / 2;
      toothCounts.forEach((teeth, index) => {
        const radius = module * teeth / 2;
        const gear = {
          id: `${id}-${index + 1}`, cluster: id, teeth, module, pitchRadius: radius,
          direction: index ? -1 : 1, ratio: (index ? -24 : 24) / teeth,
          // Gear A presents a tooth on the line of centers. Gear B presents
          // a gap; involute profiles roll together at their pitch circles.
          phaseOffset: directionAngle + (index ? 180 - 180 / teeth : 0),
          x: index ? Math.cos(theta) * distance : 0,
          y: index ? Math.sin(theta) * distance : 0,
          angle: 0, speed: 0, phase: 0, clusterState: cluster
        };
        this.makeWheel(gear, layer);
        this.gears.push(gear);
        cluster.gears.push(gear);
      });
      this.clusters.push(cluster);
      this.renderGears();
    }

    makeWheel(gear, layer) {
      const radius = gear.pitchRadius;
      const bound = radius + gear.module + 7;
      // Three exposed gold wheels provide the event accent. Steel shafts and
      // mating wheels keep the train looking like working machinery.
      const gold = ['far-right-2', 'near-left-2', 'machine-1'].includes(gear.id);
      const wheel = document.createElement('div');
      wheel.className = `mechanical-wheel${gold ? ' mechanical-wheel--gold' : ''}`;
      wheel.dataset.gear = gear.id;
      wheel.style.width = wheel.style.height = `${bound * 2}px`;
      const rotor = svg('svg', { class: 'mechanical-rotor', viewBox: `${-bound} ${-bound} ${bound * 2} ${bound * 2}`, 'aria-hidden': 'true' });
      const defs = svg('defs');
      const gradient = svg('linearGradient', { id: `metal-${gear.id}`, x1: 0, y1: 0, x2: .75, y2: 1 });
      const stops = gold
        ? [['0', '#fff5bd'], ['.12', '#ffe46f'], ['.31', '#d9a716'], ['.46', '#806108'], ['.61', '#f3c52f'], ['.77', '#ffdc57'], ['1', '#5e4b0a']]
        : [['0', '#9b9f8f'], ['.24', '#535d55'], ['.55', '#333d37'], ['.79', '#687166'], ['1', '#252e29']];
      stops.forEach(([offset, color]) => gradient.append(svg('stop', { offset, 'stop-color': color })));
      defs.append(gradient);
      rotor.append(defs);
      const outline = toothOutline(gear.teeth, gear.module);
      const cutouts = spokeCutouts(radius);
      rotor.append(svg('path', { d: outline + cutouts, 'fill-rule': 'evenodd', fill: `url(#metal-${gear.id})`, stroke: gold ? '#483909' : '#121d1a', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
      rotor.append(svg('path', { d: outline, fill: 'none', stroke: gold ? '#fff2ac' : '#b2ac88', 'stroke-width': .8, opacity: gold ? .86 : .42 }));
      rotor.append(svg('circle', { r: radius * .81, fill: 'none', stroke: gold ? '#ffe979' : '#b6b29a', 'stroke-width': 1.2, opacity: gold ? .78 : .48 }));
      rotor.append(svg('circle', { r: radius * .765, fill: 'none', stroke: gold ? '#6b530a' : '#17231e', 'stroke-width': 2.2 }));
      if (gold) rotor.append(svg('circle', { r: radius * .72, fill: 'none', stroke: '#fff0a6', 'stroke-width': .65, opacity: .44 }));
      rotor.append(svg('circle', { r: radius * .245, fill: gold ? '#b78812' : '#344239', stroke: gold ? '#ffe477' : '#a9a88e', 'stroke-width': 1.1 }));
      for (let i = 0; i < 6; i++) {
        const p = point(radius * .865, i * Math.PI / 3);
        rotor.append(svg('circle', { cx: p[0], cy: p[1], r: Math.max(1.4, gear.module * .25), fill: gold ? '#46390e' : '#18251f', stroke: gold ? '#f3ce55' : '#7e8777', 'stroke-width': .55 }));
      }
      const axle = svg('svg', { class: 'mechanical-axle', viewBox: `${-bound} ${-bound} ${bound * 2} ${bound * 2}`, 'aria-hidden': 'true' });
      const hub = Math.max(10, radius * .16);
      axle.append(svg('circle', { cx: 2, cy: 3, r: hub + 3, fill: '#0b1512', opacity: .8 }));
      axle.append(svg('circle', { r: hub + 1, fill: '#1b2c24', stroke: '#969d89', 'stroke-width': 1.5 }));
      axle.append(svg('circle', { r: hub * .69, fill: '#526254', stroke: '#142219', 'stroke-width': 2 }));
      axle.append(svg('path', { d: `M${-hub * .42} ${hub * .35}L${hub * .42} ${-hub * .35}`, stroke: '#142018', 'stroke-width': 2.6 }));
      axle.append(svg('path', { d: `M${-hub * .47} ${-hub * .7}A${hub * .84} ${hub * .84} 0 0 1 ${hub * .45} ${-hub * .7}`, fill: 'none', stroke: '#c5c4a8', 'stroke-width': .8, opacity: .7 }));
      wheel.append(rotor, axle);
      layer.append(wheel);
      gear.wheel = wheel;
      gear.rotor = rotor;
      gear.bound = bound;
    }

    resize() {
      if (this.destroyed || !this.scene) return;
      this.width = this.scene.clientWidth || 1920;
      this.height = this.scene.clientHeight || 1080;
      const portrait = this.width < this.height;
      const origins = portrait
        ? { 'far-left': [-95, 477], 'far-right': [855, 814], 'near-left': [-97, 1270], machine: [58, 415] }
        : { 'far-left': [-54, 266], 'far-right': [1980, 415], 'near-left': [-66, 868], machine: [58, 415] };
      for (const cluster of this.clusters) {
        [cluster.x, cluster.y] = origins[cluster.id];
        const [a, b] = cluster.gears;
        const width = cluster.id === 'machine' ? 760 : this.width;
        const height = cluster.id === 'machine' ? 840 : this.height;
        cluster.supports.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const x1 = cluster.x + a.x, y1 = cluster.y + a.y;
        const x2 = cluster.x + b.x, y2 = cluster.y + b.y;
        cluster.supports.replaceChildren();
        cluster.supports.append(svg('path', { d: `M${x1} ${y1}L${x2} ${y2}`, fill: 'none', stroke: '#080f0d', 'stroke-width': cluster.id === 'machine' ? 26 : 46, 'stroke-linecap': 'round' }));
        cluster.supports.append(svg('path', { d: `M${x1 - 2} ${y1 - 3}L${x2 - 2} ${y2 - 3}`, fill: 'none', stroke: '#424b3f', 'stroke-width': cluster.id === 'machine' ? 19 : 34, 'stroke-linecap': 'round' }));
        cluster.supports.append(svg('path', { d: `M${x1 - 6} ${y1 - 3}L${x2 - 6} ${y2 - 3}`, fill: 'none', stroke: '#78806a', 'stroke-width': 1, opacity: .6 }));
        for (const gear of cluster.gears) {
          gear.wheel.style.left = `${cluster.x + gear.x - gear.bound}px`;
          gear.wheel.style.top = `${cluster.y + gear.y - gear.bound}px`;
        }
      }
      if (this.sparkSvg) this.sparkSvg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    }

    engage() {
      if (this.destroyed || this.engaged) return;
      this.engaged = true;
      this.background.classList.add('is-drive-loaded');
      this.machineMount.classList.add('is-drive-loaded');
      if (this.reducedMotion) { this.snapDrive(1); return; }
      this.ramp = { from: this.load, to: 1, elapsed: 0, duration: .25 };
      this.kick = .35;
      if (!this.reducedMotion && !this.hidden) this.burst('engage');
    }

    settle() {
      if (this.destroyed || !this.engaged) return;
      this.engaged = false;
      this.background.classList.remove('is-drive-loaded');
      this.machineMount.classList.remove('is-drive-loaded');
      if (this.reducedMotion) { this.snapDrive(0); return; }
      this.ramp = { from: this.load, to: 0, elapsed: 0, duration: .7 };
      this.kick = .14;
      if (!this.reducedMotion && !this.hidden) this.burst('brake');
    }

    setReducedMotion(value) {
      this.reducedMotion = Boolean(value);
      if (this.reducedMotion) this.snapDrive(this.engaged ? 1 : 0);
      this.updateTicker();
    }

    snapDrive(load) {
      this.load = load;
      this.driveSpeed = 10 + 50 * load;
      this.ramp = null;
      this.clearSparks();
      this.resetVibration();
      this.renderGears();
    }

    updateTicker() {
      if (!window.gsap || !this.tick) return;
      const shouldRun = !this.destroyed && !this.reducedMotion && !this.hidden;
      if (shouldRun && !this.tickerAttached) { gsap.ticker.add(this.tick); this.tickerAttached = true; }
      else if (!shouldRun && this.tickerAttached) { gsap.ticker.remove(this.tick); this.tickerAttached = false; }
    }

    update(dt) {
      if (this.destroyed || this.reducedMotion || this.hidden) return;
      this.time += dt;
      if (this.ramp) {
        const ramp = this.ramp;
        ramp.elapsed += dt;
        const p = clamp(ramp.elapsed / ramp.duration);
        this.load = ramp.from + (ramp.to - ramp.from) * p * p * (3 - 2 * p);
        if (p === 1) this.ramp = null;
      }
      this.driveSpeed = 10 + 50 * this.load;
      const delta = this.driveSpeed * dt;
      this.phase += delta;
      // The lower train has an idle clutch. Its phase is still derived from
      // the shared shaft; only disengaged shaft travel is subtracted.
      for (const cluster of this.clusters) if (!cluster.idle) cluster.clutchOffset += 10 * (1 - this.load) * dt;
      this.renderGears();
      this.kick = Math.max(0, this.kick - dt);
      const amplitude = this.kick ? 1.05 * Math.pow(this.kick / .35, 1.4) : .075 * this.load;
      const x = Math.sin(this.time * 99) * amplitude;
      const y = Math.sin(this.time * 117 + .7) * amplitude * .54;
      this.vibration = { x, y };
      if (this.motion) this.motion.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0)`;
      // Supports and their gear centers move as one rigid assembly. Only the
      // engagement/brake impulse reaches these mounts, with distance damping.
      const impulse = this.kick ? Math.pow(this.kick / .35, 1.4) : 0;
      for (const cluster of this.clusters) {
        if (cluster.id === 'machine') continue;
        const depth = cluster.id === 'near-left' ? .74 : cluster.id === 'far-left' ? .26 : .18;
        const clusterX = Math.sin(this.time * 99) * impulse * depth;
        const clusterY = Math.sin(this.time * 117 + .7) * impulse * depth * .54;
        cluster.layer.style.transform = `translate3d(${clusterX.toFixed(3)}px,${clusterY.toFixed(3)}px,0)`;
      }
      this.renderSparks(dt);
    }

    renderGears() {
      for (const gear of this.gears) {
        const cluster = gear.clusterState;
        gear.phase = this.phase - cluster.clutchOffset;
        gear.angle = gear.phaseOffset + gear.phase * gear.ratio;
        gear.speed = (this.reducedMotion || this.hidden ? 0 : cluster.idle ? this.driveSpeed : 60 * this.load) * gear.ratio;
        gear.rotor.style.transform = `rotate(${(gear.angle % 360).toFixed(5)}deg)`;
      }
    }

    contactPoint(clusterId) {
      const cluster = this.clusters.find((item) => item.id === clusterId);
      const [a, b] = cluster.gears;
      const t = a.pitchRadius / (a.pitchRadius + b.pitchRadius);
      const local = { x: cluster.x + a.x + (b.x - a.x) * t, y: cluster.y + a.y + (b.y - a.y) * t };
      if (clusterId !== 'machine') return local;
      const sceneRect = this.scene.getBoundingClientRect();
      const machineRect = this.machine.getBoundingClientRect();
      const sceneScale = sceneRect.width / this.width;
      const machineScale = machineRect.width / this.machine.clientWidth / sceneScale;
      return { x: (machineRect.left - sceneRect.left) / sceneScale + local.x * machineScale, y: (machineRect.top - sceneRect.top) / sceneScale + local.y * machineScale };
    }

    burst(kind) {
      const origin = this.contactPoint('machine');
      // A single tooth-contact point: tiny, short-lived metal streaks. The
      // bounded pool is reused for every draw and never emits during cruise.
      const count = kind === 'engage' ? 7 : 5;
      const available = this.particles.filter((particle) => particle.life <= 0).slice(0, count);
      this.burstSequence++;
      available.forEach((particle, index) => {
        const seed = ((index * 37 + this.burstSequence * 17) % 97) / 97;
        const angle = Math.PI + (-.7 + seed * 1.5);
        const speed = 65 + index * 13 + seed * 26;
        particle.x = origin.x - 2;
        particle.y = origin.y;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed - 16;
        particle.delay = index * (kind === 'engage' ? .025 : .018);
        particle.total = .16 + seed * .12;
        particle.life = particle.total;
        particle.line.setAttribute('stroke', index % 3 ? '#d8a35c' : '#f0d9a3');
        particle.line.setAttribute('stroke-width', index % 3 ? '.85' : '1.15');
      });
    }

    renderSparks(dt) {
      for (const particle of this.particles) {
        if (particle.life <= 0) continue;
        if (particle.delay > 0) { particle.delay -= dt; continue; }
        particle.life -= dt;
        if (particle.life <= 0) { particle.line.style.opacity = '0'; continue; }
        particle.vy += 165 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        const speed = Math.hypot(particle.vx, particle.vy);
        const length = Math.min(6.5, 2.3 + speed * .018);
        particle.line.setAttribute('x1', particle.x.toFixed(2));
        particle.line.setAttribute('y1', particle.y.toFixed(2));
        particle.line.setAttribute('x2', (particle.x - particle.vx / speed * length).toFixed(2));
        particle.line.setAttribute('y2', (particle.y - particle.vy / speed * length).toFixed(2));
        particle.line.style.opacity = String(Math.min(.85, particle.life / particle.total));
      }
    }

    clearSparks() { for (const p of this.particles) { p.life = 0; p.line.style.opacity = '0'; } }
    resetVibration() {
      this.kick = 0;
      this.vibration = { x: 0, y: 0 };
      if (this.motion) this.motion.style.transform = 'translate3d(0,0,0)';
      for (const cluster of this.clusters) cluster.layer.style.transform = 'translate3d(0,0,0)';
    }

    snapshot() {
      return freeze({
        reducedMotion: this.reducedMotion, hidden: this.hidden, engaged: this.engaged,
        phase: this.phase, driveSpeed: this.reducedMotion || this.hidden ? 0 : this.driveSpeed,
        load: this.load, activeSparks: this.particles.filter((p) => p.life > 0).length,
        maxSparks: this.particles.length, tickerAttached: this.tickerAttached, vibration: { ...this.vibration },
        gears: this.gears.map((g) => ({
          id: g.id, cluster: g.cluster, teeth: g.teeth, pitchRadius: g.pitchRadius,
          direction: g.direction, angle: g.angle, speed: this.reducedMotion || this.hidden ? 0 : g.speed,
          phase: g.phase, phaseOffset: g.phaseOffset
        })),
        meshes: this.clusters.map((cluster) => {
          const [a, b] = cluster.gears;
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          const theta = cluster.directionAngle;
          const meshPhase = (theta - a.angle) * a.teeth + (theta + 180 - b.angle) * b.teeth;
          const phaseError = (((meshPhase - 180) % 360) + 540) % 360 - 180;
          return { cluster: cluster.id, a: a.id, b: b.id, distance, pitchSum: a.pitchRadius + b.pitchRadius, gapError: distance - a.pitchRadius - b.pitchRadius, phaseError };
        })
      });
    }

    destroy() {
      this.destroyed = true;
      this.background?.classList.remove('is-drive-loaded');
      this.machineMount?.classList.remove('is-drive-loaded');
      this.updateTicker();
      window.removeEventListener('scene:resize', this.onResize);
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.clearSparks();
      this.resetVibration();
      for (const cluster of this.clusters) cluster.layer.remove();
      if (this.sparkSvg) this.sparkSvg.remove();
    }
  }
  window.MechanicalScene = MechanicalScene;
})();
