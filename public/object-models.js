/** Generic teaching models: component relationships, not repair geometry. */
import * as THREE from 'three';

export const OBJECT_SPECS = {
  macbook: {
    name: 'MacBook',
    parts: { display: 'Display', chip: 'Apple silicon', trackpad: 'Trackpad', power: 'Battery', cooling: 'Cooling' },
    labels: { display: 'Display', chip: 'Chip', trackpad: 'Trackpad', power: 'Power', cooling: 'Cooling' },
    pins: {
      display: { point: [2.45, 3.35, .14], offset: [32, -28] },
      chip: { point: [0, .16, -.03], offset: [-85, -42], internal: true },
      trackpad: { point: [-.8, .09, 1.45], offset: [-83, 26] },
      power: { point: [2.04, .09, 1.1], offset: [30, 27], internal: true },
      cooling: { point: [2.33, .14, 0], offset: [38, -28], internal: true }
    },
    camera: [8.4, 6.6, 10.8], target: [0, 1.55, 0], targetOffset: [-1.3, .57, 0], expansion: .4, minDistance: 7.8, maxDistance: 24
  },
  lamp: {
    name: 'LED desk lamp',
    parts: { led: 'LED module', driver: 'LED driver', arm: 'Articulated arm', base: 'Weighted base' },
    labels: { led: 'Light', driver: 'Driver', arm: 'Arm', base: 'Base' },
    pins: {
      led: { point: [.3, -.25, .54], offset: [38, -30] },
      driver: { point: [.35, .12, .12], offset: [35, -34], internal: true },
      arm: { point: [-1.65, 2.25, .2], offset: [-115, -18] },
      base: { point: [-.65, .2, .6], offset: [-85, 32] }
    },
    camera: [6.23, 4.28, 7.63], target: [0, 1.9, 0], targetOffset: [.2, .23, 0], expansion: .15, minDistance: 5.5, maxDistance: 20
  },
  drill: {
    name: 'Cordless drill', frameWidth: 1.30,
    parts: { motor: 'Electric motor', gearbox: 'Planetary gearbox', chuck: 'Chuck and bit', power: 'Battery pack' },
    labels: { motor: 'Motor', gearbox: 'Gears', chuck: 'Chuck', power: 'Battery' },
    pins: {
      motor: { point: [-.25, .44, .2], offset: [-110, -40], internal: true },
      gearbox: { point: [.1, .4, .3], offset: [15, -56], internal: true },
      chuck: { point: [.75, .15, .18], offset: [30, 25] },
      power: { point: [-.35, -.05, .68], offset: [-84, 34] }
    },
    camera: [5.57, 4.14, 7.56], target: [.35, 1.4, 0], targetOffset: [.15, .12, 0], expansion: .17, minDistance: 6.0, maxDistance: 21
  }
};

function cylinder(b, parent, top, bottom, height, position, role, axis = 'y', segments = 48, material = null) {
  const geometry = b.own(new THREE.CylinderGeometry(top, bottom, height, segments));
  const mesh = new THREE.Mesh(geometry, material || b.material(role));
  mesh.position.set(...position);
  if (axis === 'x') mesh.rotation.z = -Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}
