// Shared data boundary for generated educational geometry. No executable output.
const shapes = new Set(['box', 'cylinder', 'sphere', 'torus', 'cone']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
const vector = (value, min, max) => Array.isArray(value) && value.length === 3 && Array.from(value).every(number => typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max);
const fail = () => { throw new Error('Invalid blueprint data.'); };

export function validateBlueprint(value) {
  if (!exact(value, ['version', 'title', 'summary', 'parts', 'connections']) || value.version !== 1 || !text(value.title, 120) || !text(value.summary, 600) || !Array.isArray(value.parts) || value.parts.length < 2 || value.parts.length > 8 || !Array.isArray(value.connections) || value.connections.length > 12) fail();
  const ids = new Set();
  const parts = Array.from(value.parts).map(part => {
    if (!exact(part, ['id', 'label', 'description', 'principle', 'construction', 'observed', 'shape', 'size', 'position', 'rotation', 'explode']) || typeof part.id !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(part.id) || ids.has(part.id) || !text(part.label, 60) || !text(part.description, 320) || !text(part.principle, 320) || !text(part.construction, 240) || typeof part.observed !== 'boolean' || !shapes.has(part.shape) || !vector(part.size, 0.08, 6) || !vector(part.position, -4, 4) || !vector(part.rotation, -180, 180) || !vector(part.explode, -3, 3)) fail();
    ids.add(part.id);
    return { id: part.id, label: part.label.trim(), description: part.description.trim(), principle: part.principle.trim(), construction: part.construction.trim(), observed: part.observed, shape: part.shape, size: [...part.size], position: [...part.position], rotation: [...part.rotation], explode: [...part.explode] };
  });
  const edges = new Set();
  const connections = Array.from(value.connections).map(connection => {
    if (!exact(connection, ['from', 'to', 'label']) || !ids.has(connection.from) || !ids.has(connection.to) || connection.from === connection.to || !text(connection.label, 100)) fail();
    // One physical relationship per pair; direction does not permit duplicates.
    const edge = [connection.from, connection.to].sort().join(':');
    if (edges.has(edge)) fail();
    edges.add(edge);
    return { from: connection.from, to: connection.to, label: connection.label.trim() };
  });
  return { version: 1, title: value.title.trim(), summary: value.summary.trim(), parts, connections };
}
