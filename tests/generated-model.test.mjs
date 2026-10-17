import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Match the browser's vendored import map without installing another Three copy.
const threeURL = new URL('../public/vendor/three.module.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'three' ? { url: threeURL, shortCircuit: true } : nextResolve(specifier, context);
} });
const THREE = await import(threeURL);
const { createObjectModel } = await import('../public/viewer.js');

const part = (id, shape, patch = {}) => ({
  id, label: `${id} component`, description: 'A simplified component.',
  principle: 'Transfers a load through the assembly.', construction: 'A conceptual manufactured part.',
  observed: true, shape, size: [1.4, .6, .8], position: [0, 0, 0], rotation: [0, 0, 0], explode: [0, 1, 0], ...patch
});
const sample = () => ({
  version: 1, title: 'Photo-derived lamp', summary: 'A simplified interpretation of the pictured lamp.',
  parts: [
    part('base', 'cylinder', { size: [2, .25, 2], position: [0, -.5, 0], explode: [0, -.7, 0] }),
    part('arm', 'box', { size: [.18, 2, .18], position: [0, .55, 0], rotation: [0, 0, -18], explode: [-.6, 0, 0] }),
    part('shade', 'cone', { size: [1.1, .7, 1.1], position: [.55, 1.7, 0], explode: [.5, .8, 0] }),
    part('bulb', 'sphere', { size: [.5, .6, .5], position: [.55, 1.5, 0], explode: [0, 0, 1.2], observed: false }),
    part('ring', 'torus', { size: [.9, .9, .08], position: [.55, 1.3, 0], rotation: [90, 0, 0], explode: [0, 0, -.8] })
  ],
  connections: [{ from: 'base', to: 'arm', label: 'Supports' }, { from: 'arm', to: 'shade', label: 'Positions' }, { from: 'shade', to: 'bulb', label: 'Houses' }]
});

const near = (actual, expected, epsilon = 1e-5) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

test('all five primitive shapes preserve full dimensions and register selectable parts', () => {
  const input = sample(), model = createObjectModel('generated', 'blueprint', input);
  assert.deepEqual(Object.keys(model.parts), input.parts.map(p => p.id));
  assert.deepEqual(Object.keys(model.builder.spec.pins), input.parts.map(p => p.id));
  for (const data of input.parts) {
    const group = model.parts[data.id], mesh = group.children[0];
    assert.equal(model.builder.partFor(mesh), data.id);
    assert.equal(model.builder.partFor(mesh.children[0]), data.id);
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).toArray();
    size.forEach((value, axis) => near(value, data.size[axis]));
    assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));
    assert.equal(group.userData.observed, data.observed);
    assert.equal(mesh.children[0].material.isLineDashedMaterial === true, !data.observed);
  }
  const armRotation = new THREE.Euler().setFromQuaternion(model.parts.arm.quaternion, 'XYZ');
  near(THREE.MathUtils.radToDeg(armRotation.z), -18);
  model.dispose();
});

test('separation follows generated offsets; guides connect the current component centers', () => {
  const input = sample(), model = createObjectModel('generated', 'blueprint', input);
  const lineBuffer = model.builder.generatedConnections[0].line.geometry.attributes.lineDistance;
  for (const progress of [0, .5, 1, 0]) {
    model.setSeparation(progress);
    for (const data of input.parts) model.parts[data.id].position.toArray().forEach((value, axis) => near(value, data.position[axis] + data.explode[axis] * progress));
    for (const { from, to, line } of model.builder.generatedConnections) {
      assert.equal(line.visible, progress > .02);
      const positions = line.geometry.attributes.position;
      for (const [index, id] of [[0, from], [1, to]]) {
        const vector = new THREE.Vector3().fromBufferAttribute(positions, index);
        near(vector.distanceTo(model.parts[id].position), 0);
      }
    }
  }
  assert.equal(model.builder.generatedConnections[0].line.geometry.attributes.lineDistance, lineBuffer);
  model.dispose();
});

