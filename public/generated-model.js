/** Bounded teaching geometry from Gemma's structured photo interpretation. */
import * as THREE from 'three';
import { validateBlueprint } from './blueprint-schema.mjs';

const radians = values => values.map(THREE.MathUtils.degToRad);

function partBounds(part, separated = false) {
  const half = new THREE.Vector3(...part.size).multiplyScalar(.5);
  const position = new THREE.Vector3(...part.position);
  if (separated) position.add(new THREE.Vector3(...part.explode));
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...radians(part.rotation), 'XYZ'));
  return new THREE.Box3(half.clone().negate(), half).applyMatrix4(new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1)));
}

export function generatedSpec(input) {
  const blueprint = validateBlueprint(input);
  const assembled = new THREE.Box3(), separated = new THREE.Box3();
  for (const part of blueprint.parts) {
    assembled.union(partBounds(part));
    separated.union(partBounds(part, true));
  }
  const target = assembled.getCenter(new THREE.Vector3());
  const targetOffset = separated.getCenter(new THREE.Vector3()).sub(target);
  const radius = Math.max(.2, assembled.getSize(new THREE.Vector3()).length() / 2);
  const separatedRadius = Math.max(radius, separated.getSize(new THREE.Vector3()).length() / 2);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(17)) * 1.1;
  const direction = new THREE.Vector3(.9, .65, 1.25).normalize();
  const parts = Object.fromEntries(blueprint.parts.map(part => [part.id, part.label]));
  const labels = Object.fromEntries(blueprint.parts.map(part => [part.id, part.label.length > 27 ? `${part.label.slice(0, 26)}…` : part.label]));
  const pins = Object.fromEntries(blueprint.parts.map((part, index) => [part.id, {
    point: [0, part.size[1] * .3, part.size[2] * .36],
    offset: [part.position[0] < target.x || (part.position[0] === target.x && index % 2 === 0) ? -130 : 30, index % 2 ? 24 : -36],
    internal: !part.observed
  }]));
  return {
    name: blueprint.title, parts, labels, pins, frameWidth: 1.12,
    target: target.toArray(), targetOffset: targetOffset.toArray(),
    camera: target.clone().addScaledVector(direction, distance).toArray(),
    expansion: separatedRadius / radius - 1,
    minDistance: Math.max(.3, radius * .85), maxDistance: Math.max(8, distance * separatedRadius / radius * 2.8),
    farPlane: Math.max(80, distance * separatedRadius / radius * 4 + separatedRadius),
    floor: Math.min(assembled.min.y, separated.min.y) - radius * .08,
    gridSize: Math.max(4, radius * 4.4), assembledBounds: assembled, separatedBounds: separated
  };
}

function primitive(part) {
  let geometry;
  switch (part.shape) {
    case 'box': geometry = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cylinder': geometry = new THREE.CylinderGeometry(.5, .5, 1, 32); break;
    case 'sphere': geometry = new THREE.SphereGeometry(.5, 24, 16); break;
    case 'torus': geometry = new THREE.TorusGeometry(.36, .14, 12, 40); break;
    case 'cone': geometry = new THREE.ConeGeometry(.5, 1, 32); break;
    default: throw new RangeError('Unsupported blueprint shape.');
  }
  // Every shape follows the same full local X/Y/Z dimensions. The torus hole
  // points along local Z; cylinder and cone axes point along local Y.
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(part.size[0] / size.x, part.size[1] / size.y, part.size[2] / size.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildGeneratedModel(builder, input) {
  const blueprint = validateBlueprint(input);
  builder.blueprint = blueprint;
  builder.generatedMeshes = [];
  for (const [index, part] of blueprint.parts.entries()) {
    const group = builder.assembly(part.label, part.position, part.explode, part.id);
    group.rotation.set(...radians(part.rotation), 'XYZ');
    group.userData.observed = part.observed;
    const material = builder.material(part.observed ? (index % 2 ? 'deck' : 'shell') : 'chip', {
      transparent: true, opacity: part.observed ? .72 : .24, depthWrite: false,
      roughness: .6, metalness: .12, side: THREE.DoubleSide
    });
    material.userData.generatedObserved = part.observed;
    const geometry = builder.own(primitive(part));
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    builder.generatedMeshes.push(mesh);
    const edges = builder.own(new THREE.EdgesGeometry(geometry, part.shape === 'box' ? 24 : 12));
    const outlineMaterial = builder.own(part.observed
      ? new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false })
      : new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: .48, depthWrite: false, dashSize: .055, gapSize: .035 }));
    outlineMaterial.userData.role = 'wire';
    outlineMaterial.userData.generatedOutline = true;
    outlineMaterial.userData.observed = part.observed;
    builder.materials.push(outlineMaterial);
    const outline = new THREE.LineSegments(edges, outlineMaterial);
    if (!part.observed) outline.computeLineDistances();
    outline.raycast = () => {};
    mesh.add(outline);
  }
  builder.generatedConnections = blueprint.connections.map(connection => {
    const geometry = builder.own(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
    geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 0], 1));
    const material = builder.own(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: .07, gapSize: .045, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    material.userData.role = 'wire';
    builder.materials.push(material);
    const line = new THREE.LineSegments(geometry, material);
    line.userData.connection = { ...connection };
    line.raycast = () => {};
    line.renderOrder = 2;
    builder.model.add(line);
    return { ...connection, line };
  });
  builder.grid = new THREE.GridHelper(builder.spec.gridSize, 32, 0xffffff, 0xffffff);
  builder.grid.position.set(builder.spec.target[0], builder.spec.floor, builder.spec.target[2]);
  builder.grid.material.transparent = true;
  builder.grid.material.opacity = .12;
  builder.grid.material.depthWrite = false;
  builder.own(builder.grid.geometry); builder.own(builder.grid.material);
  builder.grid.raycast = () => {};
  builder.scene.add(builder.grid);
  updateGeneratedModel(builder, 0);
}

export function updateGeneratedModel(builder, progress = builder.explodeProgress || 0) {
  for (const connection of builder.generatedConnections || []) {
    const positions = connection.line.geometry.attributes.position;
    positions.setXYZ(0, ...builder.parts[connection.from].position.toArray());
    positions.setXYZ(1, ...builder.parts[connection.to].position.toArray());
    positions.needsUpdate = true;
    connection.line.geometry.computeBoundingSphere();
    const distances = connection.line.geometry.attributes.lineDistance;
    distances.setX(1, builder.parts[connection.from].position.distanceTo(builder.parts[connection.to].position));
    distances.needsUpdate = true;
    const related = builder.selected === connection.from || builder.selected === connection.to;
    connection.line.visible = progress > .02 || related;
    connection.line.material.opacity = related ? .82 : progress * .36;
  }
  for (const mesh of builder.generatedMeshes || []) {
    const selected = builder.partFor(mesh) === builder.selected;
    const observed = mesh.material.userData.generatedObserved;
    mesh.material.opacity = selected ? .88 : observed ? .72 : .24 + progress * .12;
    const outline = mesh.children[0];
    if (outline?.material) outline.material.opacity = (builder.theme === 'blueprint' ? .78 : .52) * (observed || selected ? 1 : .68);
  }
}
