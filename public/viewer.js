/**
 * UNFOLD's conceptual, procedural laptop model. This is an educational
 * illustration of a 2021 14-inch laptop, not a measurement or repair diagram.
 * Three.js r180; dependencies are vendored locally with their MIT license.
 */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { OBJECT_SPECS, buildAdditionalModel, applyObjectSeparation, applyObjectActivity, animateObject } from './object-models.js';
import { generatedSpec, buildGeneratedModel, updateGeneratedModel } from './generated-model.js?v=7';

const THEMES = {
  blueprint: { shell: 0xb1cef5, deck: 0x84b0e8, bezel: 0x102e6a, keys: 0x143c79, screen: 0x367dee, board: 0x173c81, chip: 0x5e9ee7, battery: 0x173f86, fan: 0x1b458c, metal: 0xc1dfff, wire: 0xe8f6ff, selected: 0xe2f6ff, emissive: 0x5f96dd, grid: 0x87b9ff, copper: 0x93bcfa, led: 0xffefd6 },
  paper: { shell: 0xbfc2c8, deck: 0xd4d6db, bezel: 0x17191d, keys: 0x22252b, screen: 0x374247, board: 0x224238, chip: 0x909ba0, battery: 0x2b2e33, fan: 0x373c42, metal: 0x8d8f95, wire: 0x454b53, selected: 0x6d89b5, emissive: 0x274f7a, grid: 0x777d88, copper: 0xb9784b, led: 0xffecd1 },
  graphite: { shell: 0xb8bec9, deck: 0xc3c8d1, bezel: 0x15181d, keys: 0x20252c, screen: 0x354753, board: 0x273e39, chip: 0x89969e, battery: 0x292e36, fan: 0x3a404a, metal: 0x9fa9b9, wire: 0xa5b3c8, selected: 0xdef0ff, emissive: 0x3b607e, grid: 0x8e9cac, copper: 0xbe8150, led: 0xffeac7 }
};