test('selection highlights only its component and reveals its connection guides when assembled', () => {
  const model = createObjectModel('generated', 'blueprint', sample());
  model.builder.select('arm');
  for (const [id, group] of Object.entries(model.parts)) assert.equal(group.children[0].material.emissiveIntensity > 0, id === 'arm');
  for (const connection of model.builder.generatedConnections) assert.equal(connection.line.visible, connection.from === 'arm' || connection.to === 'arm');
  model.builder.select('toString');
  assert.equal(model.builder.selected, null);
  model.builder.select('bulb');
  near(model.parts.bulb.children[0].material.opacity, .88);
  assert.ok(model.parts.base.children[0].material.opacity < .88);
  model.dispose();
});

test('framing contains assembled and exploded bounds for wide, tall, rotated and extreme valid shapes', () => {
  for (const dimensions of [[6, .08, .08], [.08, 6, .08], [6, 6, 6], [.08, .08, .08]]) {
    const input = sample();
    input.parts = [part('one', 'box', { size: dimensions, position: [-4, 4, -4], rotation: [45, 70, 20], explode: [-3, 3, -3] }), part('two', 'sphere', { size: dimensions, position: [4, -4, 4], explode: [3, -3, 3] })];
    input.connections = [{ from: 'one', to: 'two', label: 'Linked' }];
    const model = createObjectModel('generated', 'blueprint', input), spec = model.builder.spec;
    for (const progress of [0, 1]) {
      model.setSeparation(progress);
      const target = new THREE.Vector3(...spec.target).addScaledVector(new THREE.Vector3(...spec.targetOffset), progress);
      const distance = new THREE.Vector3(...spec.camera).distanceTo(new THREE.Vector3(...spec.target)) * (1 + progress * spec.expansion);
      for (const direction of [[.9, .65, 1.25], [0, 1, .0015], [0, .045, 1]]) {
        const camera = new THREE.PerspectiveCamera(34, 1.12, .02, spec.farPlane);
        camera.position.copy(target).addScaledVector(new THREE.Vector3(...direction).normalize(), distance);
        camera.lookAt(target); camera.updateMatrixWorld();
        const bounds = new THREE.Box3().setFromObject(model.group);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(projected.toArray().every(Number.isFinite));
          assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1, `clipped ${dimensions}/${progress}/${direction}`);
        }
      }
    }
    model.dispose();
  }
});

test('invalid output is rejected before building; input cannot mutate a built model', () => {
  assert.throws(() => createObjectModel('generated'), /Invalid blueprint/);
  const input = sample(); input.parts[0].shape = 'script';
  assert.throws(() => createObjectModel('generated', 'blueprint', input), /Invalid blueprint/);
  const valid = sample(), model = createObjectModel('generated', 'blueprint', valid);
  valid.parts[0].position[0] = 9999; valid.parts[0].explode[0] = 9999;
  model.setSeparation(1);
  near(model.parts.base.position.x, 0);
  model.dispose();
});

test('all generated geometry and material resources are disposed once', () => {
  const model = createObjectModel('generated', 'paper', sample());
  const resources = [...model.builder.resources], counts = new Map();
  assert.ok(resources.length > 20);
  for (const resource of resources) {
    assert.equal(typeof resource.dispose, 'function');
    resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
  }
  model.dispose(); model.dispose();
  assert.equal(model.builder.resources.size, 0);
  for (const resource of resources) assert.equal(counts.get(resource), 1);
});

test('existing MacBook, lamp and drill models retain geometry and selectable parts', () => {
  for (const [id, count] of [['macbook', 5], ['lamp', 4], ['drill', 4]]) {
    const model = createObjectModel(id);
    assert.equal(Object.keys(model.parts).length, count);
    model.setSeparation(1); model.setSeparation(0);
    const bounds = new THREE.Box3().setFromObject(model.group);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    model.dispose();
  }
});
