import { validateBlueprint } from '../public/blueprint-schema.mjs';

const SHAPES = new Set(['box', 'cylinder', 'sphere', 'torus', 'cone']);
const REFERENCES = new Set(['macbook', 'lamp', 'drill']);
const RAW_LIMIT = 1000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const failure = reason => { const error = new Error('The photo blueprint is incomplete.'); error.reason = reason; throw error; };
const text = (value, max) => {
  if (typeof value !== 'string') return failure('INVALID_BLUEPRINT');
  const result = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, max).trim();
  if (!result) return failure('INVALID_BLUEPRINT');
  return result;
};
const vector = (value, { positive = false, limit = RAW_LIMIT } = {}) => {
  if (!Array.isArray(value) || value.length !== 3 || !Array.from(value).every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= limit && (!positive || number > 0))) return failure('INVALID_GEOMETRY');
  return [...value];
};
const rotation = value => vector(value, { limit: 1000000 }).map(angle => ((angle + 180) % 360 + 360) % 360 - 180);

// These defaults arrange already model-generated parts; they never supply object geometry.
function separationOffset(position, index) {
  let axis = position.reduce((best, number, candidate) => Math.abs(number) > Math.abs(position[best]) ? candidate : best, 0);
  if (Math.abs(position[axis]) < 0.05) axis = index % 3;
  const sign = Math.abs(position[axis]) < 0.05 ? (index % 2 ? 1 : -1) : Math.sign(position[axis]);
  return [0, 0, 0].map((_number, candidate) => candidate === axis ? sign * (1.2 + 0.2 * (index % 2)) : 0);
}

export function canonicalizePhotoBlueprint(value) {
  if (!record(value) || !Array.isArray(value.parts) || value.parts.length > 8 || value.parts.length === 1) return failure('INVALID_BLUEPRINT');
  const title = text(value.title, 120);
  const summary = text(value.summary, 600);
  if (!value.parts.length) return { identification: title, summary, match: 'uncertain', objectId: null, visibleParts: [], blueprint: null };

  const parts = Array.from(value.parts).map((part, index) => {
    if (!record(part)) return failure('INVALID_BLUEPRINT');
    const shape = typeof part.shape === 'string' ? part.shape.trim().toLowerCase() : '';
    if (!SHAPES.has(shape)) return failure('INVALID_GEOMETRY');
    return {
      id: `part-${index + 1}`, label: text(part.label, 60), description: text(part.description, 320), principle: text(part.principle, 320),
      construction: typeof part.construction === 'string' && part.construction.trim() ? text(part.construction, 240) : 'Construction cannot be confirmed from this photo.',
      observed: part.observed === true, shape, size: vector(part.size, { positive: true }), position: vector(part.position),
      rotation: part.rotation == null ? [0, 0, 0] : rotation(part.rotation), explode: part.explode == null ? null : vector(part.explode)
    };
  });

  // Recenter and uniformly scale the entire assembly before applying display minima.
  // Relative positions and proportions survive harmless unit/centering deviations.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], part.position[axis] - part.size[axis] / 2);
    max[axis] = Math.max(max[axis], part.position[axis] + part.size[axis] / 2);
  }
  const extent = Math.max(...max.map((number, axis) => number - min[axis]));
  if (!Number.isFinite(extent) || extent < 0.000001) return failure('INVALID_GEOMETRY');
  const center = min.map((number, axis) => (number + max[axis]) / 2);
  const scale = extent > 5 || extent < 2 ? 4 / extent : 1;
  for (const [index, part] of parts.entries()) {
    part.position = part.position.map((number, axis) => (number - center[axis]) * scale);
    part.size = part.size.map(number => clamp(number * scale, 0.08, 6));
    part.explode = part.explode ? part.explode.map(number => clamp(number * scale, -3, 3)) : separationOffset(part.position, index);
  }

  const pairs = new Set();
  const connections = [];
  for (const connection of Array.isArray(value.connections) ? value.connections : []) {
    if (!Array.isArray(connection) || connection.length < 3) continue;
    const [from, to, label] = connection;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= parts.length || to >= parts.length || from === to || typeof label !== 'string' || !label.trim()) continue;
    const pair = [from, to].sort((a, b) => a - b).join(':');
    if (pairs.has(pair)) continue;
    let relationship;
    try { relationship = text(label, 100); } catch { continue; }
    pairs.add(pair);
    connections.push({ from: parts[from].id, to: parts[to].id, label: relationship });
    if (connections.length === 12) break;
  }

  let blueprint;
  try { blueprint = validateBlueprint({ version: 1, title, summary, parts, connections }); }
  catch { return failure('INVALID_BLUEPRINT'); }
  const reference = REFERENCES.has(value.reference) ? value.reference : null;
  return { identification: title, summary, match: reference ? 'supported' : 'unsupported', objectId: reference, visibleParts: [...new Set(parts.filter(part => part.observed).map(part => part.label))], blueprint };
}
