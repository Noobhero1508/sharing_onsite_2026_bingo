/* A single logical coordinate system keeps cabinet, reel and lever aligned at every size. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  const viewport = document.getElementById('stage-viewport');
  const update = () => {
    const portrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
    const width = portrait ? 768 : 1920;
    const height = portrait ? 1440 : 1080;
    const scale = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
    scene.style.setProperty('--scene-scale', scale);
    window.dispatchEvent(new CustomEvent('scene:resize', {detail: {scale, width, height}}));
  };
  new ResizeObserver(update).observe(viewport);
  window.addEventListener('resize', update);
  document.addEventListener('fullscreenchange', update);
  update();
})();
