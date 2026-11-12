import * as THREE from './three.module.js';
// Local renderer: matte geometry + owned concept data. No network or AI calls.
export function createMatteGraph(host, nodes, links, onSelect, savedView, onError) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1d2330, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-3, 5, 6);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xffffff, 1);
  rim.position.set(4, 0, 2);
  scene.add(rim);
  const group = new THREE.Group();
  scene.add(group);
  const geometry = new THREE.SphereGeometry(1, 40, 32),
    meshes = [],
    labels = [],
    byId = new Map();
  let disposed = false,
    drag = null,
    moved = false;
  const records = nodes.map((n, i) => {
    const angle = i * 2.399963,
      r = 1.5 * Math.sqrt(i + 1);
    return {
      ...n,
      p: new THREE.Vector3(
        Math.cos(angle) * r,
        Math.sin(angle) * r * 0.65,
        Math.sin(angle * 1.8) * 1.15,
      ),
      radius: 0.52 + Math.min(0.18, Math.log2(n.evidence + 1) * 0.05),
    };
  });
  const box = new THREE.Box3();
  for (const n of records) box.expandByPoint(n.p);
  const center = records.length ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const extent = records.length ? box.getSize(new THREE.Vector3()).length() / 2 + 1.2 : 3;
  const getDistance = () =>
    Math.max(
      8,
      (extent / Math.sin(THREE.MathUtils.degToRad(21))) *
        Math.max(1, host.clientHeight / Math.max(1, host.clientWidth)),
    );
  let defaultDistance = getDistance();
  camera.position.z = savedView?.distance || defaultDistance;
  group.rotation.set(savedView?.x || 0, savedView?.y || -0.12, 0);
  for (const n of records) {
    const material = new THREE.MeshStandardMaterial({
      color: n.color || '#68717d',
      roughness: 0.92,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(n.p).sub(center);
    mesh.scale.setScalar(n.radius);
    mesh.userData.id = n.id;
    group.add(mesh);
    meshes.push(mesh);
    byId.set(n.id, mesh);
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'guria-matte-node-label';
    label.setAttribute('aria-label', n.label);
    label.title = n.label + ' · ' + n.status;
    const name = document.createElement('span');
    name.textContent = n.label;
    const status = document.createElement('small');
    status.textContent = n.status;
    status.id = 'matte-status-' + n.id;
    label.setAttribute('aria-describedby', status.id);
    label.append(name, status);
    label.addEventListener('click', () => onSelect(n.id));
    label.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.appendChild(label);
    labels.push(label);
  }
  const edgeColor = getComputedStyle(host).getPropertyValue('--line').trim() || '#888888';
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: 0.85,
  });
  for (const edge of links) {
    const a = byId.get(edge.source),
      b = byId.get(edge.target);
    if (!a || !b) continue;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a.position, b.position]),
      edgeMaterial,
    );
    group.add(line);
  }
  function render() {
    if (disposed) return;
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    group.updateMatrixWorld(true);
    renderer.render(scene, camera);
    for (let i = 0; i < meshes.length; i++) {
      const v = meshes[i].position.clone();
      v.y -= records[i].radius + 0.13;
      group.localToWorld(v);
      v.project(camera);
      const label = labels[i];
      label.style.left = (v.x * 0.5 + 0.5) * 100 + '%';
      label.style.top = (-v.y * 0.5 + 0.5) * 100 + '%';
      label.style.zIndex = String(Math.round((1 - v.z) * 1000));
      label.style.visibility =
        v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.05 ? 'hidden' : 'visible';
    }
  }
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  function down(e) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    moved = false;
    host.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) moved = true;
    group.rotation.y += (e.clientX - drag.x) * 0.008;
    group.rotation.x = THREE.MathUtils.clamp(
      group.rotation.x + (e.clientY - drag.y) * 0.006,
      -1.3,
      1.3,
    );
    drag = { ...drag, x: e.clientX, y: e.clientY };
    render();
  }
  function up(e) {
    if (!drag) return;
    drag = null;
    if (moved) return;
    const r = host.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) onSelect(hit.object.userData.id);
  }
  function cancel() {
    drag = null;
  }
  function wheel(e) {
    e.preventDefault();
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z + e.deltaY * 0.01,
      defaultDistance * 0.4,
      defaultDistance * 3,
    );
    render();
  }
  function lost(e) {
    e.preventDefault();
    onError();
  }
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('wheel', wheel, { passive: false });
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const resize = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    const nextDistance = getDistance();
    camera.position.z *= nextDistance / defaultDistance;
    defaultDistance = nextDistance;
    render();
  });
  resize.observe(host);
  render();
  return {
    view: () => ({ x: group.rotation.x, y: group.rotation.y, distance: camera.position.z }),
    rotate: (delta) => {
      group.rotation.y += delta;
      render();
    },
    reset: () => {
      group.rotation.set(0, -0.12, 0);
      camera.position.z = getDistance();
      render();
    },
    dispose: () => {
      disposed = true;
      resize.disconnect();
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', cancel);
      host.removeEventListener('wheel', wheel);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      labels.forEach((label) => label.remove());
      renderer.domElement.remove();
    },
  };
}