export class ObjectViewer {
  constructor(container, options = {}) {
    if (!container) throw new TypeError('A container is required.');
    this.container = container;
    this.options = options;
    this.objectId = options.objectId === 'generated' ? 'generated' : OBJECT_SPECS[options.objectId] ? options.objectId : 'macbook';
    this.spec = this.objectId === 'generated' ? generatedSpec(options.blueprint) : OBJECT_SPECS[this.objectId];
    this.activity = Number.isFinite(Number(options.activity)) ? THREE.MathUtils.clamp(Number(options.activity), 0, 1) : (this.objectId === 'lamp' ? .7 : 0);
    this.theme = THEMES[options.theme] ? options.theme : 'blueprint';
    this.selected = Object.hasOwn(this.spec.parts, options.selected) ? options.selected : null;
    this.separation = Number.isFinite(options.separation) ? THREE.MathUtils.clamp(options.separation, 0, 1) : (options.exploded ? 1 : 0);
    this.exploded = this.separation > .02;
    this.view = 'perspective';
    this.disposed = false;
    this.failed = false;
    this.ready = false;
    this.resources = new Set();
    this.materials = [];
    this.parts = {};
    this.explodeProgress = this.separation;
    this.listeners = [];
    this.media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = Boolean(this.media?.matches);
    this.autoRotate = Boolean(options.autoRotate ?? true) && !this.reducedMotion;
    this.visible = true;
    this.active = true;
    this.dirty = true;
    this.root = document.createElement('div');
    this.root.className = 'object-viewer';
    this.root.dataset.theme = this.theme;
    this.root.dataset.object = this.objectId;
    container.append(this.root);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'object-viewer__tooltip';
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.root.append(this.tooltip);
    this.status = document.createElement('span');
    this.status.className = 'object-viewer__sr';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.root.append(this.status);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.22;
      const canvas = this.renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Interactive illustrated ${this.spec.name}. Drag to rotate; pinch or scroll to zoom. Arrow keys rotate, plus and minus zoom, Home resets. Components can also be selected with the component buttons.`);
      this.root.prepend(canvas);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, 1, this.objectId === 'generated' ? .02 : .1, this.spec.farPlane || 80);
      this.camera.position.set(...this.spec.camera);
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = .09;
      this.controls.enablePan = false;
      this.controls.minDistance = this.spec.minDistance;
      this.controls.maxDistance = this.spec.maxDistance;
      this.controls.minPolarAngle = .001;
      this.controls.maxPolarAngle = Math.PI * .85;
      this.controls.rotateSpeed = .7;
      this.controls.zoomSpeed = .8;
      this.controls.autoRotate = this.autoRotate;
      this.controls.autoRotateSpeed = .45;
      this.controls.target.set(...this.spec.target);
      this.controls.update();
      this.homePosition = this.camera.position.clone();
      this.homeTarget = this.controls.target.clone();
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.scene.add(new THREE.HemisphereLight(0xf1f6ff, 0x2b344a, 2.35));
      const key = new THREE.DirectionalLight(0xffffff, 3.1);
      key.position.set(3, 9, 6);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x9ebeff, 2.4);
      rim.position.set(-7, 5, -5);
      this.scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffffff, 1.2);
      fill.position.set(-4, 2, 7);
      this.scene.add(fill);
      this.model = new THREE.Group();
      this.scene.add(this.model);
      if (this.objectId === 'macbook') this.buildModel();
      else if (this.objectId === 'generated') buildGeneratedModel(this, options.blueprint);
      else buildAdditionalModel(this, this.objectId);
      this.scopePartMaterials();
      this.buildPins();
      this.setTheme(this.theme);
      this.select(this.selected);
      this.applyExplosion();
      this.bindEvents();
      this.resize();
      this.renderer.render(this.scene, this.camera);
      this.updatePins();
      this.ready = true;
      queueMicrotask(() => { if (!this.disposed && !this.failed) options.onReady?.({ renderer: 'webgl' }); });
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame((time) => this.tick(time));
    } catch (error) {
      this.fail(error);
    }
  }

  own(resource) { this.resources.add(resource); return resource; }

  material(role, options = {}) {
    const material = this.own(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .25, roughness: .48, ...options }));
    material.userData.role = role;
    material.userData.baseEmissive = options.emissiveIntensity || 0;
    this.materials.push(material);
    return material;
  }

  box(parent, size, position, role, { radius = .055, outline = false, material = null } = {}) {
    const geometry = this.own(new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(n => n / 2))));
    const mesh = new THREE.Mesh(geometry, material || this.material(role));
    mesh.position.set(...position);
    parent.add(mesh);
    if (outline) this.outline(mesh, geometry);
    return mesh;
  }

  outline(mesh, geometry) {
    const edges = this.own(new THREE.EdgesGeometry(geometry, 24));
    const line = this.own(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false }));
    line.userData.role = 'wire';
    this.materials.push(line);
    const outline = new THREE.LineSegments(edges, line);
    outline.raycast = () => {};
    mesh.add(outline);
    return outline;
  }

  assembly(name, base, offset, id = null) {
    const group = new THREE.Group();
    group.name = name;
    group.userData.base = new THREE.Vector3(...base);
    group.userData.offset = new THREE.Vector3(...offset);
    group.position.copy(group.userData.base);
    if (id) { group.userData.partId = id; this.parts[id] = group; }
    this.model.add(group);
    return group;
  }

  buildModel() {
    // The upper enclosure moves away from the board and battery in the teaching view.
    this.bottom = this.assembly('Bottom enclosure', [0, -.075, 0], [0, -.52, 0]);
    this.box(this.bottom, [6.6, .25, 4.55], [0, 0, 0], 'shell', { radius: .13, outline: true });
    const footMat = this.material('keys');
    const footGeo = this.own(new THREE.CylinderGeometry(.21, .21, .045, 24));
    for (const x of [-2.75, 2.75]) for (const z of [-1.73, 1.73]) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(x, -.14, z);
      this.bottom.add(foot);
    }
    // Ports are geometric recesses, simplified in number and location.
    for (const side of [-1, 1]) {
      for (let n = 0; n < 3; n++) this.box(this.bottom, [.018, .075, .27], [side * 3.302, .02, -1.6 + n * .56], 'keys', { radius: .025 });
    }
    this.deck = this.assembly('Keyboard and upper case', [0, .125, 0], [-2.8, 1.12, .4]);
    this.box(this.deck, [6.58, .12, 4.53], [0, 0, 0], 'deck', { radius: .085, outline: true });
    this.box(this.deck, [4.9, .035, 2.17], [0, .077, -.90], 'keys', { radius: .08, outline: true });
    const keyGeometry = this.own(new RoundedBoxGeometry(.286, .046, .265, 1, .028));
    const keyMaterial = this.material('keys', { roughness: .73, metalness: .05 });
    const keys = this.own(new THREE.InstancedMesh(keyGeometry, keyMaterial, 80));
    const dummy = new THREE.Object3D();
    let count = 0;
    // A real row of separate function keys, as on the 2021 chassis.
    for (let col = 0; col < 14; col++) {
      dummy.position.set(-2.23 + col * .343, .116, -1.77);
      dummy.scale.set(1, 1, .86); dummy.updateMatrix(); keys.setMatrixAt(count++, dummy.matrix);
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
      dummy.position.set(-2.23 + col * .343, .116, -1.40 + row * .33);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); keys.setMatrixAt(count++, dummy.matrix);
    }
    for (const x of [-2.18, -1.74, 1.74, 2.18]) {
      dummy.position.set(x, .116, -.075); dummy.scale.set(1.3, 1, 1); dummy.updateMatrix(); keys.setMatrixAt(count++, dummy.matrix);
    }
    dummy.position.set(0, .116, -.075); dummy.scale.set(8.5, 1, 1); dummy.updateMatrix(); keys.setMatrixAt(count++, dummy.matrix);
    keys.count = count;
    keys.instanceMatrix.needsUpdate = true;
    this.deck.add(keys);
    // Tiny repeated perforations give the speaker strips their own materiality.
    const holeGeometry = this.own(new THREE.CircleGeometry(.018, 5));
    const holeMaterial = this.material('keys', { roughness: 1, metalness: 0 });
    const holes = this.own(new THREE.InstancedMesh(holeGeometry, holeMaterial, 2 * 6 * 32));
    count = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 32; row++) for (let col = 0; col < 6; col++) {
      dummy.position.set(side * (2.7 + col * .058), .067, -1.6 + row * .062);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); holes.setMatrixAt(count++, dummy.matrix);
    }
    holes.instanceMatrix.needsUpdate = true; this.deck.add(holes);
    this.parts.trackpad = new THREE.Group();
    this.parts.trackpad.userData.partId = 'trackpad';
    this.deck.add(this.parts.trackpad);
    this.box(this.parts.trackpad, [2.97, .018, 1.45], [0, .07, 1.14], 'shell', { radius: .07, outline: true });
    this.trackpadPulse = new THREE.Mesh(
      this.own(new THREE.RingGeometry(.15, .17, 64)),
      this.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    );
    this.trackpadPulse.rotation.x = -Math.PI / 2;
    this.trackpadPulse.position.set(0, .087, 1.14);
    this.trackpadPulse.visible = false;
    this.trackpadPulse.raycast = () => {};
    this.parts.trackpad.add(this.trackpadPulse);
    this.box(this.deck, [.78, .038, .10], [0, .042, 2.24], 'shell', { radius: .04 });

    // Hinged display: back shell, narrow dark bezel, luminous image and notch.
    this.display = this.assembly('Display assembly', [0, .20, -2.085], [0, 1.5, -.72], 'display');
    this.display.rotation.x = -.20;
    this.box(this.display, [6.59, 4.38, .14], [0, 2.19, 0], 'shell', { radius: .10, outline: true });
    this.box(this.display, [6.44, 4.22, .024], [0, 2.21, .083], 'bezel', { radius: .07, outline: true });
    this.screenTexture = this.makeScreenTexture();
    const screenMat = this.own(new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false }));
    this.box(this.display, [6.27, 4.04, .012], [0, 2.24, .101], 'screen', { radius: .035, material: screenMat });
    this.box(this.display, [.85, .16, .017], [0, 4.184, .119], 'bezel', { radius: .025 });
    const cameraDot = new THREE.Mesh(this.own(new THREE.CircleGeometry(.019, 16)), this.material('metal', { metalness: .3, roughness: .2 }));
    cameraDot.position.set(0, 4.19, .131); this.display.add(cameraDot);
    for (const x of [-2.3, 2.3]) {
      const hinge = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.1, .1, .8, 16)), this.material('bezel'));
      hinge.rotation.z = Math.PI / 2; hinge.position.set(x, .10, .025); this.display.add(hinge);
    }

    // Internal assemblies are deliberately simplified to explain relationships.
    this.board = this.assembly('Logic board', [0, .028, -1.12], [0, .24, -.15]);
    this.box(this.board, [3.00, .08, 1.52], [0, 0, 0], 'board', { radius: .07, outline: true });
    const chip = new THREE.Group(); chip.userData.partId = 'chip'; this.parts.chip = chip; this.board.add(chip);
    this.box(chip, [1.0, .075, 1.0], [0, .076, -.03], 'chip', { radius: .04, outline: true });
    this.chipTexture = this.makeLabelTexture('APPLE', 'SILICON');
    const chipFace = new THREE.Mesh(this.own(new THREE.PlaneGeometry(.84, .84)), this.own(new THREE.MeshBasicMaterial({ map: this.chipTexture, transparent: true, depthWrite: false, toneMapped: false })));
    chipFace.rotation.x = -Math.PI / 2; chipFace.position.set(0, .115, -.03); chip.add(chipFace);
    for (const x of [-.99, .99]) for (let n = 0; n < 3; n++) this.box(chip, [.33, .06, .26], [x, .077, -.45 + n * .39], 'keys', { radius: .025, outline: true });
    const traceMaterial = this.own(new THREE.LineBasicMaterial({ color: 0xb1c8c0, transparent: true, opacity: .55 }));
    traceMaterial.userData.role = 'wire'; this.materials.push(traceMaterial);
    for (const sign of [-1, 1]) for (let n = 0; n < 5; n++) {
      const z = -.35 + n * .16;
      const geometry = this.own(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sign * .53, .049, z), new THREE.Vector3(sign * .7, .049, z), new THREE.Vector3(sign * .76, .049, z + .06), new THREE.Vector3(sign * 1.45, .049, z + .06)]));
      this.board.add(new THREE.Line(geometry, traceMaterial));
    }
    this.battery = this.assembly('Battery cells', [0, .025, .79], [0, .10, .1], 'power');
    for (const x of [-2.04, 0, 2.04]) {
      this.box(this.battery, [1.83, .12, 1.92], [x, 0, .04], 'battery', { radius: .07, outline: true });
      this.box(this.battery, [1.49, .01, .052], [x, .064, -.66], 'metal', { radius: .003 });
      for (let n = 0; n < 3; n++) this.box(this.battery, [1.25 - n * .17, .008, .026], [x, .064, .62 + n * .12], 'fan', { radius: .002 });
    }
    this.cooling = this.assembly('Cooling assembly', [0, .075, -1.19], [0, .36, -.05], 'cooling');
    this.fanRotors = [];
    for (const x of [-2.33, 2.33]) {
      const housing = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.64, .64, .12, 48)), this.material('fan', { metalness: .48, roughness: .47 }));
      housing.position.set(x, 0, 0); this.cooling.add(housing); this.outline(housing, housing.geometry);
      const rotor = new THREE.Group(); rotor.position.set(x, .075, 0); this.cooling.add(rotor); this.fanRotors.push(rotor);
      const hub = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.145, .145, .04, 24)), this.material('metal'));
      rotor.add(hub);
      const bladeGeo = this.own(new THREE.BoxGeometry(.34, .024, .045));
      const bladeMat = this.material('metal', { metalness: .65, roughness: .36 });
      for (let n = 0; n < 21; n++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        const angle = n / 21 * Math.PI * 2;
        blade.position.set(Math.cos(angle) * .335, 0, Math.sin(angle) * .335);
        blade.rotation.y = -angle + .45;
        rotor.add(blade);
      }
      for (let n = 0; n < 13; n++) this.box(this.cooling, [.022, .09, .26], [x - .54 + n * .09, -.004, -.67], 'metal', { radius: .001 });
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .045, 0), new THREE.Vector3(x * .39, .045, -.2), new THREE.Vector3(x * .66, .045, -.34), new THREE.Vector3(x, .045, -.51)]);
      const pipe = new THREE.Mesh(this.own(new THREE.TubeGeometry(curve, 24, .047, 8, false)), this.material('metal', { metalness: .68, roughness: .34 }));
      this.cooling.add(pipe);
    }
    // Drawing guides appear only while assemblies are separated.
    const guideGeometry = this.own(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3, -.61, 1.96), new THREE.Vector3(-3, 1.3, 1.96),
      new THREE.Vector3(3, -.61, 1.96), new THREE.Vector3(3, 1.3, 1.96),
      new THREE.Vector3(-3, -.61, -1.8), new THREE.Vector3(-3, 1.3, -1.8),
      new THREE.Vector3(3, -.61, -1.8), new THREE.Vector3(3, 1.3, -1.8)
    ]));
    this.guides = new THREE.LineSegments(guideGeometry, this.own(new THREE.LineDashedMaterial({ color: 0xd9eeff, dashSize: .045, gapSize: .07, transparent: true, opacity: 0, depthWrite: false })));
    this.guides.computeLineDistances(); this.guides.raycast = () => {}; this.model.add(this.guides);
    this.grid = new THREE.GridHelper(18, 36, 0xffffff, 0xffffff);
    this.grid.position.y = -.92;
    this.grid.material.transparent = true; this.grid.material.opacity = .1; this.grid.material.depthWrite = false;
    this.own(this.grid.geometry); this.own(this.grid.material); this.grid.raycast = () => {}; this.scene.add(this.grid);
    // Soft contact shadow, independent of GPU shadow-map support.
    const shadowCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (shadowCanvas) shadowCanvas.width = shadowCanvas.height = 128;
    const shadowCtx = shadowCanvas?.getContext('2d');
    if (shadowCtx) {
      const gradient = shadowCtx.createRadialGradient(64, 64, 5, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(0,0,0,.24)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0, 0, 128, 128);
      const shadowTexture = this.own(new THREE.CanvasTexture(shadowCanvas));
      this.shadow = new THREE.Mesh(this.own(new THREE.PlaneGeometry(12, 8)), this.own(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })));
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -.91; this.shadow.raycast = () => {}; this.scene.add(this.shadow);
    }
  }

  // A material can be shared by many blades or keys, but never by separate
  // selectable assemblies: highlighting one part must not recolor another.
  scopePartMaterials() {
    const owners = new Map();
    this.model.traverse(object => {
      const material = object.material;
      if (!material?.isMeshStandardMaterial) return;
      const owner = this.partFor(object) || 'enclosure';
      let byOwner = owners.get(material);
      if (!byOwner) { byOwner = new Map([[owner, material]]); owners.set(material, byOwner); }
      if (!byOwner.has(owner)) {
        const scoped = this.own(material.clone());
        this.materials.push(scoped); byOwner.set(owner, scoped);
      }
      object.material = byOwner.get(owner);
    });
  }

  buildPins() {
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'object-viewer__pins';
    this.pinLayer.setAttribute('role', 'group');
    this.pinLayer.setAttribute('aria-label', `Explore the ${this.spec.name} components`);
    const ns = 'http://www.w3.org/2000/svg';
    this.pinLeaders = document.createElementNS(ns, 'svg');
    this.pinLeaders.classList.add('object-viewer__leaders');
    this.pinLeaders.setAttribute('aria-hidden', 'true');
    this.pinLayer.append(this.pinLeaders);
    this.pins = Object.entries(this.spec.parts).map(([id, label], index) => {
      const button = document.createElement('button');
      button.className = 'object-viewer__pin'; button.type = 'button';
      button.dataset.part = id;
      button.setAttribute('aria-label', `Explore ${label}`);
      button.setAttribute('aria-pressed', String(this.selected === id));
      const number = document.createElement('span'); number.className = 'object-viewer__pin-number'; number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span'); name.textContent = this.spec.labels[id];
      button.append(number, name); this.pinLayer.append(button);
      const line = document.createElementNS(ns, 'path'); line.setAttribute('fill', 'none');
      const dot = document.createElementNS(ns, 'circle'); dot.setAttribute('r', '2.3');
      this.pinLeaders.append(line, dot);
      this.listen(button, 'click', () => {
        this.setAutoRotate(false); this.select(id); this.options.onSelect?.(id);
      });
      this.listen(button, 'focus', () => { if (this.autoRotate) this.setAutoRotate(false); });
      return { id, button, line, dot, point: new THREE.Vector3(...this.spec.pins[id].point) };
    });
    this.root.append(this.pinLayer);
  }

  updatePins() {
    if (!this.pins) return;
    const width = this.root.clientWidth, height = this.root.clientHeight;
    if (!width || !height) return;
    this.pinLeaders.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.model.updateMatrixWorld(true); this.camera.updateMatrixWorld();
    const placed = [];
    const candidates = this.pins.map(pin => {
      const projected = this.parts[pin.id].localToWorld(pin.point.clone()).project(this.camera);
      const anchorX = (projected.x + 1) * width / 2;
      const anchorY = (1 - projected.y) * height / 2;
      const spec = this.spec.pins[pin.id];
      const hidden = (spec.internal && this.explodeProgress < .36 && !(this.objectId === 'generated' && this.selected === pin.id)) || projected.z < -1 || projected.z > 1 || anchorX < -10 || anchorX > width + 10 || anchorY < -10 || anchorY > height + 10;
      pin.button.hidden = hidden; pin.line.style.display = hidden ? 'none' : ''; pin.dot.style.display = hidden ? 'none' : '';
      return { ...pin, spec, hidden, anchorX, anchorY };
    }).filter(pin => !pin.hidden).sort((a, b) => a.anchorY - b.anchorY);
    for (const pin of candidates) {
      const w = pin.button.offsetWidth || 100, h = pin.button.offsetHeight || 34;
      const x = THREE.MathUtils.clamp(pin.anchorX + pin.spec.offset[0], 12, Math.max(12, width - w - 12));
      let y = THREE.MathUtils.clamp(pin.anchorY + pin.spec.offset[1], 56, Math.max(56, height - h - 38));
      const overlaps = atY => placed.some(other => x < other.x + other.w + 8 && x + w + 8 > other.x && atY < other.y + other.h + 8 && atY + h + 8 > other.y);
      // Try nearby rows before accepting an overlap at extremely small sizes.
      for (let step = 1; overlaps(y) && step <= 10; step++) {
        y = THREE.MathUtils.clamp(pin.anchorY + pin.spec.offset[1] + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * (h + 8), 56, Math.max(56, height - h - 38));
      }
      placed.push({ x, y, w, h });
      pin.button.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      const edgeX = THREE.MathUtils.clamp(pin.anchorX, x, x + w);
      const edgeY = THREE.MathUtils.clamp(pin.anchorY, y, y + h);
      pin.line.setAttribute('d', `M ${pin.anchorX.toFixed(1)} ${pin.anchorY.toFixed(1)} L ${edgeX.toFixed(1)} ${edgeY.toFixed(1)}`);
      pin.dot.setAttribute('cx', pin.anchorX.toFixed(1)); pin.dot.setAttribute('cy', pin.anchorY.toFixed(1));
      const active = this.selected === pin.id;
      pin.line.classList.toggle('is-selected', active); pin.dot.classList.toggle('is-selected', active);
      pin.button.setAttribute('aria-pressed', String(active));
    }
  }

  makeScreenTexture() {
    if (typeof document === 'undefined') return this.own(new THREE.Texture());
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 720;
    this.screenCanvas = canvas;
    const texture = this.own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
    this.drawScreen(); return texture;
  }

  drawScreen() {
    const ctx = this.screenCanvas?.getContext('2d'); if (!ctx) return;
    const isBlue = this.theme === 'blueprint';
    ctx.fillStyle = isBlue ? '#0c3eaa' : '#101c25'; ctx.fillRect(0, 0, 1200, 720);
    const glow = ctx.createRadialGradient(850, 170, 20, 700, 350, 650);
    glow.addColorStop(0, isBlue ? '#538dec' : '#345963'); glow.addColorStop(1, isBlue ? '#1239a0' : '#182331');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 720);
    ctx.lineWidth = 1.25;
    for (let n = 0; n < 34; n++) {
      ctx.strokeStyle = isBlue ? `rgba(219,241,255,${.10 + n / 130})` : `rgba(178,225,216,${.08 + n / 165})`;
      ctx.beginPath();
      ctx.moveTo(-150, 750 - n * 14);
      ctx.bezierCurveTo(100, 700 - n * 19, 650, 90 + n * 8, 1370, -100 + n * 21);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = '500 21px sans-serif'; ctx.fillText('U N F O L D', 54, 67);
    this.screenTexture && (this.screenTexture.needsUpdate = true);
  }

  makeLabelTexture(line1, line2) {
    if (typeof document === 'undefined') return this.own(new THREE.Texture());
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, 256, 256); ctx.textAlign = 'center'; ctx.fillStyle = '#e9f0fa'; ctx.font = '500 23px sans-serif'; ctx.fillText(line1, 128, 118); ctx.font = '500 27px sans-serif'; ctx.fillText(line2, 128, 152); }
    const texture = this.own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  setTheme(theme) {
    if (!THEMES[theme] || this.disposed) return;
    this.theme = theme; this.root.dataset.theme = theme;
    const palette = THEMES[theme];
    for (const material of this.materials) {
      material.color.setHex(palette[material.userData.role] ?? palette.shell);
      if (material.isLineBasicMaterial) material.opacity = theme === 'blueprint' ? .62 : .25;
      if (material.isMeshStandardMaterial) {
        material.metalness = theme === 'blueprint' ? .15 : (material.userData.role === 'shell' || material.userData.role === 'deck' ? .58 : .3);
        material.emissive.setHex(0x000000); material.emissiveIntensity = 0;
      }
    }
    if (this.grid) { this.grid.material.color.setHex(palette.grid); this.grid.material.opacity = theme === 'blueprint' ? .13 : theme === 'paper' ? .08 : .065; }
    if (this.guides) this.guides.material.color.setHex(palette.wire);
    this.drawScreen(); this.applySelection(); this.dirty = true;
  }

  select(id) {
    if (this.disposed) return;
    this.selected = Object.hasOwn(this.spec.parts, id) ? id : null;
    this.applySelection();
    if (this.status) this.status.textContent = this.selected ? `${this.spec.parts[this.selected]} selected.` : '';
    this.dirty = true;
  }

  applySelection() {
    if (!this.model) return;
    const palette = THEMES[this.theme];
    this.model.traverse(object => {
      if (!object.material?.isMeshStandardMaterial) return;
      const selected = this.selected && this.partFor(object) === this.selected;
      object.material.color.setHex(palette[object.material.userData.role] ?? palette.shell);
      if (selected) object.material.color.lerp(new THREE.Color(palette.selected), .40);
      object.material.emissive.setHex(selected ? palette.emissive : 0x000000);
      object.material.emissiveIntensity = selected ? (this.theme === 'blueprint' ? .68 : .48) : 0;
    });
    for (const pin of this.pins || []) pin.button.setAttribute('aria-pressed', String(pin.id === this.selected));
    applyObjectActivity(this);
    if (this.objectId === 'generated') updateGeneratedModel(this);
  }

  setExploded(value) {
    this.setSeparation(value ? 1 : 0);
    if (this.disposed) return;
    this.status.textContent = this.exploded ? 'Assemblies separated. Internal components are revealed.' : `${this.spec.name} reassembled.`;
  }

  setSeparation(value) {
    if (this.disposed || !Number.isFinite(Number(value))) return;
    this.separation = THREE.MathUtils.clamp(Number(value), 0, 1);
    this.exploded = this.separation > .02;
    if (this.reducedMotion) { this.explodeProgress = this.separation; this.applyExplosion(); }
    this.options.onSeparationChange?.(this.separation);
    this.dirty = true;
  }

  applyExplosion() {
    if (!this.model) return;
    const progress = this.explodeProgress;
    for (const group of this.model.children) if (group.userData.base) {
      group.position.copy(group.userData.base).addScaledVector(group.userData.offset, progress);
    }
    if (this.guides) {
      this.guides.material.opacity = progress * (this.theme === 'blueprint' ? .4 : .22);
      this.guides.visible = progress > .02;
    }
    if (this.objectId === 'macbook') {
      const guides = this.guides.geometry.attributes.position;
      let guideIndex = 0;
      for (const z of [1.96, -1.8]) for (const x of [-3, 3]) {
        guides.setXYZ(guideIndex++, x, this.bottom.position.y + .12, z);
        guides.setXYZ(guideIndex++, x + this.deck.position.x, this.deck.position.y - .06, z + this.deck.position.z);
      }
      guides.needsUpdate = true; this.guides.computeLineDistances();
    } else if (this.objectId === 'generated') updateGeneratedModel(this, progress);
    else applyObjectSeparation(this, progress);
    // Preserve the user's orbit and zoom as each model expands around its center.
    const target = new THREE.Vector3(...this.spec.target).addScaledVector(new THREE.Vector3(...this.spec.targetOffset), progress);
    this.camera.position.add(target.clone().sub(this.controls.target));
    this.controls.target.copy(target);
    const scale = 1 + progress * this.spec.expansion;
    const cameraOffset = this.camera.position.clone().sub(this.controls.target);
    cameraOffset.multiplyScalar(scale / (this.explodeCameraScale || 1));
    this.camera.position.copy(this.controls.target).add(cameraOffset);
    this.explodeCameraScale = scale;
    this.dirty = true;
  }

  setAutoRotate(value) {
    if (this.disposed) return;
    // An explicit press can opt into motion, even when the system requests less.
    this.autoRotate = Boolean(value);
    if (this.controls) this.controls.autoRotate = this.autoRotate;
    this.options.onAutoRotateChange?.(this.autoRotate);
    this.dirty = true;
  }

  setActivity(value) {
    if (this.disposed || !Number.isFinite(Number(value))) return;
    this.activity = THREE.MathUtils.clamp(Number(value), 0, 1);
    applyObjectActivity(this);
    this.options.onActivityChange?.(this.activity);
    this.dirty = true;
  }

  setActive(value) { this.active = Boolean(value); this.dirty = true; }

  setView(view = 'perspective') {
    if (this.disposed || !this.controls) return;
    if (!['perspective', 'top', 'front'].includes(view)) return;
    this.setAutoRotate(false);
    // Finish any residual orbit damping before applying an exact preset.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update();
    const scale = 1 + this.explodeProgress * this.spec.expansion;
    const target = new THREE.Vector3(...this.spec.target).addScaledVector(new THREE.Vector3(...this.spec.targetOffset), this.explodeProgress);
    const direction = view === 'top' ? new THREE.Vector3(0, 1, .0015) : view === 'front' ? new THREE.Vector3(0, .045, 1) : this.homePosition.clone().sub(this.homeTarget);
    const distance = this.homePosition.distanceTo(this.homeTarget) * scale;
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(direction.normalize().multiplyScalar(distance));
    this.explodeCameraScale = scale;
    this.controls.update(); this.controls.enableDamping = damping;
    this.view = view;
    this.dirty = true;
    this.status.textContent = `${view[0].toUpperCase() + view.slice(1)} view.`;
  }

  zoomBy(factor) {
    if (this.disposed || !this.controls || !Number.isFinite(factor) || factor <= 0) return;
    this.setAutoRotate(false);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update(); this.dirty = true;
  }

  pressTrackpad() {
    if (this.disposed || !this.trackpadPulse) return;
    this.setAutoRotate(false);
    this.trackpadPulseStarted = performance.now();
    this.trackpadPulse.visible = true;
    this.dirty = true;
    this.status.textContent = 'A short vibration creates the sensation of a click. The trackpad does not need a mechanical button.';
  }

  updateTrackpadPulse(time) {
    if (!this.trackpadPulse?.visible) return false;
    const progress = Math.min(1, (time - this.trackpadPulseStarted) / 650);
    // Exaggerated teaching motion; reduced-motion uses a steady ring instead.
    this.parts.trackpad.position.y = this.reducedMotion ? 0 : -Math.sin(progress * Math.PI * 14) * Math.exp(-progress * 5) * .035;
    this.trackpadPulse.scale.setScalar(this.reducedMotion ? 3 : 1 + progress * 4);
    this.trackpadPulse.material.color.setHex(this.theme === 'paper' ? 0x1c477e : 0xffffff);
    this.trackpadPulse.material.opacity = this.reducedMotion ? .75 : .85 * (1 - progress);
    if (progress >= 1) { this.trackpadPulse.visible = false; this.parts.trackpad.position.y = 0; }
    this.dirty = true;
    return progress < 1;
  }

  reset() {
    if (this.disposed || !this.controls) return;
    this.setView('perspective');
    this.controls.update(); this.applyExplosion(); this.dirty = true;
    this.status.textContent = 'View reset.';
  }

  getState() { return { theme: this.theme, selected: this.selected, exploded: this.exploded, separation: this.separation, separationProgress: this.explodeProgress, view: this.view, autoRotate: this.autoRotate, ready: this.ready && !this.failed, reducedMotion: this.reducedMotion, objectId: this.objectId, activity: this.activity, parts: Object.keys(this.spec.parts) }; }

  listen(target, event, callback, options) { target.addEventListener(event, callback, options); this.listeners.push(() => target.removeEventListener(event, callback, options)); }

  bindEvents() {
    const canvas = this.renderer.domElement;
    this.listen(this.controls, 'change', () => { this.dirty = true; });
    this.listen(canvas, 'pointerdown', event => {
      if (event.button !== 0) return;
      this.down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, time: performance.now() };
      this.dragged = false;
      this.hideTooltip();
    });
    this.listen(canvas, 'pointermove', event => {
      if (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 5) {
        this.dragged = true; if (this.autoRotate) this.setAutoRotate(false);
      }
      if (event.pointerType === 'touch' || this.down) return;
      const id = this.hitPart(event);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      if (!id) return this.hideTooltip();
      const rect = this.root.getBoundingClientRect();
      this.tooltip.textContent = this.spec.parts[id];
      this.tooltip.style.transform = `translate(${Math.min(event.clientX - rect.left + 14, rect.width - 128)}px,${Math.max(8, event.clientY - rect.top - 38)}px)`;
      this.tooltip.dataset.visible = 'true';
    });
    this.listen(canvas, 'pointerup', event => {
      const down = this.down; this.down = null;
      if (!down || down.pointerId !== event.pointerId || this.dragged || performance.now() - down.time > 900) return;
      const id = this.hitPart(event);
      if (id) { this.select(id); this.options.onSelect?.(id); }
    });
    this.listen(canvas, 'pointercancel', () => { this.down = null; this.hideTooltip(); });
    this.listen(canvas, 'pointerleave', () => { this.hideTooltip(); });
    this.listen(canvas, 'wheel', () => { if (this.autoRotate) this.setAutoRotate(false); }, { passive: true });
    this.listen(canvas, 'keydown', event => this.onKey(event));
    this.listen(canvas, 'webglcontextlost', event => { event.preventDefault(); this.fail(new Error('The 3D graphics context was interrupted.')); });
    this.listen(document, 'visibilitychange', () => { this.visible = !document.hidden; this.dirty = true; });
    if (this.media?.addEventListener) this.listen(this.media, 'change', event => {
      this.reducedMotion = event.matches;
      if (this.reducedMotion) { this.setAutoRotate(false); this.explodeProgress = this.separation; this.applyExplosion(); }
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.root);
    } else this.listen(window, 'resize', () => this.resize());
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(entries => { this.inViewport = entries[0]?.isIntersecting !== false; this.dirty = true; });
      this.intersectionObserver.observe(this.root);
    }
  }

  hideTooltip() { this.tooltip.dataset.visible = 'false'; }

  hitPart(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // The nearest solid surface wins, so hidden internal parts cannot be clicked
    // through the case. Drawing lines and guides do not intercept the pointer.
    const intersection = this.raycaster.intersectObject(this.model, true).find(hit => hit.object.isMesh && hit.object.visible);
    return intersection ? this.partFor(intersection.object) : null;
  }

  partFor(object) { for (let item = object; item; item = item.parent) if (item.userData.partId) return item.userData.partId; return null; }

  onKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (this.autoRotate) this.setAutoRotate(false);
    if (event.key === 'Home') return this.reset();
    if (event.key === 'Escape') { this.select(null); this.options.onSelect?.(null); return; }
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const step = event.shiftKey ? .24 : .10;
    if (event.key === 'ArrowLeft') spherical.theta -= step;
    if (event.key === 'ArrowRight') spherical.theta += step;
    if (event.key === 'ArrowUp') spherical.phi = Math.max(this.controls.minPolarAngle, spherical.phi - step);
    if (event.key === 'ArrowDown') spherical.phi = Math.min(this.controls.maxPolarAngle, spherical.phi + step);
    if (event.key === '+' || event.key === '=') spherical.radius = Math.max(this.controls.minDistance, spherical.radius * .9);
    if (event.key === '-' || event.key === '_') spherical.radius = Math.min(this.controls.maxDistance, spherical.radius / .9);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update(); this.dirty = true;
  }

  resize() {
    if (this.disposed || this.failed || !this.renderer) return;
    const width = Math.max(this.root.clientWidth, 1);
    const height = Math.max(this.root.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(34) / 2) * Math.max(1, (this.spec.frameWidth || 1.12) / this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.dirty = true;
  }

  tick(time) {
    if (this.disposed || this.failed) return;
    this.frame = requestAnimationFrame(next => this.tick(next));
    const dt = Math.min((time - this.lastTime) / 1000, .05); this.lastTime = time;
    if (!this.active || !this.visible || this.inViewport === false) return;
    const target = this.separation;
    const moving = Math.abs(this.explodeProgress - target) > .0005;
    if (moving) {
      this.explodeProgress = this.reducedMotion ? target : THREE.MathUtils.damp(this.explodeProgress, target, 5, dt);
      if (Math.abs(this.explodeProgress - target) < .001) this.explodeProgress = target;
      this.applyExplosion();
    }
    if (this.selected === 'cooling' && this.explodeProgress > .4 && !this.reducedMotion) {
      for (const fan of this.fanRotors || []) fan.rotation.y += dt * 1.3;
      this.dirty = true;
    }
    if (animateObject(this, dt)) this.dirty = true;
    this.updateTrackpadPulse(time);
    this.controls.update(dt);
    if (this.dirty || this.autoRotate || moving) {
      try { this.renderer.render(this.scene, this.camera); this.updatePins(); this.dirty = false; }
      catch (error) { this.fail(error); }
    }
  }

  fail(error) {
    if (this.failed || this.disposed) return;
    this.failed = true; this.ready = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    queueMicrotask(() => { if (!this.disposed) this.options.onError?.(error); });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
    for (const remove of this.listeners) remove();
    this.controls?.dispose();
    for (const resource of this.resources) resource.dispose?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.root.remove(); this.resources.clear();
  }
}

/** Construct geometry without WebGL; also used by automated assembly checks. */
export function createObjectModel(objectId = 'macbook', theme = 'blueprint', blueprint = null) {
  const builder = Object.create(ObjectViewer.prototype);
  builder.objectId = objectId === 'generated' ? 'generated' : OBJECT_SPECS[objectId] ? objectId : 'macbook';
  builder.spec = builder.objectId === 'generated' ? generatedSpec(blueprint) : OBJECT_SPECS[builder.objectId];
  builder.activity = builder.objectId === 'lamp' ? .7 : 0;
  builder.theme = THEMES[theme] ? theme : 'blueprint';
  builder.resources = new Set(); builder.materials = []; builder.parts = {};
  builder.scene = new THREE.Scene(); builder.model = new THREE.Group(); builder.scene.add(builder.model);
  if (builder.objectId === 'macbook') builder.buildModel();
  else if (builder.objectId === 'generated') buildGeneratedModel(builder, blueprint);
  else buildAdditionalModel(builder, builder.objectId);
  builder.scopePartMaterials();
  const palette = THEMES[builder.theme];
  for (const material of builder.materials) material.color.setHex(palette[material.userData.role] ?? palette.shell);
  applyObjectActivity(builder);
  if (builder.objectId === 'generated') updateGeneratedModel(builder);
  builder.model.updateMatrixWorld(true);
  return {
    group: builder.model,
    scene: builder.scene,
    parts: builder.parts,
    builder,
    assemblies: Object.fromEntries(builder.model.children.filter(group => group.userData.base).map(group => [group.name, group])),
    setSeparation(progress) {
      const value = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
      builder.explodeProgress = value;
      for (const group of builder.model.children) if (group.userData.base) group.position.copy(group.userData.base).addScaledVector(group.userData.offset, value);
      if (builder.objectId === 'generated') updateGeneratedModel(builder, value);
      else applyObjectSeparation(builder, value);
      builder.model.updateMatrixWorld(true);
    },
    dispose() { for (const resource of builder.resources) resource.dispose?.(); builder.resources.clear(); }
  };
}
export function createLaptopModel(theme = 'blueprint') { return createObjectModel('macbook', theme); }
