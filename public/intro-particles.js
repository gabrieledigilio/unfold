/** Decorative, deterministic point-cloud studies for the upload screen. No WebGL context. */
const IDS = ['macbook', 'lamp', 'drill'];
const TAU = Math.PI * 2;
const COUNT = 1900;
const HOLD_MS = 3200;
const MORPH_MS = 1700;
const PERIOD_MS = HOLD_MS + MORPH_MS;
const PALETTES = {
  blueprint: { point: '#effaff', accent: '#a6edff', line: '#d3ebff', glow: 'rgba(140,220,255,.09)' },
  paper: { point: '#294e60', accent: '#137ca2', line: '#427085', glow: 'rgba(28,113,151,.055)' },
  graphite: { point: '#dbf5ff', accent: '#75ddf7', line: '#7db8ce', glow: 'rgba(109,220,255,.065)' }
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

function geometry() {
  const points = [], lines = [];
  const point = p => points.push(p);
  function line(a, b, spacing = .07, structural = true) {
    const steps = Math.max(1, Math.ceil(Math.hypot(...a.map((v, n) => b[n] - v)) / spacing));
    for (let i = 0; i <= steps; i++) point(a.map((v, n) => mix(v, b[n], i / steps)));
    if (structural) lines.push([a, b]);
  }
  function loop(vertices, spacing = .07, structural = true) {
    vertices.forEach((v, i) => line(v, vertices[(i + 1) % vertices.length], spacing, structural));
  }
  function plane(origin, u, v, su = .19, sv = .19) {
    const nu = Math.max(1, Math.round(Math.hypot(...u) / su));
    const nv = Math.max(1, Math.round(Math.hypot(...v) / sv));
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
      point(origin.map((value, n) => value + u[n] * a / nu + v[n] * b / nv));
    }
  }
  function box(center, size, fill = true, transform = p => p) {
    const corners = Array.from({ length: 8 }, (_, i) => transform(center.map((v, n) => v + size[n] * ((i >> n & 1) - .5))));
    for (let i = 0; i < 8; i++) for (let n = 0; n < 3; n++) if (!(i >> n & 1)) line(corners[i], corners[i | (1 << n)]);
    if (fill) for (let n = 0; n < 3; n++) for (let side = 0; side <= 1; side++) {
      const axes = [0, 1, 2].filter(a => a !== n);
      const n0 = Math.max(1, Math.round(size[axes[0]] / .18)), n1 = Math.max(1, Math.round(size[axes[1]] / .18));
      for (let a = 0; a <= n0; a++) for (let b = 0; b <= n1; b++) {
        const p = center.map((v, i) => v - size[i] / 2);
        p[n] += size[n] * side; p[axes[0]] += size[axes[0]] * a / n0; p[axes[1]] += size[axes[1]] * b / n1;
        point(transform(p));
      }
    }
  }
  function cylinder(a, b, radiusA, radiusB = radiusA, spacing = .10, caps = false) {
    const axis = b.map((v, i) => v - a[i]), length = Math.hypot(...axis);
    const d = axis.map(v => v / length);
    const seed = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u0 = [d[1] * seed[2] - d[2] * seed[1], d[2] * seed[0] - d[0] * seed[2], d[0] * seed[1] - d[1] * seed[0]];
    const ul = Math.hypot(...u0), u = u0.map(v => v / ul);
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const segments = Math.max(16, Math.ceil(TAU * Math.max(radiusA, radiusB) / spacing));
    const rings = Math.max(1, Math.ceil(length / spacing));
    const ringPoint = (t, angle, r = mix(radiusA, radiusB, t)) => a.map((value, n) => value + axis[n] * t + (u[n] * Math.cos(angle) + v[n] * Math.sin(angle)) * r);
    for (let i = 0; i <= rings; i++) for (let j = 0; j < segments; j++) point(ringPoint(i / rings, j / segments * TAU));
    for (let i = 0; i < 2; i++) loop(Array.from({ length: 40 }, (_, n) => ringPoint(i, n / 40 * TAU)), .075);
    for (let i = 0; i < 4; i++) line(ringPoint(0, i / 4 * TAU), ringPoint(1, i / 4 * TAU), .10);
    if (caps) for (let i = 0; i < 2; i++) {
      const radius = i ? radiusB : radiusA;
      for (let r = spacing; r < radius; r += spacing) for (let j = 0; j < Math.ceil(TAU * r / spacing); j++) point(ringPoint(i, j / Math.ceil(TAU * r / spacing) * TAU, r));
    }
  }
  return { points, lines, point, line, loop, plane, box, cylinder };
}