function rod(b, parent, from, to, radius, role, material = null) {
  const a = new THREE.Vector3(...from), z = new THREE.Vector3(...to), direction = z.clone().sub(a);
  const mesh = cylinder(b, parent, radius, radius, direction.length(), a.clone().add(z).multiplyScalar(.5).toArray(), role, 'y', 16, material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
function wire(b, parent, points, radius, role = 'wire') {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(b.own(new THREE.TubeGeometry(path, 32, radius, 8, false)), b.material(role, { metalness: .18, roughness: .54 }));
  parent.add(mesh); return mesh;
}
function ring(b, parent, radius, tube, position, role, axis = 'z') {
  const mesh = new THREE.Mesh(b.own(new THREE.TorusGeometry(radius, tube, 10, 56)), b.material(role));
  mesh.position.set(...position);
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  if (axis === 'y') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh); return mesh;
}
function stage(b, floor = -.28) {
  b.grid = new THREE.GridHelper(15, 30, 0xffffff, 0xffffff);
  b.grid.position.y = floor; b.grid.material.transparent = true; b.grid.material.opacity = .1; b.grid.material.depthWrite = false;
  b.own(b.grid.geometry); b.own(b.grid.material); b.grid.raycast = () => {}; b.scene.add(b.grid);
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,.23)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const texture = b.own(new THREE.CanvasTexture(canvas));
  b.shadow = new THREE.Mesh(b.own(new THREE.PlaneGeometry(9, 6)), b.own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
  b.shadow.rotation.x = -Math.PI / 2; b.shadow.position.y = floor + .01; b.shadow.raycast = () => {}; b.scene.add(b.shadow);
}
function guides(b, pairs) {
  const points = pairs.flatMap(pair => [new THREE.Vector3(...pair[0]), new THREE.Vector3(...pair[1])]);
  const geometry = b.own(new THREE.BufferGeometry().setFromPoints(points));
  b.guides = new THREE.LineSegments(geometry, b.own(new THREE.LineDashedMaterial({ color: 0xd9eeff, dashSize: .06, gapSize: .09, transparent: true, opacity: 0, depthWrite: false })));
  b.guides.computeLineDistances(); b.guides.raycast = () => {}; b.model.add(b.guides);
}

function buildLamp(b) {
  const base = b.assembly('Weighted base', [-1.2, 0, 0], [0, -.06, 0], 'base');
  cylinder(b, base, 1.10, 1.15, .22, [0, 0, 0], 'shell');
  ring(b, base, 1.08, .035, [0, .105, 0], 'metal', 'y');
  cylinder(b, base, .96, .98, .07, [0, -.135, 0], 'keys');
  const lid = b.assembly('Base cover', [-1.2, .135, 0], [-.7, .45, -.35]); lid.userData.partId = 'base';
  cylinder(b, lid, 1.04, 1.08, .08, [0, 0, 0], 'deck');
  const touch = cylinder(b, lid, .13, .13, .014, [.5, .049, .5], 'keys'); b.outline(touch, touch.geometry);
  ring(b, lid, .065, .008, [.5, .058, .5], 'metal', 'y');
  const driver = b.assembly('Constant-current driver', [-1.2, .09, 0], [1.35, .35, 1.06], 'driver');
  b.box(driver, [1.15, .06, .72], [0, 0, 0], 'board', { outline: true, radius: .04 });
  b.box(driver, [.35, .19, .28], [-.28, .115, -.08], 'chip', { outline: true });
  cylinder(b, driver, .12, .12, .19, [.31, .12, -.12], 'keys', 'y', 24);
  ring(b, driver, .085, .035, [.27, .105, .18], 'copper', 'y');
  for (let n = 0; n < 5; n++) b.box(driver, [.07, .045, .12], [-.38 + n * .18, .05, .23], 'metal', { radius: .006 });
  wire(b, driver, [[.5, .05, .23], [.72, .1, .2], [.73, .16, -.2]], .018, 'copper');

  const arm = b.assembly('Articulated arm', [0, 0, 0], [0, .27, -.12], 'arm');
  const joints = [[-1.4, .35, 0], [-1.65, 2.25, 0], [.6, 3.91, 0]];
  for (let i = 0; i < 2; i++) for (const z of [-.17, .17]) rod(b, arm, [joints[i][0], joints[i][1], z], [joints[i+1][0], joints[i+1][1], z], .065, 'shell');
  for (const point of joints) {
    cylinder(b, arm, .18, .18, .46, point, 'keys', 'z', 36);
    for (const sign of [-1, 1]) cylinder(b, arm, .12, .12, .026, [point[0], point[1], sign * .248], 'metal', 'z', 24);
  }
  cylinder(b, arm, .18, .21, .26, [-1.4, .28, 0], 'metal');
  wire(b, arm, [[-1.4,.25,-.08],[-1.62,1.2,-.07],[-1.74,2.23,-.08],[-.62,3.05,-.08],[.65,3.83,-.08]], .028, 'keys');
  // A short knuckle lets the head pivot independently of the two arm joints.
  rod(b, arm, [.6, 3.91, 0], [1.05, 3.95, 0], .10, 'metal');
  const head = b.assembly('LED head', [1.1, 3.89, 0], [.25, .6, .1], 'led');
  cylinder(b, head, .36, .82, .53, [0, 0, 0], 'shell');
  ring(b, head, .80, .045, [0, -.265, 0], 'metal', 'y');
  cylinder(b, head, .31, .31, .10, [0, .31, 0], 'metal');
  for (let n = 0; n < 8; n++) b.box(head, [.024, .015, .22], [-.15 + n * .043, .368, 0], 'keys', { radius: .001 });
  const ledMat = b.material('led', { emissive: 0xffe5ba, emissiveIntensity: 1.5, metalness: 0, roughness: .8 });
  b.lampEmitter = cylinder(b, head, .74, .74, .015, [0, -.277, 0], 'led', 'y', 64, ledMat);
  b.lampEmitter.material.userData.activityEmitter = true;
  for (let n = 0; n < 12; n++) {
    const angle = n / 12 * Math.PI * 2;
    const diode = b.box(head, [.075, .018, .075], [Math.cos(angle) * .47, -.29, Math.sin(angle) * .47], 'led', { radius: .01, material: ledMat });
    diode.userData.isLED = true;
  }
  // The pool of light communicates brightness immediately, without a shadow map.
  const poolMat = b.own(new THREE.ShaderMaterial({
    uniforms: { strength: { value: .7 }, color: { value: new THREE.Color(0xffe9b6) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float strength; uniform vec3 color; void main(){ float r=length(vUv-.5)*2.; float falloff=pow(max(0.,1.-r*r),1.7); gl_FragColor=vec4(color,falloff*strength*.30); }'
  }));
  b.lampPool = new THREE.Mesh(b.own(new THREE.PlaneGeometry(4.8, 4.8)), poolMat);
  b.lampPool.rotation.x = -Math.PI / 2; b.lampPool.position.set(1.1, -.267, 0); b.lampPool.raycast = () => {}; b.scene.add(b.lampPool);
  const beamGeo = b.own(new THREE.CylinderGeometry(.73, 2.0, 3.72, 64, 1, true));
  const beamMat = b.own(new THREE.ShaderMaterial({
    uniforms: { strength: { value: .7 }, color: { value: new THREE.Color(0xffe9b6) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform float strength; uniform vec3 color; void main(){float a=pow(vUv.y,1.7)*.055*strength;gl_FragColor=vec4(color,a);}'
  }));
  b.lampBeam = new THREE.Mesh(beamGeo, beamMat); b.lampBeam.position.set(1.1, 1.60, 0); b.lampBeam.raycast = () => {}; b.scene.add(b.lampBeam);
  b.lampLight = new THREE.PointLight(0xffebc8, 2.4, 6, 2); b.lampLight.position.set(1.1, 3.5, 0); b.scene.add(b.lampLight);
  guides(b, [[[-1.2,.08,0],[-1.2,.08,0]], [[1.1,3.6,0],[1.1,3.6,0]]]);
  b.guideTargets = [driver, head];
  stage(b);
}

function makeGear(b, parent, radius, width, position, teeth, role) {
  const gear = new THREE.Group(); gear.position.set(...position); parent.add(gear);
  cylinder(b, gear, radius * .85, radius * .85, width, [0,0,0], role, 'x', 36);
  const geo = b.own(new THREE.BoxGeometry(width, radius * .24, radius * .19));
  const mat = b.material(role, { metalness: .72, roughness: .33 });
  for (let n = 0; n < teeth; n++) {
    const angle = n / teeth * Math.PI * 2, tooth = new THREE.Mesh(geo, mat);
    tooth.position.set(0, Math.cos(angle) * radius * .89, Math.sin(angle) * radius * .89); tooth.rotation.x = angle; gear.add(tooth);
  }
  cylinder(b, gear, radius * .19, radius * .19, width + .025, [0,0,0], 'keys', 'x', 16);
  return gear;
}
function buildDrill(b) {
  // Split housing halves travel sideways in the assembly view.
  b.drillShells = [];
  for (const side of [-1, 1]) {
    const shell = b.assembly(side === 1 ? 'Front housing half' : 'Rear housing half', [-.45, 2.55, side * .30], [-.18, .55, side * 1.16]);
    shell.userData.partId = 'motor';
    b.box(shell, [2.58, 1.15, .58], [0, 0, 0], 'shell', { radius: .19, outline: true });
    b.box(shell, [1.0, .58, .025], [-.5, .015, side * .302], 'keys', { radius: .08 });
    for (let n = 0; n < 7; n++) b.box(shell, [.025, .30, .018], [-.84 + n * .11, .015, side * .322], 'metal', { radius: .005 });
    b.box(shell, [.5, .095, .22], [.15,.61,-side*.14], 'keys', { radius: .035 });
    b.drillShells.push(shell);
  }
  const grip = b.assembly('Grip and trigger', [-.65, 1.30, 0], [-.10, 0, 0]);
  grip.rotation.z = -.17;
  b.box(grip, [.72, 1.90, .91], [0,0,0], 'shell', { radius: .16, outline: true });
  b.box(grip, [.50, 1.38, .945], [-.12,-.09,0], 'keys', { radius: .13 });
  for (let n = 0; n < 8; n++) b.box(grip, [.54, .025, .97], [-.11,-.58 + n * .14,0], 'fan', { radius: .006 });
  b.drillTrigger = b.box(grip, [.27,.43,.73], [.41,.50,0], 'keys', { radius: .07 });
  b.drillTrigger.userData.partId = 'motor';
  const motor = b.assembly('Brushless motor', [-.92, 2.55, 0], [-.58,.08,0], 'motor');
  cylinder(b, motor, .41,.41,.06,[-.64,0,0],'metal','x',48);
  // An open teaching cutaway exposes the stator windings after the shell moves.
  cylinder(b,motor,.29,.29,1.02,[0,0,0],'keys','x',48);
  for (let n = 0; n < 10; n++) {
    const angle=n/10*Math.PI*2;
    const coil = b.box(motor,[.82,.15,.16],[0,Math.cos(angle)*.37,Math.sin(angle)*.37],'copper',{radius:.035}); coil.rotation.x=angle;
    for (let turn = 0; turn < 7; turn++) ring(b, motor, .063, .012, [-.30+turn*.1,Math.cos(angle)*.415,Math.sin(angle)*.415],'copper','x');
  }
  b.drillRotor = new THREE.Group(); motor.add(b.drillRotor);
  cylinder(b,b.drillRotor,.19,.19,1.56,[.12,0,0],'chip','x',36);
  b.box(b.drillRotor,[1.22,.06,.36],[.05,0,0],'metal',{radius:.025});
  for (const x of [-.64,.64]) ring(b,motor,.40,.055,[x,0,0],'metal','x');
  cylinder(b,motor,.09,.09,.32,[-.82,0,0],'metal','x',24);
  const gearbox = b.assembly('Planetary gearbox', [.42,2.55,0], [.22,.08,0], 'gearbox');
  // Ring gear, central sun, and three planets are intentionally visible.
  for (const x of [-.26,.26]) ring(b,gearbox,.47,.065,[x,0,0],'metal','x');
  cylinder(b,gearbox,.48,.48,.06,[-.28,0,0],'fan','x',48);
  b.drillSun = makeGear(b,gearbox,.16,.30,[.04,0,0],12,'copper');
  b.drillCarrier = new THREE.Group(); gearbox.add(b.drillCarrier); b.drillPlanets=[];
  for (let n=0;n<3;n++) {
    const angle=n/3*Math.PI*2;
    b.drillPlanets.push(makeGear(b,b.drillCarrier,.17,.32,[.05,Math.cos(angle)*.29,Math.sin(angle)*.29],12,'metal'));
    rod(b,b.drillCarrier,[.23,0,0],[.23,Math.cos(angle)*.29,Math.sin(angle)*.29],.045,'chip');
  }
  cylinder(b,gearbox,.11,.11,.48,[.46,0,0],'metal','x',24);
  const chuck = b.assembly('Chuck and drill bit',[1.25,2.55,0],[1.14,.08,0],'chuck');
  b.drillChuck = new THREE.Group(); chuck.add(b.drillChuck);
  cylinder(b,b.drillChuck,.53,.55,.46,[0,0,0],'keys','x',64);
  cylinder(b,b.drillChuck,.39,.51,.44,[.43,0,0],'metal','x',64);
  cylinder(b,b.drillChuck,.24,.36,.20,[.74,0,0],'keys','x',48);
  for (let n=0;n<24;n++) {
    const angle=n/24*Math.PI*2;
    rod(b,b.drillChuck,[-.20,Math.cos(angle)*.54,Math.sin(angle)*.54],[.19,Math.cos(angle)*.54,Math.sin(angle)*.54],.016,'metal');
  }
  for (let n=0;n<3;n++) {
    const angle=n/3*Math.PI*2;
    const jaw=b.box(b.drillChuck,[.27,.115,.12],[.85,Math.cos(angle)*.13,Math.sin(angle)*.13],'metal',{radius:.015}); jaw.rotation.x=angle;
  }
  // Two helical flutes distinguish the bit from a plain spindle.
  cylinder(b,b.drillChuck,.064,.064,1.12,[1.40,0,0],'metal','x',20);
  for (const phase of [0,Math.PI]) {
    const points=[];
    for(let i=0;i<=60;i++){ const t=i/60, angle=t*Math.PI*6+phase; points.push([.97+t*.96,Math.cos(angle)*.072,Math.sin(angle)*.072]); }
    wire(b,b.drillChuck,points,.018,'keys');
  }
  cylinder(b,b.drillChuck,0,.077,.16,[2.02,0,0],'metal','x',20);
  const power = b.assembly('Lithium-ion battery pack',[-.73,.20,0],[0,-.28,0],'power');
  b.box(power,[1.98,.70,1.36],[0,0,0],'keys',{radius:.13,outline:true});
  b.box(power,[1.60,.12,1.20],[0,.38,0],'deck',{radius:.06});
  b.box(power,[1.86,.11,1.31],[0,-.37,0],'shell',{radius:.05});
  b.box(power,[.30,.20,.035],[.66,.09,.69],'shell',{radius:.025});
  for(let n=0;n<4;n++) b.box(power,[.11,.045,.024],[-.51+n*.17,.17,.696],'led',{radius:.005});
  b.drillBatteryCover=b.box(power,[1.65,.46,.08],[0,-.02,.68],'shell',{radius:.06,outline:true});
  for(let n=0;n<5;n++) cylinder(b,power,.14,.14,1.03,[-.63+n*.315,-.04,0],'chip','z',24);
  guides(b,[[[-.45,2.55,-.35],[-.45,2.55,-.35]],[[-.45,2.55,.35],[-.45,2.55,.35]],[[1.25,2.55,0],[1.25,2.55,0]]]);
  b.guideTargets = [...b.drillShells, chuck];
  stage(b,-.65);
}

export function buildAdditionalModel(builder, objectId) {
  if (objectId === 'lamp') buildLamp(builder);
  else if (objectId === 'drill') buildDrill(builder);
  else throw new RangeError(`Unknown object: ${objectId}`);
}

export function applyObjectSeparation(builder, progress) {
  if (builder.guideTargets) {
    const points=builder.guides.geometry.attributes.position;
    builder.guideTargets.forEach((group,index) => {
      points.setXYZ(index*2,...group.userData.base.toArray());
      points.setXYZ(index*2+1,...group.position.toArray());
    });
    points.needsUpdate=true; builder.guides.computeLineDistances();
  }
  if(builder.objectId === 'lamp') {
    const head = builder.parts.led;
    const top = head.position.y-.28, floor = -.267, height = top-floor;
    builder.lampBeam.position.set(head.position.x, floor + height/2, head.position.z);
    builder.lampBeam.scale.y = height / 3.72;
    builder.lampPool.position.x = head.position.x; builder.lampPool.position.z = head.position.z;
    builder.lampLight.position.copy(head.position).add(new THREE.Vector3(0,-.4,0));
  }
  if(builder.objectId === 'drill' && builder.drillBatteryCover) builder.drillBatteryCover.position.z = .68 + progress*.8;
}

export function applyObjectActivity(builder) {
  const activity = builder.activity || 0;
  if (builder.objectId === 'lamp') {
    builder.lampPool.material.uniforms.strength.value=activity;
    builder.lampBeam.material.uniforms.strength.value=activity;
    builder.lampLight.intensity=activity*3.6;
    if (builder.lampEmitter) { builder.lampEmitter.material.emissive.setHex(0xffe4b8); builder.lampEmitter.material.emissiveIntensity=activity*1.9; }
  }
  if (builder.objectId === 'drill' && builder.drillTrigger) builder.drillTrigger.position.x=.41-activity*.11;
}

export function animateObject(builder, dt) {
  if(builder.objectId!=='drill' || !builder.activity || builder.reducedMotion) return false;
  const speed=builder.activity*7.5;
  builder.drillRotor.rotation.x+=dt*speed;
  builder.drillSun.rotation.x+=dt*speed;
  builder.drillCarrier.rotation.x+=dt*speed*.23;
  for (const gear of builder.drillPlanets) gear.rotation.x-=dt*speed*.65;
  builder.drillChuck.rotation.x+=dt*speed*.23;
  return true;
}
