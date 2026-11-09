/*
 * Интерактивная 3D-модель предварительной ПЭТ-упаковки.
 * Используется Three.js с CDN. Если WebGL или CDN недоступны, остаётся SVG-эскиз из configurator.html.
 * Модель демонстрационная: пропорции не являются производственным чертежом.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('[data-configurator]');
  const canvas = root?.querySelector('[data-config-3d-canvas]');
  const stage = root?.querySelector('[data-config-stage]');
  if (!root || !canvas || !stage) return;

  const status = root.querySelector('[data-config-view-status]');
  const viewerControls = root.querySelector('[data-config-viewer-controls]');
  const showFallback = message => {
    if (status) status.textContent = message;
    viewerControls?.classList.add('is-fallback');
  };
  let THREE;
  try {
    // Версия зафиксирована, чтобы модель не менялась неожиданно при обновлении библиотеки.
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
  } catch (error) {
    showFallback('3D-библиотека недоступна — показан эскиз');
    console.warn('Не удалось загрузить Three.js. Используется SVG-эскиз.', error);
    return;
  }
  const angleOutput = root.querySelector('[data-config-angle]');
  const rotationInput = root.querySelector('[data-config-rotation]');
  const zoomInput = root.querySelector('[data-config-zoom]');
  const viewButtons = [...root.querySelectorAll('[data-config-view]')];
  const zoomIn = root.querySelector('[data-config-zoom-in]');
  const zoomOut = root.querySelector('[data-config-zoom-out]');
  const resetButton = root.querySelector('[data-config-reset]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    showFallback('3D недоступна — показан эскиз');
    console.warn('Не удалось включить WebGL. Оставляем SVG-предпросмотр.', error);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.02, 6.3);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xdff7ff, 0x14222b, 2.05));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(-3.5, 4.5, 4.5);
  scene.add(keyLight);
  const coolRim = new THREE.DirectionalLight(0x78c7e5, 3.4);
  coolRim.position.set(4.2, 2.2, -3.4);
  scene.add(coolRim);
  const warmRim = new THREE.PointLight(0xe7b776, 95, 8, 2);
  warmRim.position.set(-2.8, -1.0, 2.4);
  scene.add(warmRim);
  const topLight = new THREE.PointLight(0xffffff, 45, 7, 2);
  topLight.position.set(0, 4, 1.5);
  scene.add(topLight);

  const model = new THREE.Group();
  scene.add(model);
  const productGroup = new THREE.Group();
  model.add(productGroup);

  // Мягкая контактная тень на условной поверхности.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(128, 128, 8, 128, 128, 122);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,.42)');
  shadowGradient.addColorStop(.45, 'rgba(0,0,0,.18)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 256, 256);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const groundShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.05),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: .78 })
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = -1.94;
  scene.add(groundShadow);

  const palette = {
    clear: 0xb7e9f4,
    blue: 0x4b9fbd,
    amber: 0xc98239,
    green: 0x68a77b
  };
  const capPalette = { black: 0x17232a, white: 0xe8f0f2, blue: 0x347d9a };
  let selected = {
    type: root.querySelector('[data-config-type].active')?.dataset.configType || 'bottle',
    color: root.querySelector('[data-config-color].active')?.dataset.configColor || 'clear',
    cap: root.querySelector('[data-config-cap]')?.value || 'black',
    hasCap: root.querySelector('[data-config-type].active')?.dataset.configType !== 'preform' && root.querySelector('[data-config-closure]')?.value !== 'Без крышки / преформа'
  };
  let currentZoom = 1;
  let isDragging = false;
  let lastPointer = { x: 0, y: 0 };
  let activePreset = 'front';
  let idleStart = performance.now();
  let userHasInteracted = false;
  let lastFrame = performance.now();
  let disposed = false;

  const disposeChildren = group => {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.traverse?.(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(material => material.dispose());
        }
      });
    }
  };

  const bottleProfiles = {
    bottle: [
      [0, -1.78], [.27, -1.78], [.37, -1.72], [.415, -1.63], [.42, -1.51], [.405, -1.42],
      [.42, -1.28], [.42, .68], [.405, .84], [.35, .98], [.22, 1.12], [.18, 1.17],
      [.18, 1.48], [.17, 1.51], [0, 1.51]
    ],
    preform: [
      [0, -1.02], [.15, -1.02], [.22, -.98], [.235, -.88], [.235, .36], [.21, .49],
      [.18, .57], [.18, .98], [.17, 1.02], [0, 1.02]
    ],
    container: [
      [0, -1.48], [.36, -1.48], [.49, -1.43], [.545, -1.34], [.55, -1.20], [.55, .48],
      [.535, .65], [.48, .78], [.29, .94], [.22, .98], [.22, 1.28], [.20, 1.32], [0, 1.32]
    ]
  };

  const makePlasticMaterial = () => new THREE.MeshPhysicalMaterial({
    color: palette[selected.color] || palette.clear,
    metalness: .025,
    roughness: .13,
    clearcoat: 1,
    clearcoatRoughness: .055,
    transmission: .22,
    thickness: .55,
    transparent: true,
    opacity: selected.color === 'clear' ? .48 : .58,
    side: THREE.DoubleSide
  });

  const addLathe = (points, material, segments = 96) => {
    const curvePoints = points.map(([radius, y]) => new THREE.Vector2(radius, y));
    const geometry = new THREE.LatheGeometry(curvePoints, segments);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    productGroup.add(mesh);
    return mesh;
  };

  const addRing = (radius, tube, y, material) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 72), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    productGroup.add(ring);
    return ring;
  };

  const addCap = (topY, materialColor) => {
    const capMaterial = new THREE.MeshPhysicalMaterial({ color: materialColor, roughness: .3, metalness: .08, clearcoat: .55 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .18, 64, 1, false), capMaterial);
    cap.position.y = topY + .09;
    productGroup.add(cap);
    const ribMaterial = new THREE.MeshStandardMaterial({ color: materialColor, roughness: .42, metalness: .05 });
    const ribGeometry = new THREE.BoxGeometry(.012, .145, .025);
    for (let index = 0; index < 32; index += 1) {
      const angle = index / 32 * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeometry, ribMaterial);
      rib.position.set(Math.sin(angle) * .204, topY + .09, Math.cos(angle) * .204);
      rib.rotation.y = angle;
      productGroup.add(rib);
    }
    addRing(.185, .012, topY + .018, ribMaterial);
  };

  const addBaseFeet = (material) => {
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(.135, 24, 16), material);
      foot.position.set(Math.sin(angle) * .25, -1.68, Math.cos(angle) * .25);
      foot.scale.set(.92, .46, .78);
      productGroup.add(foot);
    }
  };

  const addBodyHighlights = (baseRadius, type) => {
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .66 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x79d8f5, transparent: true, opacity: .36 });
    const z = baseRadius * .76;
    const yStart = type === 'preform' ? -.84 : (type === 'container' ? -1.18 : -1.35);
    const yEnd = type === 'preform' ? .28 : (type === 'container' ? .45 : .66);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-baseRadius * .35, yStart, z * .72),
      new THREE.Vector3(-baseRadius * .42, yStart * .42, z * .82),
      new THREE.Vector3(-baseRadius * .42, yEnd * .35, z * .84),
      new THREE.Vector3(-baseRadius * .28, yEnd, z * .78)
    ]);
    productGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .012, 8, false), highlightMat));
    const sideCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(baseRadius * .78, yStart, baseRadius * .16),
      new THREE.Vector3(baseRadius * .86, yStart * .35, baseRadius * .14),
      new THREE.Vector3(baseRadius * .84, yEnd * .35, baseRadius * .15),
      new THREE.Vector3(baseRadius * .62, yEnd, baseRadius * .2)
    ]);
    productGroup.add(new THREE.Mesh(new THREE.TubeGeometry(sideCurve, 36, .009, 8, false), blueMat));
  };

  const buildProduct = () => {
    disposeChildren(productGroup);
    const plastic = makePlasticMaterial();
    const isPreform = selected.type === 'preform';
    const isContainer = selected.type === 'container';
    const profile = bottleProfiles[selected.type] || bottleProfiles.bottle;
    const topY = profile[profile.length - 2][1];
    const radius = isContainer ? .55 : (isPreform ? .235 : .42);
    addLathe(profile, plastic, 112);

    // Усилительные пояски на нижней части и формованный ободок основания.
    if (!isPreform) {
      const ringMaterial = new THREE.MeshPhysicalMaterial({ color: palette[selected.color], transparent: true, opacity: .38, roughness: .18, clearcoat: 1 });
      addRing(radius * .985, .014, isContainer ? -1.22 : -1.48, ringMaterial);
      if (!isContainer) addRing(.405, .009, -1.56, ringMaterial);
      if (!isContainer) addBaseFeet(plastic);
    }

    const neckRadius = isContainer ? .22 : (isPreform ? .18 : .18);
    const neckThreadMaterial = new THREE.MeshPhysicalMaterial({ color: palette[selected.color], transparent: true, opacity: .5, roughness: .2, clearcoat: 1 });
    addRing(neckRadius, .012, topY - .13, neckThreadMaterial);
    addRing(neckRadius, .01, topY - .2, neckThreadMaterial);
    addBodyHighlights(radius, selected.type);
    if (selected.hasCap && !isPreform) addCap(topY - .02, capPalette[selected.cap] || capPalette.black);

    const baseScale = isPreform ? 1.22 : (isContainer ? .86 : 1);
    model.scale.setScalar(currentZoom * baseScale);
    groundShadow.scale.set(isContainer ? 1.18 : .98, 1, 1);
    groundShadow.position.y = isPreform ? -1.30 : (isContainer ? -1.34 : -1.92);
  };

  const updateAngleUI = () => {
    let degrees = Math.round(THREE.MathUtils.euclideanModulo(model.rotation.y, Math.PI * 2) * 180 / Math.PI);
    degrees = degrees % 360;
    if (rotationInput) rotationInput.value = String(degrees);
    if (angleOutput) angleOutput.textContent = `${degrees}°`;
  };

  const setZoom = value => {
    currentZoom = THREE.MathUtils.clamp(value, .7, 1.55);
    const typeScale = selected.type === 'preform' ? 1.22 : (selected.type === 'container' ? .86 : 1);
    model.scale.setScalar(currentZoom * typeScale);
    if (zoomInput) zoomInput.value = String(Math.round(currentZoom * 100));
  };

  const setPresetActive = preset => {
    activePreset = preset;
    viewButtons.forEach(button => {
      const active = button.dataset.configView === preset;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const setView = preset => {
    userHasInteracted = true;
    model.rotation.x = 0;
    camera.position.set(0, .02, 6.3);
    camera.lookAt(0, 0, 0);
    setZoom(1);
    if (preset === 'front') model.rotation.y = 0;
    if (preset === 'three-quarter') model.rotation.y = Math.PI / 4;
    if (preset === 'side') model.rotation.y = Math.PI / 2;
    if (preset === 'back') model.rotation.y = Math.PI;
    if (preset === 'neck') {
      model.rotation.y = Math.PI / 8;
      camera.position.set(0, 4.3, 5.5);
      camera.lookAt(0, 1.1, 0);
      setZoom(1.12);
    }
    if (preset === 'base') {
      model.rotation.y = -Math.PI / 8;
      camera.position.set(0, -4.2, 5.6);
      camera.lookAt(0, -1.55, 0);
      setZoom(1.13);
    }
    setPresetActive(preset);
    updateAngleUI();
  };

  viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.configView || 'front')));
  rotationInput?.addEventListener('input', () => {
    userHasInteracted = true;
    model.rotation.y = Number(rotationInput.value) * Math.PI / 180;
    setPresetActive('custom');
    updateAngleUI();
  });
  zoomInput?.addEventListener('input', () => setZoom(Number(zoomInput.value) / 100));
  zoomIn?.addEventListener('click', () => setZoom(currentZoom + .1));
  zoomOut?.addEventListener('click', () => setZoom(currentZoom - .1));
  resetButton?.addEventListener('click', () => {
    setView('front');
    if (status) status.textContent = 'Вид сброшен · перетаскивайте модель для вращения';
  });

  canvas.addEventListener('pointerdown', event => {
    isDragging = true;
    userHasInteracted = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!isDragging) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    model.rotation.y += dx * .012;
    model.rotation.x = THREE.MathUtils.clamp(model.rotation.x + dy * .008, -.62, .62);
    setPresetActive('custom');
    updateAngleUI();
  });
  const stopDrag = event => {
    isDragging = false;
    canvas.classList.remove('is-dragging');
    if (event?.pointerId != null && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('lostpointercapture', () => { isDragging = false; canvas.classList.remove('is-dragging'); });

  stage.addEventListener('wheel', event => {
    if (!renderer) return;
    event.preventDefault();
    setZoom(currentZoom + (event.deltaY < 0 ? .06 : -.06));
    userHasInteracted = true;
  }, { passive: false });

  root.addEventListener('configurator:change', event => {
    selected = { ...selected, ...(event.detail || {}) };
    buildProduct();
  });

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();
  buildProduct();
  stage.classList.add('webgl-ready');
  if (status) status.textContent = 'Потяните модель · 360° обзор';
  updateAngleUI();

  const animate = now => {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    if (!reducedMotion && !userHasInteracted && !isDragging) {
      model.rotation.y += delta * .13;
    }
    // Очень лёгкое дыхание модели, только пока пользователь не управляет видом.
    if (!reducedMotion && !isDragging) {
      model.position.y = Math.sin(now * .00075) * .025;
    }
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);

  window.addEventListener('pagehide', () => {
    disposed = true;
    resizeObserver.disconnect();
    renderer.dispose();
    shadowTexture.dispose();
  }, { once: true });
});