function macbook(g) {
  // The display and keyboard are different planes; the hinge stays visibly open.
  g.box([0, -1.28, .35], [5.65, .16, 3.5], false);
  g.plane([-2.825, -1.19, -1.4], [5.65, 0, 0], [0, 0, 3.5], .18, .22);
  const lid = p => [p[0], p[1], p[2] - (p[1] + 1.2) * .19];
  g.box([0, .58, -1.43], [5.65, 3.6, .12], false, lid);
  const screen = [[-2.59, -1.0, -1.35], [2.59, -1.0, -1.35], [2.59, 2.14, -1.35], [-2.59, 2.14, -1.35]].map(lid);
  g.loop(screen, .06);
  g.plane(screen[0], [5.18, 0, 0], [0, 3.14, -.5966], .17, .17);
  // Notch, keys, speaker perforations and a broad trackpad anchor recognition.
  g.loop([[-.3, 2.15, -1.34], [-.3, 2.02, -1.34], [.3, 2.02, -1.34], [.3, 2.15, -1.34]].map(lid), .055);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) {
    const x = -2.19 + col * .37, z = -.98 + row * .28;
    g.loop([[x, -1.175, z], [x + .29, -1.175, z], [x + .29, -1.175, z + .20], [x, -1.175, z + .20]], .13, false);
  }
  g.loop([[-1.06, -1.175, .7], [1.06, -1.175, .7], [1.06, -1.175, 1.75], [-1.06, -1.175, 1.75]], .05);
  for (const x of [-2.59, 2.59]) g.plane([x, -1.175, -.99], [.08, 0, 0], [0, 0, 1.4], .08, .09);
  g.line([-.4, -1.26, 2.11], [.4, -1.26, 2.11], .04);
}

function lamp(g) {
  g.cylinder([-1.05, -2.16, 0], [-1.05, -1.98, 0], 1.02, .99, .105, true);
  g.cylinder([-1.35, -1.98, 0], [-1.35, -1.62, 0], .18, .15, .07);
  const joints = [[-1.35, -1.67, 0], [-1.65, .35, 0], [.45, 2.02, 0]];
  for (let i = 0; i < 2; i++) for (const z of [-.15, .15]) {
    g.cylinder([joints[i][0], joints[i][1], z], [joints[i + 1][0], joints[i + 1][1], z], .055, .055, .07);
  }
  for (const p of joints) g.cylinder([p[0], p[1], -.26], [p[0], p[1], .26], .17, .17, .065, true);
  g.cylinder([.45, 2.02, 0], [.93, 2.02, 0], .095, .095, .08);
  // Bell shade and the concentric LED underside clearly distinguish the lamp.
  g.cylinder([1.16, 2.13, 0], [1.16, 1.54, 0], .31, .84, .085);
  g.cylinder([1.16, 1.53, 0], [1.16, 1.49, 0], .79, .79, .09);
  for (let n = 0; n < 12; n++) {
    const a = n / 12 * TAU;
    g.point([1.16 + Math.cos(a) * .52, 1.48, Math.sin(a) * .52]);
  }
  g.line([-1.37, -1.76, -.075], [-1.69, .35, -.075], .09, false);
  g.line([-1.69, .35, -.075], [.48, 1.96, -.075], .09, false);
  g.cylinder([-.63, -1.97, .36], [-.63, -1.955, .36], .10, .10, .04);
}

function drill(g) {
  // Horizontal motor, concentric chuck, forward bit, angled grip and battery foot.
  g.cylinder([-1.62, 1.12, 0], [.80, 1.12, 0], .57, .58, .10);
  g.cylinder([.80, 1.12, 0], [1.35, 1.12, 0], .58, .43, .085);
  g.cylinder([1.35, 1.12, 0], [1.93, 1.12, 0], .35, .27, .07);
  g.cylinder([1.93, 1.12, 0], [2.78, 1.12, 0], .065, .045, .07);
  g.cylinder([-1.67, 1.12, 0], [-1.62, 1.12, 0], .48, .57, .09, true);
  const grip = p => [p[0] + (p[1] + .3) * .20, p[1], p[2]];
  g.box([-.65, -.33, 0], [.76, 2.03, .72], true, grip);
  g.box([-.84, -1.58, .04], [1.78, .59, 1.05], true);
  g.box([-.79, -1.24, .04], [1.26, .15, .80], false);
  g.box([-.06, .31, .03], [.26, .45, .50], false);
  // Grip ribs and ventilation slots give the point study a technical reading.
  for (let i = 0; i < 5; i++) g.line(grip([-1.045, -.23 - i * .19, .37]), grip([-.27, -.23 - i * .19, .37]), .07);
  for (let i = 0; i < 6; i++) g.line([-1.43 + i * .18, 1.24, .56], [-1.38 + i * .18, 1.52, .43], .07);
}

