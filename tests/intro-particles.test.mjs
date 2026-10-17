import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntroParticles, sampleIntroShape } from '../public/intro-particles.js';

for (const id of ['macbook', 'lamp', 'drill']) {
  test(`${id} has deterministic, finite geometry with actual depth`, () => {
    const points = sampleIntroShape(id, 1900);
    assert.equal(points.length, 5700);
    assert.deepEqual(points, sampleIntroShape(id, 1900));
    for (const value of points) assert.ok(Number.isFinite(value) && Math.abs(value) < 3);
    for (let axis = 0; axis < 3; axis++) {
      const coordinates = points.filter((_, i) => i % 3 === axis);
      assert.ok(Math.max(...coordinates) - Math.min(...coordinates) > .8, `axis ${axis} is genuinely three dimensional`);
    }
    const unique = new Set(Array.from({ length: points.length / 3 }, (_, i) => Array.from(points.slice(i * 3, i * 3 + 3)).join(',')));
    assert.ok(unique.size > 1500, 'point cloud retains visible spatial detail');
  });
}

test('all studies support matching point counts for morphs and reject unbounded allocation', () => {
  for (const count of [0, 1, 50, 12000]) for (const id of ['macbook', 'lamp', 'drill']) assert.equal(sampleIntroShape(id, count).length, count * 3);
  assert.throws(() => sampleIntroShape('lamp', Infinity), RangeError);
  assert.throws(() => sampleIntroShape('lamp', 12001), RangeError);
  assert.throws(() => sampleIntroShape('lamp', -1), RangeError);
  assert.deepEqual(sampleIntroShape('unknown', 10), sampleIntroShape('macbook', 10));
});

function environment({ reduced = false, noContext = false, hidden = false, noObserver = false } = {}) {
  function events() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(name, callback) { listeners.set(name, callback); },
      removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
      dispatch(name, event = {}) { listeners.get(name)?.(event); }
    };
  }
  const scheduled = new Map(), calls = { frames: 0, draw: 0, observerDisconnected: 0, transforms: [] };
  let nextId = 1;
  const motion = { ...events(), matches: reduced };
  const win = { ...events(), devicePixelRatio: 3,
    requestAnimationFrame(fn) { const id = nextId++; scheduled.set(id, fn); return id; },
    cancelAnimationFrame(id) { scheduled.delete(id); },
    matchMedia() { return motion; }
  };
  if (!noObserver) win.ResizeObserver = class {
    constructor(fn) { this.fn = fn; }
    observe() {}
    disconnect() { calls.observerDisconnected++; }
  };
  const ctx = {
    clearRect() { calls.draw++; }, setTransform(...args) { calls.transforms.push(args); },
    createRadialGradient() { return { addColorStop() {} }; }, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}
  };
  const canvas = { style: {}, setAttribute() {}, getContext() { return noContext ? null : ctx; }, remove() { container.children.splice(container.children.indexOf(canvas), 1); } };
  const doc = { ...events(), defaultView: win, visibilityState: hidden ? 'hidden' : 'visible', createElement() { return canvas; } };
  const classes = new Set();
  const container = { ...events(), ownerDocument: doc, children: [],
    appendChild(child) { this.children.push(child); },
    getBoundingClientRect() { return { width: 650, height: 540, left: 0, top: 0 }; },
    classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); } }
  };
  function tick(timestamp) { const tasks = Array.from(scheduled.values()); scheduled.clear(); for (const fn of tasks) { calls.frames++; fn(timestamp); } }
  return { win, doc, container, canvas, motion, calls, scheduled, tick };
}

test('animation settles into the three requested studies and pause resumes without a time jump', () => {
  const env = environment(), objects = [];
  const controller = createIntroParticles(env.container, { onObjectChange: id => objects.push(id) });
  assert.deepEqual(objects, ['macbook']);
  assert.equal(env.canvas.width, 1300, 'pixel ratio capped at two');
  assert.equal(env.container.classList.contains('is-ready'), true);
  for (let time = 0; time < 4300; time += 50) env.tick(time);
  assert.deepEqual(objects, ['macbook', 'lamp']);
  controller.setPaused(true);
  assert.equal(env.scheduled.size, 0);
  env.tick(50000);
  controller.setPaused(false);
  env.tick(100000);
  assert.deepEqual(objects, ['macbook', 'lamp'], 'pause does not skip to a different study');
  for (let time = 100050; time < 105000; time += 50) env.tick(time);
  assert.deepEqual(objects, ['macbook', 'lamp', 'drill']);
  controller.destroy();
});

test('inactive and hidden stages stop scheduling, then clean up every listener', () => {
  const env = environment(), controller = createIntroParticles(env.container);
  assert.equal(env.scheduled.size, 1);
  controller.setActive(false); assert.equal(env.scheduled.size, 0);
  controller.setActive(true); assert.equal(env.scheduled.size, 1);
  env.doc.visibilityState = 'hidden'; env.doc.dispatch('visibilitychange'); assert.equal(env.scheduled.size, 0);
  env.doc.visibilityState = 'visible'; env.doc.dispatch('visibilitychange'); assert.equal(env.scheduled.size, 1);
  controller.destroy(); controller.destroy();
  assert.equal(env.scheduled.size, 0);
  assert.equal(env.container.children.length, 0);
  assert.equal(env.container.classList.contains('is-ready'), false);
  assert.equal(env.container.listeners.size, 0);
  assert.equal(env.doc.listeners.size, 0);
  assert.equal(env.motion.listeners.size, 0);
  assert.equal(env.calls.observerDisconnected, 1);
  controller.setTheme('paper'); controller.setPaused(false); controller.setActive(true);
  assert.equal(env.scheduled.size, 0);
});

test('reduced motion paints a stable object and theme updates without starting animation', () => {
  const env = environment({ reduced: true }), objects = [];
  const controller = createIntroParticles(env.container, { onObjectChange: id => objects.push(id) });
  assert.equal(env.scheduled.size, 0);
  assert.equal(env.calls.draw, 1);
  controller.setTheme('paper'); controller.setPaused(false);
  assert.equal(env.calls.draw, 2);
  assert.equal(env.scheduled.size, 0);
  assert.deepEqual(objects, ['macbook']);
  env.motion.dispatch('change', { matches: false }); assert.equal(env.scheduled.size, 1);
  env.motion.dispatch('change', { matches: true }); assert.equal(env.scheduled.size, 0);
  controller.destroy();
});

test('missing canvas keeps the HTML fallback, and resize-listener fallback is cleaned up', () => {
  const absent = environment({ noContext: true });
  const noCanvas = createIntroParticles(absent.container);
  noCanvas.setActive(false); noCanvas.setPaused(true); noCanvas.setTheme('paper'); noCanvas.destroy();
  assert.equal(absent.container.children.length, 0);
  assert.equal(absent.container.classList.contains('is-ready'), false);
  const env = environment({ noObserver: true });
  const controller = createIntroParticles(env.container);
  assert.equal(env.win.listeners.has('resize'), true);
  controller.destroy(); assert.equal(env.win.listeners.size, 0);
  assert.doesNotThrow(() => createIntroParticles(null).destroy());
});
