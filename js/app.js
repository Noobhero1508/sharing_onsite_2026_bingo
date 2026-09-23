(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (value) => String(value).padStart(2, '0');
  const clamp = (value) => Math.max(0, Math.min(1, value));

  function randomIndex(length) {
    if (window.crypto && window.crypto.getRandomValues) {
      const limit = Math.floor(0x100000000 / length) * length;
      const values = new Uint32Array(1);
      do { window.crypto.getRandomValues(values); } while (values[0] >= limit);
      return values[0] % length;
    }
    return Math.floor(Math.random() * length);
  }

  class BingoApp {
    constructor() {
      this.allItems = (window.BINGO_ITEMS || []).map((item) => Object.freeze({ ...item }));
      this.remainingItems = [...this.allItems];
      this.drawnItems = [];
      this.currentWinner = null;
      this.state = 'loading';
      this.missingImages = new Set();
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.reelPosition = { value: 0 };
      this.leverPosition = { value: 0 };
      this.spinTimeline = null;
      this.zoomTimeline = null;
      this.zoomClosing = false;
      this.zoomRestoreFocus = null;
      this.leverTween = null;
      this.lastTick = 0;
      this.cancelledDrag = false;
      this.ignoreLeverClickUntil = 0;
      this.dragScale = 1;
      this.scene = $('scene');
      this.reelWindow = $('reel-window');
      this.strip = $('reel-strip');
      this.idleTemplate = $('idle-card') ? $('idle-card').cloneNode(true) : null;
      this.historyDialog = $('history-dialog');
      this.zoomDialog = $('zoom-dialog');
      this.updateReelSize();
      if (!window.gsap || !window.Draggable || !window.Flip) {
        this.fail('Không thể tải bộ chuyển động. Hãy giữ nguyên thư mục vendor rồi mở lại trang.');
        return;
      }
      if (!this.allItems.length || new Set(this.allItems.map((item) => item.id)).size !== this.allItems.length) {
        this.fail('Danh sách thẻ đang trống hoặc có mã trùng. Hãy kiểm tra tệp js/items.js.');
        return;
      }
      gsap.registerPlugin(Draggable, Flip);
      this.mechanics = new MechanicalScene({ reducedMotion: this.reducedMotion });
      window.mechanics = this.mechanics;
      this.bindControls();
      this.setupLever();
      this.updateControls();
      this.resizeObserver = new ResizeObserver(() => {
        this.updateReelSize();
        this.renderReel();
      });
      this.resizeObserver.observe(this.reelWindow);
      this.motionQuery.addEventListener('change', (event) => {
        this.reducedMotion = event.matches;
        this.mechanics.setReducedMotion(event.matches);
        if (event.matches && this.state === 'spinning' && this.spinTimeline) this.spinTimeline.progress(1);
        if (event.matches && this.zoomTimeline) this.zoomTimeline.progress(1);
      });
      this.ready = this.preload().then(() => {
        this.state = 'idle';
        this.updateControls();
        this.announce('Sẵn sàng. Nhấn Space hoặc nút đỏ để bốc thẻ.');
      });
    }

    async preload() {
      await Promise.all(this.allItems.map((item) => new Promise((resolve) => {
        const image = new Image();
        const timeout = setTimeout(() => { this.missingImages.add(item.id); resolve(); }, 10000);
        image.onload = () => { clearTimeout(timeout); resolve(); };
        image.onerror = () => { clearTimeout(timeout); this.missingImages.add(item.id); resolve(); };
        image.src = item.image;
      })));
      if (this.missingImages.size) {
        $('load-error').hidden = false;
        $('load-error').textContent = `Thiếu ${this.missingImages.size} ảnh thẻ. Máy sẽ hiển thị tên và số thẻ để tiếp tục.`;
      }
    }

    fail(message) {
      this.state = 'error';
      if ($('load-error')) { $('load-error').hidden = false; $('load-error').textContent = message; }
      this.updateControls();
    }

    announce(message) { if ($('live-status')) $('live-status').textContent = message; }
    updateReelSize() {
      this.reelSize = parseFloat(getComputedStyle(this.reelWindow).getPropertyValue('--reel-size')) || this.reelWindow.clientHeight || 440;
    }
    renderReel() { if (window.gsap) gsap.set(this.strip, { y: -this.reelPosition.value * this.reelSize }); }

    makeImage(item, className = 'card-image') {
      const wrap = document.createElement('div');
      wrap.className = 'card-art';
      const fallback = document.createElement('div');
      fallback.className = 'card-fallback';
      const number = document.createElement('span');
      number.textContent = pad(item.id);
      const label = document.createElement('strong');
      label.textContent = item.name;
      fallback.append(number, label);
      fallback.hidden = !this.missingImages.has(item.id);
      wrap.append(fallback);
      if (!this.missingImages.has(item.id)) {
        const image = new Image();
        image.className = className;
        image.alt = item.name;
        image.draggable = false;
        image.addEventListener('error', () => {
          this.missingImages.add(item.id);
          image.remove();
          fallback.hidden = false;
        }, { once: true });
        image.src = item.image;
        wrap.prepend(image);
      }
      return wrap;
    }

    makeCard(item) {
      const card = document.createElement('div');
      card.className = 'reel-card';
      card.append(this.makeImage(item));
      return card;
    }

    bindControls() {
      $('btn-spin').addEventListener('click', () => this.spin());
      $('btn-open-history').addEventListener('click', () => this.openHistoryModal());
      $('btn-close-history').addEventListener('click', () => this.closeHistoryModal());
      $('history-dock').addEventListener('click', () => this.openHistoryModal());
      $('btn-zoom-card').addEventListener('click', () => this.openZoomModal(this.currentWinner, this.reelWindow));
      this.reelWindow.addEventListener('click', () => this.openZoomModal(this.currentWinner, this.reelWindow));
      $('btn-close-zoom').addEventListener('click', () => this.closeZoomModal());
      $('btn-sound').addEventListener('click', () => this.toggleSound());
      $('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
      document.addEventListener('fullscreenchange', () => this.updateFullscreen());
      for (const dialog of [this.historyDialog, this.zoomDialog]) {
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          if (dialog === this.zoomDialog) this.closeZoomModal();
          else this.closeHistoryModal();
        });
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          if (dialog === this.zoomDialog) { this.closeZoomModal(); return; }
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        });
      }
      window.addEventListener('keydown', (event) => this.handleKey(event));
      window.addEventListener('pointercancel', (event) => {
        this.cancelledDrag = true;
        this.ignoreLeverClickUntil = performance.now() + 500;
        if (this.draggable && this.draggable.isPressed) this.draggable.endDrag(event);
        if (this.state !== 'spinning') this.resetLever();
      }, true);
      window.addEventListener('blur', () => {
        this.cancelledDrag = true;
        this.ignoreLeverClickUntil = performance.now() + 500;
        if (this.draggable && this.draggable.isPressed) this.draggable.endDrag();
        if (this.state !== 'spinning') this.resetLever();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.cancelledDrag = true;
          this.ignoreLeverClickUntil = performance.now() + 500;
          if (this.draggable && this.draggable.isPressed) this.draggable.endDrag();
          if (this.state !== 'spinning') this.resetLever();
        }
      });
    }

    handleKey(event) {
      if (event.repeat) {
        if (['Space', 'Enter'].includes(event.code)) event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (this.zoomDialog.open) {
        if (['Space', 'Enter', 'Escape', 'KeyZ'].includes(event.code)) {
          event.preventDefault();
          this.closeZoomModal();
        }
        return;
      }
      if (this.historyDialog.open) {
        if (event.code === 'KeyH' || event.code === 'Escape') { event.preventDefault(); this.closeHistoryModal(); }
        if (event.code === 'KeyM') { event.preventDefault(); this.toggleSound(); }
        return;
      }
      if (event.code === 'Space' || event.code === 'Enter') {
        const control = event.target.closest('button, a, [role="button"]');
        if (control && control.id === 'reel-window') {
          event.preventDefault();
          this.openZoomModal(this.currentWinner);
          return;
        }
        if (control && !['btn-spin', 'lever-hit'].includes(control.id)) return;
        event.preventDefault();
        this.spin();
      } else if (event.code === 'KeyZ') {
        event.preventDefault(); this.openZoomModal(this.currentWinner);
      } else if (event.code === 'KeyH') {
        event.preventDefault(); this.openHistoryModal();
      } else if (event.code === 'KeyM') {
        event.preventDefault(); this.toggleSound();
      }
    }

    setupLever() {
      const app = this;
      this.proxy = document.createElement('div');
      gsap.set(this.proxy, { y: 0 });
      this.draggable = Draggable.create(this.proxy, {
        type: 'y', trigger: $('lever-hit'), bounds: { minY: 0, maxY: 190 },
        minimumMovement: 4, dragClickables: true, allowEventDefault: false,
        cursor: 'grab', activeCursor: 'grabbing',
        onPress() {
          if (app.state !== 'idle') return;
          app.cancelledDrag = false;
          if (app.leverTween) app.leverTween.kill();
          app.dragScale = app.scene.getBoundingClientRect().width / app.scene.offsetWidth || 1;
          gsap.set(app.proxy, { y: app.leverPosition.value * 190 * app.dragScale });
          this.applyBounds({ minY: 0, maxY: 190 * app.dragScale });
          this.update();
          window.sfx.init();
        },
        onDrag() {
          if (app.state !== 'idle') return;
          app.leverPosition.value = clamp(this.y / (190 * app.dragScale));
          app.renderLever();
        },
        onDragEnd() {
          app.ignoreLeverClickUntil = performance.now() + 450;
          if (!app.cancelledDrag && app.leverPosition.value >= 0.65 && app.state === 'idle') app.spin();
          else app.resetLever();
        }
      })[0];
      $('lever-hit').addEventListener('click', () => {
        if (performance.now() < this.ignoreLeverClickUntil || this.cancelledDrag) return;
        this.spin();
      });
      this.renderLever();
    }

    renderLever() {
      const p = clamp(this.leverPosition.value);
      // Project a rigid arm rotating towards the viewer; its screen length contracts.
      const angle = p * Math.acos(52 / 250);
      const x = 72 + Math.sin(angle) * 22.5;
      const y = 312 - 250 * Math.cos(angle);
      for (const id of ['lever-rod', 'lever-rod-highlight']) {
        const rod = $(id);
        const highlight = id === 'lever-rod-highlight';
        rod.setAttribute('x1', highlight ? '68' : '72');
        rod.setAttribute('y1', highlight ? '304' : '312');
        rod.setAttribute('x2', (x - (highlight ? 4 : 0)).toFixed(3));
        rod.setAttribute('y2', y.toFixed(3));
      }
      const steel = $('rod-steel');
      if (steel) {
        steel.setAttribute('x1', (Math.min(72, x) - 10).toFixed(3));
        steel.setAttribute('x2', (Math.max(72, x) + 10).toFixed(3));
      }
      $('lever-knob').setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${(1 + p * 0.1).toFixed(3)})`);
    }

    resetLever() {
      if (this.leverTween) this.leverTween.kill();
      this.leverTween = gsap.to(this.leverPosition, {
        value: 0, duration: this.reducedMotion ? 0.1 : 0.5, ease: 'back.out(1.25)',
        onUpdate: () => this.renderLever(),
        onComplete: () => { gsap.set(this.proxy, { y: 0 }); if (this.draggable) this.draggable.update(); this.leverTween = null; }
      });
    }

    spin() {
      if (this.state !== 'idle' || !this.remainingItems.length || this.historyDialog.open || this.zoomDialog.open) return false;
      this.state = 'spinning';
      const winner = this.remainingItems[randomIndex(this.remainingItems.length)];
      // Winner stays in this closure. Public history and counters commit only after the final stop.
      this.updateControls();
      this.announce('Đang bốc thẻ.');
      this.movePreviousToDock();
      if (this.leverTween) this.leverTween.kill();
      window.sfx.playLever();
      this.lastTick = 0;
      if (this.spinTimeline) this.spinTimeline.kill();
      if (this.reducedMotion) {
        this.spinTimeline = gsap.timeline({ onComplete: () => this.commitWinner(winner) });
        this.spinTimeline.to(this.strip, { opacity: 0, duration: 0.12 });
        return true;
      }

      this.buildReel(winner);
      this.startGears();
      const timeline = gsap.timeline({ onComplete: () => this.commitWinner(winner) });
      this.spinTimeline = timeline;
      timeline.to(this.leverPosition, { value: 1, duration: 0.16, ease: 'power2.in', onUpdate: () => this.renderLever() }, 0);
      timeline.call(() => { window.sfx.startMotor(); this.resetLever(); }, [], 0.18);
      const render = () => {
        this.renderReel();
        const now = performance.now();
        const card = Math.floor(this.reelPosition.value);
        if (card !== this.lastReelCard && now - this.lastTick > 37) {
          window.sfx.playTick(0.83 + this.reelPosition.value / 100);
          this.lastTick = now;
          this.lastReelCard = card;
        }
      };
      timeline.to(this.reelPosition, { value: 8, duration: 0.57, ease: 'power3.in', onUpdate: render }, 0.20);
      timeline.to(this.reelPosition, { value: 44, duration: 1.35, ease: 'none', onUpdate: render }, 0.77);
      timeline.to(this.reelPosition, {
        value: 59.018, duration: 1.06, ease: 'power3.out',
        onUpdate: () => { render(); window.sfx.setMotorSpeed(clamp((59.018 - this.reelPosition.value) / 15)); }
      }, 2.12);
      timeline.call(() => { window.sfx.stopMotor(); this.stopGears(); }, [], 3.18);
      timeline.to(this.reelPosition, { value: 59, duration: 0.16, ease: 'power2.out', onUpdate: () => this.renderReel() }, 3.18);
      return true;
    }

    buildReel(winner) {
      const fragment = document.createDocumentFragment();
      if (this.currentWinner) fragment.append(this.makeCard(this.currentWinner));
      else {
        const first = document.createElement('div');
        first.className = 'reel-card';
        if (this.idleTemplate) { const idle = this.idleTemplate.cloneNode(true); idle.removeAttribute('id'); first.append(idle); }
        fragment.append(first);
      }
      for (let i = 1; i < 59; i++) fragment.append(this.makeCard(this.allItems[randomIndex(this.allItems.length)]));
      fragment.append(this.makeCard(winner));
      this.strip.replaceChildren(fragment);
      this.strip.setAttribute('aria-hidden', 'true');
      this.reelPosition.value = 0;
      this.lastReelCard = 0;
      gsap.set(this.strip, { y: 0, opacity: 1 });
    }

    commitWinner(winner) {
      if (this.state !== 'spinning') return;
      this.remainingItems = this.remainingItems.filter((item) => item.id !== winner.id);
      this.drawnItems.push(winner);
      this.currentWinner = winner;
      this.state = this.remainingItems.length ? 'idle' : 'complete';
      this.stopGears();
      window.sfx.stopMotor();
      this.strip.replaceChildren(this.makeCard(winner));
      this.reelPosition.value = 0;
      gsap.set(this.strip, { y: 0, opacity: 1 });
      this.strip.removeAttribute('aria-hidden');
      $('current-name').textContent = winner.name;
      $('current-number').textContent = `THẺ ${pad(winner.id)}`;
      if (!this.reducedMotion) {
        gsap.killTweensOf($('result-meta'));
        gsap.fromTo($('result-meta'), { y: 7, opacity: 0.45 }, {
          y: 0, opacity: 1, duration: 0.38, ease: 'back.out(1.4)',
          onComplete: () => gsap.set($('result-meta'), { clearProps: 'transform,opacity' })
        });
      }
      this.reelWindow.setAttribute('aria-label', `Thẻ ${pad(winner.id)}: ${winner.name}. Phóng to kết quả.`);
      this.updateControls();
      this.renderHistoryGrid();
      this.announce(`Lượt ${this.drawnItems.length}: ${winner.name}. ${this.remainingItems.length ? `Còn ${this.remainingItems.length} thẻ.` : 'Đã bốc đủ tất cả các thẻ.'}`);
      window.sfx.playWin();
      if (this.reducedMotion) gsap.fromTo(this.strip, { opacity: 0 }, { opacity: 1, duration: 0.12 });
      this.resetLever();
      this.spinTimeline = null;
    }

    movePreviousToDock() {
      if (!this.currentWinner) return;
      const previous = this.currentWinner;
      const dock = $('dock-content');
      const empty = dock.querySelector('.dock-empty');
      if (empty) empty.remove();
      const card = document.createElement('div');
      card.className = 'dock-card';
      card.append(this.makeImage(previous, 'dock-image'));
      const label = document.createElement('span');
      label.className = 'dock-label';
      label.textContent = `${pad(previous.id)} / ${previous.name}`;
      const old = dock.querySelector('.dock-card');
      if (old) {
        if (this.reducedMotion) old.remove();
        else gsap.to(old, { x: -90, opacity: 0, duration: 0.26, onComplete: () => old.remove() });
      }
      const rect = this.reelWindow.getBoundingClientRect();
      Object.assign(card.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', zIndex: '20' });
      document.body.append(card);
      const state = Flip.getState(card);
      card.removeAttribute('style');
      card.append(label);
      dock.append(card);
      $('history-dock').classList.add('has-card');
      if (!this.reducedMotion) {
        Flip.from(state, { duration: 0.68, ease: 'power3.inOut', absolute: true, scale: true, onComplete: () => { card.style.removeProperty('z-index'); } });
        window.sfx.playWhoosh();
      }
    }

    startGears() {
      this.mechanics.engage();
    }
    stopGears() { this.mechanics.settle(); }

    updateControls() {
      const spinning = this.state === 'spinning';
      const ready = this.state === 'idle';
      const complete = this.state === 'complete';
      this.scene.classList.toggle('is-spinning', spinning);
      this.scene.classList.toggle('has-result', Boolean(this.currentWinner));
      this.scene.classList.toggle('is-complete', complete);
      $('remaining-value').textContent = pad(this.remainingItems.length);
      $('drawn-value').textContent = pad(this.drawnItems.length);
      $('btn-spin').disabled = !ready;
      $('lever-hit').disabled = !ready;
      $('btn-zoom-card').disabled = !this.currentWinner || spinning;
      this.reelWindow.setAttribute('aria-disabled', String(!this.currentWinner || spinning));
      this.reelWindow.tabIndex = this.currentWinner && !spinning ? 0 : -1;
      $('status-text').textContent = this.state === 'loading' ? 'ĐANG CHUẨN BỊ' : spinning ? 'ĐANG BỐC THẺ' : complete ? 'ĐÃ HOÀN TẤT' : this.state === 'error' ? 'CẦN KIỂM TRA' : 'SẴN SÀNG';
      $('status-light').dataset.state = this.state;
      this.reelWindow.setAttribute('aria-busy', String(spinning));
      if (this.draggable) { if (ready) this.draggable.enable(); else this.draggable.disable(); }
      if (complete) $('status-text').title = 'Đã bốc tất cả các thẻ. Tải lại trang để bắt đầu phiên mới.';
    }

    renderHistoryGrid() {
      const grid = $('history-grid');
      grid.replaceChildren();
      $('history-stats').textContent = `${this.drawnItems.length} / ${this.allItems.length} thẻ đã bốc`;
      this.allItems.forEach((item) => {
        const order = this.drawnItems.findIndex((drawn) => drawn.id === item.id);
        const drawn = order !== -1;
        const card = document.createElement(drawn ? 'button' : 'div');
        card.className = `history-item ${drawn ? 'is-drawn' : 'is-undrawn'}`;
        if (drawn) { card.type = 'button'; card.addEventListener('click', () => this.openZoomModal(item, imageWrap)); }
        const imageWrap = document.createElement('div');
        imageWrap.className = 'history-image-wrap';
        imageWrap.append(this.makeImage(item, 'history-image'));
        const badge = document.createElement('span');
        badge.className = 'history-order';
        badge.textContent = drawn ? `LƯỢT ${pad(order + 1)}` : 'CHƯA BỐC';
        imageWrap.append(badge);
        const id = document.createElement('span');
        id.className = 'history-item-id';
        id.textContent = pad(item.id);
        const name = document.createElement('span');
        name.className = 'history-item-name';
        name.textContent = item.name;
        card.append(imageWrap, id, name);
        grid.append(card);
      });
    }

    openHistoryModal() {
      if (this.historyDialog.open || this.zoomDialog.open || this.state === 'loading' || this.state === 'error') return;
      this.renderHistoryGrid();
      this.historyDialog.showModal();
      window.sfx.playModal(true);
    }
    closeHistoryModal() { if (this.historyDialog.open) { this.historyDialog.close(); window.sfx.playModal(false); } }
    isModalOpen() { return this.historyDialog.open; }
    isZoomOpen() { return this.zoomDialog.open; }

    openZoomModal(item, origin = this.reelWindow) {
      if (!item || this.state === 'spinning' || this.zoomDialog.open || !this.drawnItems.some((drawn) => drawn.id === item.id)) return;
      const source = origin && origin.isConnected ? origin : this.reelWindow;
      const sourceRect = source.getBoundingClientRect();
      this.zoomRestoreFocus = document.activeElement;
      const image = $('zoom-card-img');
      $('zoom-card-title').textContent = item.name;
      $('zoom-card-badge').textContent = `THẺ ${pad(item.id)} · LƯỢT ${pad(this.drawnItems.findIndex((drawn) => drawn.id === item.id) + 1)}`;
      let fallback = this.zoomDialog.querySelector('.zoom-image-fallback');
      if (!fallback) {
        fallback = document.createElement('div');
        fallback.className = 'card-fallback zoom-image-fallback';
        image.after(fallback);
      }
      fallback.textContent = `${pad(item.id)} / ${item.name}`;
      const showFallback = () => { image.hidden = true; fallback.hidden = false; };
      image.onerror = showFallback;
      image.alt = item.name;
      image.hidden = this.missingImages.has(item.id);
      fallback.hidden = !image.hidden;
      if (!image.hidden) image.src = item.image;
      else image.removeAttribute('src');
      this.zoomDialog.showModal();
      window.sfx.playZoom(true);
      this.zoomClosing = false;
      const frame = this.zoomDialog.querySelector('.zoom-image-frame');
      const caption = this.zoomDialog.querySelector('.zoom-caption');
      const hint = this.zoomDialog.querySelector('.zoom-hint');
      const impact = this.zoomDialog.querySelector('.zoom-impact');
      const close = $('btn-close-zoom');
      gsap.set([frame, caption, hint, impact, close], { clearProps: 'transform,opacity,visibility' });
      if (this.reducedMotion) return;
      const target = frame.getBoundingClientRect();
      const x = sourceRect.left + sourceRect.width / 2 - target.left - target.width / 2;
      const y = sourceRect.top + sourceRect.height / 2 - target.top - target.height / 2;
      const scaleX = Math.max(0.16, Math.min(1, sourceRect.width / target.width));
      const scaleY = Math.max(0.16, Math.min(1, sourceRect.height / target.height));
      this.zoomTimeline = gsap.timeline({ onComplete: () => {
        this.zoomTimeline = null;
        gsap.set([frame, caption, hint, impact, close], { clearProps: 'transform,opacity,visibility' });
      } });
      this.zoomTimeline.fromTo(frame,
        { x, y, scaleX, scaleY, transformOrigin: '50% 50%' },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.58, ease: 'back.out(1.2)' }, 0);
      this.zoomTimeline.fromTo(impact, { scale: 0.9, opacity: 0.75 },
        { scale: 1.18, opacity: 0, duration: 0.62, ease: 'power2.out' }, 0.05);
      this.zoomTimeline.fromTo(caption, { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.34, ease: 'power3.out' }, 0.26);
      this.zoomTimeline.fromTo(hint, { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, 0.36);
      this.zoomTimeline.fromTo(close, { y: -9, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, 0.3);
    }
    closeZoomModal() {
      if (!this.zoomDialog.open || this.zoomClosing) return;
      this.zoomClosing = true;
      if (this.zoomTimeline) { this.zoomTimeline.kill(); this.zoomTimeline = null; }
      const frame = this.zoomDialog.querySelector('.zoom-image-frame');
      const caption = this.zoomDialog.querySelector('.zoom-caption');
      const hint = this.zoomDialog.querySelector('.zoom-hint');
      const impact = this.zoomDialog.querySelector('.zoom-impact');
      const close = $('btn-close-zoom');
      const finish = () => {
        this.zoomDialog.close();
        gsap.set([frame, caption, hint, impact, close], { clearProps: 'transform,opacity,visibility' });
        this.zoomTimeline = null;
        this.zoomClosing = false;
        if (this.zoomRestoreFocus && this.zoomRestoreFocus.isConnected && this.zoomRestoreFocus.focus) {
          this.zoomRestoreFocus.focus({ preventScroll: true });
        }
        this.zoomRestoreFocus = null;
      };
      window.sfx.playZoom(false);
      if (this.reducedMotion) { finish(); return; }
      this.zoomTimeline = gsap.timeline({ onComplete: finish });
      this.zoomTimeline.to([caption, hint, close], { y: 8, opacity: 0, duration: 0.16, ease: 'power1.in' }, 0);
      this.zoomTimeline.to(frame, { y: 26, scale: 0.92, opacity: 0, duration: 0.24, ease: 'power3.in' }, 0);
    }

    toggleSound() {
      const muted = window.sfx.toggleMute();
      $('btn-sound').classList.toggle('is-muted', muted);
      $('btn-sound').setAttribute('aria-pressed', String(muted));
      $('btn-sound').setAttribute('aria-label', muted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)');
      $('btn-sound').title = muted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)';
      this.announce(muted ? 'Đã tắt âm thanh.' : 'Đã bật âm thanh.');
    }

    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else this.announce('Trình duyệt này không hỗ trợ toàn màn hình. Có thể dùng F11 trên máy tính.');
      } catch (_) { this.announce('Không thể bật toàn màn hình ở đây. Có thể dùng F11 trên máy tính.'); }
    }
    updateFullscreen() {
      const active = Boolean(document.fullscreenElement);
      $('btn-fullscreen').setAttribute('aria-pressed', String(active));
      $('btn-fullscreen').setAttribute('aria-label', active ? 'Thoát toàn màn hình' : 'Mở toàn màn hình');
    }
    isCompleted() { return this.state === 'complete'; }
  }

  window.BingoApp = BingoApp;
  const boot = () => { window.app = new BingoApp(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