const SHAPES = new Map();
function shape(id) {
  if (SHAPES.has(id)) return SHAPES.get(id);
  const g = geometry();
  ({ macbook, lamp, drill }[id] || macbook)(g);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of g.points) p.forEach((v, n) => { lo[n] = Math.min(lo[n], v); hi[n] = Math.max(hi[n], v); });
  const center = lo.map((v, n) => (v + hi[n]) * .5);
  const scale = 5.65 / Math.max(...lo.map((v, n) => hi[n] - v));
  const normalize = p => p.map((v, n) => (v - center[n]) * scale);
  const result = { points: g.points.map(normalize), lines: g.lines.map(line => line.map(normalize)) };
  SHAPES.set(id, result);
  return result;
}

function spatialKey(p) {
  const q = p.map(v => clamp(Math.round((v + 3.1) / 6.2 * 127), 0, 127));
  let code = 0;
  for (let bit = 0; bit < 7; bit++) for (let axis = 0; axis < 3; axis++) code |= ((q[axis] >> bit) & 1) << (bit * 3 + axis);
  return code;
}

/** Stable, bounded coordinates; same point count and spatial ordering for every study. */
export function sampleIntroShape(id, count = COUNT) {
  if (!Number.isInteger(count) || count < 0 || count > 12000) throw new RangeError('Point count must be an integer from 0 to 12000.');
  const source = shape(IDS.includes(id) ? id : 'macbook').points;
  const chosen = Array.from({ length: count }, (_, i) => source[Math.floor((i + .5) * source.length / count)]);
  chosen.sort((a, b) => spatialKey(a) - spatialKey(b));
  return new Float32Array(chosen.flat());
}

/** A small self-contained animation controller. Failure leaves the HTML illustration intact. */
export function createIntroParticles(container, { theme = 'blueprint', onObjectChange = () => {} } = {}) {
  const noop = { destroy() {}, setTheme() {}, setActive() {}, setPaused() {} };
  const doc = container?.ownerDocument;
  const win = doc?.defaultView;
  if (!container || !doc || !win?.requestAnimationFrame) return noop;
  const canvas = doc.createElement('canvas');
  let ctx;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch { return noop; }
  if (!ctx) return noop;
  canvas.className = 'intro-particle-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  container.appendChild(canvas);
  const clouds = IDS.map(id => sampleIntroShape(id));
  const structures = IDS.map(id => shape(id).lines);
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = !!motion?.matches;
  let width = 0, height = 0, elapsed = 0, lastTime = null, frame = 0;
  let active = true, paused = false, destroyed = false, currentObject = '';
  let visible = doc.visibilityState !== 'hidden';
  let palette = PALETTES[theme] || PALETTES.blueprint;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const projected = Array.from({ length: COUNT }, () => ({ x: 0, y: 0, z: 0, size: 1, alpha: 1, accent: false }));

  function emitObject(id) {
    if (id === currentObject) return;
    currentObject = id;
    // A consumer callback must never be allowed to break the decorative drawing.
    try { onObjectChange(id); } catch { /* Decorative callback only. */ }
  }
  function paint() {
    if (destroyed || !width || !height) return;
    const cycle = Math.floor(elapsed / PERIOD_MS) % IDS.length;
    const cycleTime = elapsed % PERIOD_MS;
    const rawMorph = clamp((cycleTime - HOLD_MS) / MORPH_MS, 0, 1);
    const t = smooth(rawMorph), next = (cycle + 1) % IDS.length;
    const a = clouds[cycle], b = clouds[next];
    emitObject(IDS[rawMorph < .5 ? cycle : next]);
    const time = reducedMotion ? 0 : elapsed;
    const yaw = -.37 + Math.sin(time * .00024) * .14 + pointer.x * .10;
    const pitch = .23 + Math.sin(time * .00019) * .025 + pointer.y * .055;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const unit = Math.min(width * .135, height * .145);
    const centerX = width * .50, centerY = height * .50;
    const project = (x, y, z) => {
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      const ry = y * cx - rz * sx, depth = y * sx + rz * cx;
      const perspective = 12 / (12 - depth);
      return { x: centerX + rx * unit * perspective, y: centerY - ry * unit * perspective, z: depth, perspective };
    };
    ctx.clearRect(0, 0, width, height);
    const halo = ctx.createRadialGradient(centerX, centerY, unit * .2, centerX, centerY, unit * 3.1);
    halo.addColorStop(0, palette.glow); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);

    // Fine dimensional reference around the study, behind the actual point cloud.
    ctx.lineWidth = .7; ctx.strokeStyle = palette.line; ctx.globalAlpha = .095;
    for (const radius of [2.4, 3.15]) {
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const angle = i / 100 * TAU;
        const p = project(Math.cos(angle) * radius, -2.9, Math.sin(angle) * radius * .72);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // Edge traces dissolve during a morph, then reassemble with the next object.
    for (const [index, weight] of [[cycle, (1 - t) ** 4], [next, t ** 4]]) {
      if (weight < .02) continue;
      ctx.globalAlpha = .13 * weight; ctx.beginPath();
      for (const [from, to] of structures[index]) {
        const f = project(...from), e = project(...to);
        ctx.moveTo(f.x, f.y); ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
    }
    const sweep = ((time * .00025) % 1) * 8 - 4;
    const bloom = Math.sin(rawMorph * Math.PI) * .26;
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      // Small curved paths make the same particles travel between spatially matched forms.
      const x = mix(a[j], b[j], t) + Math.sin(i * 2.39996) * bloom;
      const y = mix(a[j + 1], b[j + 1], t) + Math.cos(i * 1.732) * bloom * .45;
      const z = mix(a[j + 2], b[j + 2], t) + Math.cos(i * 2.39996) * bloom;
      const p = project(x, y, z), target = projected[i];
      const light = Math.max(0, 1 - Math.abs(y - sweep) / .35) * (1 - Math.sin(rawMorph * Math.PI));
      target.x = p.x; target.y = p.y; target.z = p.z;
      target.size = clamp((.69 + (i % 11 === 0 ? .25 : 0) + light * .38) * p.perspective, .48, 1.45);
      target.alpha = clamp(.40 + p.z * .07 + (i % 13 === 0 ? .22 : 0) + light * .45, .20, .96);
      target.accent = i % 9 === 0 || light > .45;
    }
    // Rear points first keeps all three forms legible without an opaque surface.
    const order = projected.slice().sort((p, q) => p.z - q.z);
    for (const p of order) {
      ctx.globalAlpha = p.alpha; ctx.fillStyle = p.accent ? palette.accent : palette.point;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    container.classList.add('is-ready');
  }

  function shouldAnimate() { return !destroyed && active && visible && !paused && !reducedMotion && width > 0 && height > 0; }
  function animate(timestamp) {
    frame = 0;
    if (!shouldAnimate()) { lastTime = null; return; }
    if (lastTime !== null) elapsed += Math.min(50, Math.max(0, timestamp - lastTime));
    lastTime = timestamp;
    pointer.x += (pointer.targetX - pointer.x) * .055;
    pointer.y += (pointer.targetY - pointer.y) * .055;
    paint();
    frame = win.requestAnimationFrame(animate);
  }
  function sync() {
    if (destroyed) return;
    if (shouldAnimate()) { if (!frame) frame = win.requestAnimationFrame(animate); }
    else { if (frame) win.cancelAnimationFrame(frame); frame = 0; lastTime = null; }
  }
  function resize() {
    if (destroyed) return;
    const rect = container.getBoundingClientRect();
    width = Math.max(0, rect.width); height = Math.max(0, rect.height);
    const dpr = clamp(win.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(); sync();
  }
  function onPointer(event) {
    if (paused || reducedMotion || event.pointerType === 'touch') return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.targetX = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    pointer.targetY = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
  }
  function resetPointer() { pointer.targetX = pointer.targetY = 0; }
  function visibility() { visible = doc.visibilityState !== 'hidden'; sync(); }
  function motionChange(event) {
    reducedMotion = event.matches;
    if (reducedMotion) { elapsed = 0; pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0; paint(); }
    sync();
  }
  container.addEventListener('pointermove', onPointer, { passive: true });
  container.addEventListener('pointerleave', resetPointer);
  doc.addEventListener('visibilitychange', visibility);
  if (motion?.addEventListener) motion.addEventListener('change', motionChange);
  else motion?.addListener?.(motionChange);
  let observer;
  if (win.ResizeObserver) { observer = new win.ResizeObserver(resize); observer.observe(container); }
  else win.addEventListener('resize', resize, { passive: true });
  resize();
  return {
    setTheme(value) { if (destroyed) return; palette = PALETTES[value] || PALETTES.blueprint; paint(); },
    setActive(value) { active = !!value; sync(); },
    setPaused(value) { paused = !!value; sync(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      win.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointer);
      container.removeEventListener('pointerleave', resetPointer);
      doc.removeEventListener('visibilitychange', visibility);
      if (motion?.removeEventListener) motion.removeEventListener('change', motionChange);
      else motion?.removeListener?.(motionChange);
      container.classList.remove('is-ready');
      canvas.remove();
    }
  };
}
