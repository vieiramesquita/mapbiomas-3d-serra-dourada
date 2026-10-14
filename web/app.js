/**
 * MapBiomas 3D - Parque Estadual da Serra Dourada (Goiás)
 * Interactive Three.js WebGL Terrain Viewer with Satellite, MapBiomas & Procedural 3D Props
 */

// Application State
const state = {
  metadata: null,
  elevationBuffer: null,
  classesBuffer: null,
  exaggeration: 1.0,
  sunAzimuth: 315,
  sunElevation: 30,
  activeLayer: 'blend', // 'satellite', 'blend', 'mapbiomas', 'hypsometric'
  mapbiomasOpacity: 0.65,
  satResolution: '8k', // '4k', '8k', '12k'
  turntable: false,
  wireframe: false,
  demDimensions: { width: 1650, height: 847 },
  terrainSpan: { width: 200, height: 102.6 },
  baseHeight: 2.82424, // 1:1 Real Metric Scale (699m / 49500m * 200 = 2.82424 Three.js units)
  props: {
    enabled: true,
    castShadows: true,
    scale: 1.0,
    density: 1.0, // Multiplicador de densidade de vegetação e props por pixel (1.0x, 1.5x, 2.0x, 2.5x)
    categories: {
      forest: true,
      cerrado: true,
      rocks: true,
      pasture: true,
      silviculture: true,
      grassland: true,
      urban: true,
      soybean: true,
      tempcrops: true,
      wetland: true,
      bare: true,
      water: true,
      cattle: true,
      machinery: true
    }
  }
};

let scene, camera, renderer, controls;
let terrainMesh, overlayMesh, terrainGeometry, rawElevations, rawClasses;
let propsGroup;
const propLayers = {}; // { forest: { mesh, items }, ... }
let sunLight, ambientLight;
let sky, sunVector, cloudMesh;
let textures = {};

// DOM Elements
const progressBar = document.getElementById('progress-bar');
const loadingStatus = document.getElementById('loading-status');
const loadingOverlay = document.getElementById('loading-overlay');
const sliderExaggeration = document.getElementById('slider-exaggeration');
const valExaggeration = document.getElementById('val-exaggeration');
const sliderSunAzimuth = document.getElementById('slider-sun-azimuth');
const valSunAzimuth = document.getElementById('val-sun-azimuth');
const sliderSunElevation = document.getElementById('slider-sun-elevation');
const valSunElevation = document.getElementById('val-sun-elevation');
const sliderOpacity = document.getElementById('slider-opacity');
const valOpacity = document.getElementById('val-opacity');
const compassRose = document.getElementById('compass-rose');
const compassWidget = document.getElementById('compass-widget');
const btnResetView = document.getElementById('btn-reset-view');
const checkTurntable = document.getElementById('check-turntable');
const checkWireframe = document.getElementById('check-wireframe');
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const controlPanel = document.getElementById('control-panel');
const btnShowPanel = document.getElementById('btn-show-panel');
const legendPanel = document.getElementById('legend-panel');
const btnToggleLegend = document.getElementById('btn-toggle-legend');
const btnShowLegend = document.getElementById('btn-show-legend');
const btnToggleAllMenus = document.getElementById('btn-toggle-all-menus');
const labelToggleAll = document.getElementById('label-toggle-all');
const iconToggleAll = document.getElementById('icon-toggle-all');
const legendContainer = document.getElementById('legend-items-container');

// Props DOM Elements
const checkProps = document.getElementById('check-props');
const checkPropsShadows = document.getElementById('check-props-shadows');
const sliderPropScale = document.getElementById('slider-prop-scale');
const valPropScale = document.getElementById('val-prop-scale');
const badgePropsCount = document.getElementById('badge-props-count');
const btnIncreaseDensity = document.getElementById('btn-increase-density');
const valPropDensity = document.getElementById('val-prop-density');
const badgeDensityNext = document.getElementById('badge-density-next');

// 1. Boot Application
window.addEventListener('DOMContentLoaded', init);

async function init() {
  updateProgress(10, 'Carregando metadados geográficos...');
  
  try {
    const metaResp = await fetch('public/metadata.json');
    state.metadata = await metaResp.json();
    if (state.metadata && state.metadata.elevation) {
      const realWidthM = state.metadata.width * (state.metadata.res_x || 30.0);
      state.baseHeight = state.metadata.elevation.span_m * (state.terrainSpan.width / realWidthM);
    }
    populateHUDMetadata(state.metadata);

    updateProgress(25, 'Inicializando motor 3D...');
    initThreeScene();

    updateProgress(40, 'Carregando imagens de satélite e MapBiomas...');
    await loadTextures();

    updateProgress(55, 'Carregando classes de cobertura do MapBiomas (Col. 11)...');
    await loadClassesData();

    updateProgress(70, 'Carregando malha altimétrica do relevo (DEM Copernicus)...');
    await loadElevationData();

    updateProgress(82, 'Construindo terreno 3D e calculando normais...');
    buildTerrainMesh();

    updateProgress(92, 'Distribuindo vegetação, rochas e props 3D procedurais...');
    buildPropsMeshes();

    updateProgress(100, 'Pronto!');
    setTimeout(() => {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
    }, 300);

    setupEventListeners();
    animate();

    const urlParams = new URLSearchParams(window.location.search);
    const layerParam = urlParams.get('layer');
    if (layerParam) {
      state.activeLayer = layerParam;
      document.querySelectorAll('#btn-group-layer .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layer === layerParam);
      });
      applyLayerMode();
    }
    const resParam = urlParams.get('res');
    if (resParam && ['4k', '8k', '12k'].includes(resParam.toLowerCase())) {
      setTimeout(() => setSatelliteResolution(resParam.toLowerCase()), 300);
    }
    const viewParam = urlParams.get('view');
    if (viewParam) {
      setTimeout(() => setCameraPreset(viewParam), 400);
    }
    const statsParam = urlParams.get('stats');
    if (statsParam) {
      setTimeout(() => {
        const m = document.getElementById('modal-stats');
        if (m) m.classList.add('active');
      }, 500);
    }

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = 'Erro ao carregar dados: ' + err.message;
    loadingStatus.style.color = '#ef4444';
  }
}

function updateProgress(pct, msg) {
  if (progressBar) progressBar.style.width = pct + '%';
  if (loadingStatus) loadingStatus.textContent = msg;
}

// 2. Populate HUD from metadata.json
function populateHUDMetadata(meta) {
  document.getElementById('stat-relief').textContent = meta.elevation.span_m.toLocaleString('pt-BR') + ' m';
  document.getElementById('stat-max-elev').textContent = meta.elevation.max_m.toLocaleString('pt-BR') + ' m';
  document.getElementById('legend-total-classes').textContent = meta.classes.length + ' classes';

  const statTotalArea = document.getElementById('stat-total-area');
  if (statTotalArea && meta.statistics) {
    statTotalArea.textContent = meta.statistics.total_area_ha.toLocaleString('pt-BR') + ' ha';
  }

  legendContainer.innerHTML = '';
  meta.classes.forEach(c => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.classId = c.id;
    const haText = c.area_ha ? c.area_ha.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ha' : '';
    item.innerHTML = `
      <div class="legend-item-left">
        <div class="color-swatch" style="background-color: ${c.hex};"></div>
        <span class="class-name" title="${c.name_pt}">${c.name_pt}</span>
      </div>
      <div class="legend-item-right">
        <span class="class-pct">${c.percentage.toFixed(1)}%</span>
        ${haText ? `<span class="class-ha">${haText}</span>` : ''}
      </div>
    `;
    legendContainer.appendChild(item);
  });

  populateStatsModal(meta);
}

// Preenchimento dinâmico do Modal de Estatísticas Territoriais
function populateStatsModal(meta) {
  if (!meta || !meta.statistics) return;
  const stats = meta.statistics;

  // 1. KPI Cards
  const kpiTotalHa = document.getElementById('kpi-total-ha');
  const kpiTotalKm2 = document.getElementById('kpi-total-km2');
  if (kpiTotalHa) kpiTotalHa.textContent = stats.total_area_ha.toLocaleString('pt-BR') + ' ha';
  if (kpiTotalKm2) kpiTotalKm2.textContent = `${stats.total_area_km2.toLocaleString('pt-BR')} km² • ${stats.total_pixels.toLocaleString('pt-BR')} px (30m)`;

  const grpMap = {};
  stats.groups.forEach(g => { grpMap[g.name] = g; });

  const agro = grpMap['Agropecuária'];
  if (agro) {
    const elHa = document.getElementById('kpi-agro-ha');
    const elPct = document.getElementById('kpi-agro-pct');
    if (elHa) elHa.textContent = agro.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${agro.percentage.toFixed(2)}% do território`;
  }

  const nativa = grpMap['Vegetação Nativa'];
  if (nativa) {
    const elHa = document.getElementById('kpi-native-ha');
    const elPct = document.getElementById('kpi-native-pct');
    if (elHa) elHa.textContent = nativa.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${nativa.percentage.toFixed(2)}% do território`;
  }

  const urban = grpMap['Áreas Não Vegetadas'];
  if (urban) {
    const elHa = document.getElementById('kpi-urban-ha');
    const elPct = document.getElementById('kpi-urban-pct');
    if (elHa) elHa.textContent = urban.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${urban.percentage.toFixed(2)}% (Urbano & Exposto)`;
  }

  const agua = grpMap['Corpos Hídricos'];
  if (agua) {
    const elHa = document.getElementById('kpi-water-ha');
    const elPct = document.getElementById('kpi-water-pct');
    if (elHa) elHa.textContent = agua.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${agua.percentage.toFixed(2)}% (Rios & Represas)`;
  }

  // 2. Barra de Distribuição Macrogrupal
  const distBar = document.getElementById('distribution-bar');
  const distLegend = document.getElementById('distribution-legend');
  if (distBar && distLegend) {
    distBar.innerHTML = '';
    distLegend.innerHTML = '';
    stats.groups.forEach(g => {
      const seg = document.createElement('div');
      seg.className = 'dist-segment';
      seg.style.width = g.percentage + '%';
      seg.style.backgroundColor = g.color;
      seg.title = `${g.name}: ${g.percentage.toFixed(2)}% (${g.area_ha.toLocaleString('pt-BR')} ha)`;
      distBar.appendChild(seg);

      const leg = document.createElement('div');
      leg.className = 'dist-legend-item';
      leg.innerHTML = `
        <span class="dist-legend-dot" style="background-color: ${g.color};"></span>
        <span class="dist-legend-label">${g.name}:</span>
        <span class="dist-legend-val">${g.percentage.toFixed(1)}% <span style="font-weight: 400; color: var(--text-muted); font-size: 11px;">(${g.area_ha.toLocaleString('pt-BR')} ha)</span></span>
      `;
      distLegend.appendChild(leg);
    });
  }

  // 3. Tabela Completa de Todas as 13 Classes
  const tbody = document.getElementById('stats-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    meta.classes.forEach(c => {
      const tr = document.createElement('tr');
      const grpColor = c.group === 'Vegetação Nativa' ? '#10b981' :
                       c.group === 'Agropecuária' ? '#f59e0b' :
                       c.group === 'Corpos Hídricos' ? '#3b82f6' : '#ef4444';
      tr.innerHTML = `
        <td>
          <div class="class-cell">
            <div class="color-swatch" style="background-color: ${c.hex};"></div>
            <span>${c.name_pt}</span>
          </div>
        </td>
        <td style="color: var(--text-muted); font-weight: 600;">${c.id}</td>
        <td>
          <span class="group-tag" style="background: ${grpColor}22; color: ${grpColor}; border: 1px solid ${grpColor}44;">
            ${c.group || 'Geral'}
          </span>
        </td>
        <td class="num-col">${c.count.toLocaleString('pt-BR')}</td>
        <td class="num-col" style="font-weight: 600; color: #fff;">${(c.area_ha || c.count * 0.09).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
        <td class="num-col">${(c.area_km2 || (c.count * 0.09) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="num-col" style="font-weight: 700; color: var(--accent-green);">${c.percentage.toFixed(2)}%</td>
        <td>
          <div class="pct-bar-bg" title="${c.percentage.toFixed(2)}%">
            <div class="pct-bar-fill" style="width: ${Math.min(100, Math.max(1, c.percentage * 1.8))}%; background-color: ${c.hex};"></div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Criador procedural de textura de nuvens tropicais
function createCloudTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 45; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 40 + Math.random() * 65;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const alpha = 0.08 + Math.random() * 0.12;
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.5, `rgba(248, 252, 255, ${alpha * 0.45})`);
    grad.addColorStop(1, 'rgba(240, 248, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

// 3. Initialize Three.js Viewport
function initThreeScene() {
  const container = document.getElementById('canvas-container');
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();

  // Céu Atmosférico Físico (Preetham / Hosek-Wilkie model via THREE.Sky)
  if (typeof THREE.Sky !== 'undefined') {
    sky = new THREE.Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 6.0;
    skyUniforms['rayleigh'].value = 1.25;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    sunVector = new THREE.Vector3();
  }

  // Neblina atmosférica no horizonte (harmonizada com o céu do Cerrado)
  scene.fog = new THREE.FogExp2(0xb6d5ec, 0.0016);

  // Camada de nuvens cúmulus de alta altitude
  const cloudGeo = new THREE.PlaneGeometry(850, 850);
  const cloudMat = new THREE.MeshBasicMaterial({
    map: createCloudTexture(),
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.rotation.x = -Math.PI / 2;
  cloudMesh.position.set(0, 52, 0);
  scene.add(cloudMesh);

  camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 2000);
  camera.position.set(-30, 22, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 450;
  controls.target.set(10, 1.6, 5);

  // Lighting
  ambientLight = new THREE.HemisphereLight(0xdde9ff, 0x1a2130, 0.65);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xfff3db, 2.3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 400;
  const d = 110;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  updateSunPosition();
  window.addEventListener('resize', onWindowResize);
}

// Update Sun Direction and Atmospheric Colors
function updateSunPosition() {
  const azRad = THREE.MathUtils.degToRad(state.sunAzimuth);
  const elRad = THREE.MathUtils.degToRad(state.sunElevation);
  const dist = 140;

  const x = dist * Math.cos(elRad) * Math.sin(azRad);
  const y = dist * Math.sin(elRad);
  const z = dist * Math.cos(elRad) * Math.cos(azRad);

  sunLight.position.set(x, y, z);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  if (sky && sky.material.uniforms['sunPosition'] && sunVector) {
    sunVector.set(x, Math.max(0.01, y), z).normalize();
    sky.material.uniforms['sunPosition'].value.copy(sunVector);
  }

  // Neblina dinâmica e iluminação ambiente adaptativa (alvorada/poente vs meio-dia)
  const elevNorm = Math.max(0, Math.min(1, state.sunElevation / 45));
  const sunsetFog = new THREE.Color(0xe89e70);
  const middayFog = new THREE.Color(0xb2d2ea);
  const currentFog = new THREE.Color().lerpColors(sunsetFog, middayFog, elevNorm);

  if (scene.fog) {
    scene.fog.color.copy(currentFog);
  }

  if (ambientLight) {
    const skyAmb = new THREE.Color().lerpColors(new THREE.Color(0xffbf88), new THREE.Color(0xdceaff), elevNorm);
    const groundAmb = new THREE.Color().lerpColors(new THREE.Color(0x3a2214), new THREE.Color(0x223026), elevNorm);
    ambientLight.color.copy(skyAmb);
    ambientLight.groundColor.copy(groundAmb);
    ambientLight.intensity = 0.45 + elevNorm * 0.35;
  }

  if (sunLight) {
    const sunColor = new THREE.Color().lerpColors(new THREE.Color(0xffaa5e), new THREE.Color(0xfffaed), elevNorm);
    sunLight.color.copy(sunColor);
    sunLight.intensity = 1.3 + elevNorm * 1.2;
  }
}

// 4. Load Textures (Satellite + MapBiomas + Hypsometric + Detail Normal)
async function loadTextures() {
  const loader = new THREE.TextureLoader();

  const loadTex = (url) => new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  // Load Satellite Imagery Texture (8K Ultra-Sharp Baseline: 8192 x 4205 px)
  const satTex = await loadTex('public/satellite_texture_8k.jpg');
  satTex.generateMipmaps = true;
  satTex.minFilter = THREE.LinearMipmapLinearFilter;
  satTex.magFilter = THREE.LinearFilter;
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  satTex.anisotropy = maxAniso;
  textures.satellite = satTex;
  textures.sat8k = satTex;

  // Load MapBiomas Classes Texture
  const mbTex = await loadTex('public/mapbiomas_texture.png');
  mbTex.generateMipmaps = true;
  mbTex.minFilter = THREE.LinearMipmapLinearFilter;
  mbTex.magFilter = THREE.LinearFilter;
  mbTex.anisotropy = maxAniso;
  textures.mapbiomas = mbTex;

  // Procedural hypsometric texture
  textures.hypsometric = generateHypsometricTexture();

  // Procedural detail normal map for micro-topography & pasture grass relief
  textures.normalDetail = generateTerrainNormalMap();
}

function generateHypsometricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 255, 0, 0);

  grad.addColorStop(0.00, '#155e37'); // 360m (Matas e vales)
  grad.addColorStop(0.25, '#4ade80'); // 500m (Savana e cerrado)
  grad.addColorStop(0.50, '#facc15'); // 700m (Encostas)
  grad.addColorStop(0.75, '#ea580c'); // 900m (Platôs rochosos)
  grad.addColorStop(0.92, '#78350f'); // 1000m (Escarpa de quartzo)
  grad.addColorStop(1.00, '#f8fafc'); // 1060m (Picos)

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function generateTerrainNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Gerador de relevo microtopográfico de campo e lâminas de pasto
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4;
      const g1 = Math.sin(x * 0.22) * Math.cos(y * 0.22) * 14;
      const g2 = Math.sin(x * 0.07 + y * 0.05) * 10;
      const g3 = (Math.sin(x * 0.55) + Math.cos(y * 0.55)) * 6;
      const nx = g1 + g2 + g3 + 128;
      const ny = (Math.cos(x * 0.22) * Math.sin(y * 0.22) * 14 + g2 + g3) + 128;

      data[idx] = Math.min(255, Math.max(0, nx));
      data[idx + 1] = Math.min(255, Math.max(0, ny));
      data[idx + 2] = 246;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 24);
  return tex;
}

// 5. Load Binary Classes & Elevation Buffers
async function loadClassesData() {
  const resp = await fetch('public/classes.bin');
  const buffer = await resp.arrayBuffer();
  rawClasses = new Uint8Array(buffer);
}

async function loadElevationData() {
  const resp = await fetch('public/elevation.bin');
  const buffer = await resp.arrayBuffer();
  rawElevations = new Float32Array(buffer);
}

// 6. Bilinear DEM Elevation Interpolation: garante relevo e instâncias assentadas com precisão contínua
function getBilinearElevation(normU, normV, demW, demH) {
  const fx = Math.max(0, Math.min(demW - 1, normU * (demW - 1)));
  const fz = Math.max(0, Math.min(demH - 1, normV * (demH - 1)));
  const x0 = Math.floor(fx);
  const x1 = Math.min(demW - 1, x0 + 1);
  const z0 = Math.floor(fz);
  const z1 = Math.min(demH - 1, z0 + 1);
  const dx = fx - x0;
  const dz = fz - z0;

  const e00 = rawElevations[z0 * demW + x0] || 0.0;
  const e10 = rawElevations[z0 * demW + x1] || 0.0;
  const e01 = rawElevations[z1 * demW + x0] || 0.0;
  const e11 = rawElevations[z1 * demW + x1] || 0.0;

  return (e00 * (1 - dx) + e10 * dx) * (1 - dz) + (e01 * (1 - dx) + e11 * dx) * dz;
}

// 7. Build 3D Terrain Meshes (Base Satellite + Overlaid MapBiomas)
// Malha de alta fidelidade: 825x423 segmentos (350.000+ vértices) para reproduzir microtopografia nítida
function buildTerrainMesh() {
  const segW = 825;
  const segH = 423;
  const geoW = state.terrainSpan.width;
  const geoH = state.terrainSpan.height;

  terrainGeometry = new THREE.PlaneGeometry(geoW, geoH, segW, segH);
  terrainGeometry.rotateX(-Math.PI / 2);

  const posAttr = terrainGeometry.attributes.position;
  const count = posAttr.count;

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (let i = 0; i < count; i++) {
    const col = i % (segW + 1);
    const row = Math.floor(i / (segW + 1));
    const normU = col / segW;
    const normV = row / segH;
    const normElev = getBilinearElevation(normU, normV, demW, demH);
    const heightVal = normElev * state.baseHeight * state.exaggeration;
    posAttr.setY(i, heightVal);
  }

  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  // Base Terrain Mesh (Satellite)
  const baseMat = new THREE.MeshStandardMaterial({
    map: textures.satellite,
    normalMap: textures.normalDetail,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.80,
    metalness: 0.04,
    wireframe: state.wireframe
  });

  terrainMesh = new THREE.Mesh(terrainGeometry, baseMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Overlay Mesh (MapBiomas with variable opacity)
  const overlayMat = new THREE.MeshStandardMaterial({
    map: textures.mapbiomas,
    normalMap: textures.normalDetail,
    normalScale: new THREE.Vector2(0.5, 0.5),
    transparent: true,
    opacity: state.mapbiomasOpacity,
    roughness: 0.80,
    metalness: 0.04,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  overlayMesh = new THREE.Mesh(terrainGeometry, overlayMat);
  overlayMesh.receiveShadow = true;
  scene.add(overlayMesh);

  addTerrainBase(geoW, geoH);
  applyLayerMode();
}

function addTerrainBase(w, h) {
  const boxGeo = new THREE.BoxGeometry(w + 0.6, 0.6, h + 0.6);
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x111624,
    roughness: 0.95,
    metalness: 0.1
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.y = -0.32;
  box.receiveShadow = true;
  scene.add(box);
}

// ====================================================================
// Gerador de Modelos 3D Sólidos Procedurais (Botânica & Arquitetura)
// Escala 1:1 Métrica Real (1 metro = 0.00404 Three.js units) com Cores por Vértice
// ====================================================================

function createColoredGeometry(parts) {
  const nonIndexedParts = parts.map(p => {
    const non = p.geo.toNonIndexed();
    const count = non.attributes.position.count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = p.color[0];
      cols[i * 3 + 1] = p.color[1];
      cols[i * 3 + 2] = p.color[2];
    }
    non.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return non;
  });

  if (window.THREE && THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeBufferGeometries) {
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(nonIndexedParts, false);
    if (merged) {
      merged.computeVertexNormals();
      return merged;
    }
  }
  return nonIndexedParts[0];
}

// 1. Árvore da Mata Tropical / Floresta Estacional & Galeria (ID 3)
function createTropicalTree3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.0035, 0.0055, 0.038, 5);
  trunk.translate(0, 0.019, 0);

  const lobe1 = new THREE.DodecahedronGeometry(0.024, 0);
  lobe1.scale(1.2, 0.75, 1.1);
  lobe1.translate(0, 0.046, 0);

  const lobe2 = new THREE.DodecahedronGeometry(0.020, 0);
  lobe2.scale(1.0, 0.75, 1.0);
  lobe2.translate(0.003, 0.060, -0.002);

  const lobe3 = new THREE.DodecahedronGeometry(0.015, 0);
  lobe3.scale(0.9, 0.8, 0.9);
  lobe3.translate(-0.002, 0.072, 0.002);

  return createColoredGeometry([
    { geo: trunk, color: [0.26, 0.17, 0.11] },
    { geo: lobe1, color: [0.11, 0.36, 0.18] },
    { geo: lobe2, color: [0.15, 0.48, 0.23] },
    { geo: lobe3, color: [0.22, 0.58, 0.28] }
  ]);
}

// 2. Árvore do Cerrado Típico (ID 4 - Formação Savânica)
function createCerradoTree3DGeo() {
  const trunkLower = new THREE.CylinderGeometry(0.003, 0.0045, 0.015, 5);
  trunkLower.rotateZ(0.12);
  trunkLower.translate(0.001, 0.0075, 0);

  const trunkUpper = new THREE.CylinderGeometry(0.002, 0.003, 0.014, 5);
  trunkUpper.rotateZ(-0.22);
  trunkUpper.rotateX(0.15);
  trunkUpper.translate(-0.002, 0.019, 0.001);

  const crown1 = new THREE.DodecahedronGeometry(0.015, 0);
  crown1.scale(1.3, 0.55, 1.1);
  crown1.translate(0.004, 0.026, 0.002);

  const crown2 = new THREE.DodecahedronGeometry(0.012, 0);
  crown2.scale(1.1, 0.50, 1.0);
  crown2.translate(-0.006, 0.029, -0.003);

  return createColoredGeometry([
    { geo: trunkLower, color: [0.36, 0.26, 0.18] },
    { geo: trunkUpper, color: [0.32, 0.23, 0.15] },
    { geo: crown1,     color: [0.30, 0.50, 0.20] },
    { geo: crown2,     color: [0.38, 0.58, 0.25] }
  ]);
}

// 3. Arbusto Denso do Cerrado (ID 4)
function createCerradoShrub3DGeo() {
  const mound1 = new THREE.DodecahedronGeometry(0.009, 0);
  mound1.scale(1.3, 0.7, 1.2);
  mound1.translate(0, 0.006, 0);

  const mound2 = new THREE.DodecahedronGeometry(0.007, 0);
  mound2.scale(1.0, 0.65, 1.0);
  mound2.translate(0.003, 0.011, -0.002);

  return createColoredGeometry([
    { geo: mound1, color: [0.28, 0.46, 0.18] },
    { geo: mound2, color: [0.36, 0.56, 0.24] }
  ]);
}

// 4. Silvicultura / Eucalipto (ID 9)
function createEucalyptus3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.002, 0.003, 0.080, 5);
  trunk.translate(0, 0.040, 0);

  const crown = new THREE.ConeGeometry(0.011, 0.050, 6);
  crown.translate(0, 0.095, 0);

  return createColoredGeometry([
    { geo: trunk, color: [0.75, 0.74, 0.70] },
    { geo: crown, color: [0.18, 0.38, 0.24] }
  ]);
}

// 5. Afloramento Rochoso e Campo Rupestre (ID 29)
function createQuartziteRock3DGeo() {
  const rock1 = new THREE.DodecahedronGeometry(0.015, 0);
  rock1.scale(1.4, 0.8, 1.1);
  rock1.rotateX(0.3);
  rock1.rotateZ(0.25);
  rock1.translate(0, 0.011, 0);

  const rock2 = new THREE.BoxGeometry(0.014, 0.012, 0.016);
  rock2.rotateY(0.7);
  rock2.rotateZ(-0.35);
  rock2.translate(0.007, 0.009, -0.005);

  const plant = new THREE.ConeGeometry(0.004, 0.009, 5);
  plant.translate(-0.009, 0.018, 0.004);

  return createColoredGeometry([
    { geo: rock1, color: [0.68, 0.54, 0.42] },
    { geo: rock2, color: [0.58, 0.48, 0.38] },
    { geo: plant, color: [0.28, 0.44, 0.20] }
  ]);
}

// 6. Pastagem / Capim Braquiária 3D Sólido (ID 15 & 21)
// Módulo leve low-poly com base abaulada e lâminas cônicas (14 polígonos)
function create3DPastureTuftGeo() {
  const mound = new THREE.CylinderGeometry(0.007, 0.018, 0.005, 6);
  mound.translate(0, 0.0025, 0);

  const blade1 = new THREE.ConeGeometry(0.007, 0.012, 4);
  blade1.rotateZ(0.14);
  blade1.translate(0.002, 0.0075, 0.001);

  const blade2 = new THREE.ConeGeometry(0.005, 0.009, 4);
  blade2.rotateZ(-0.16);
  blade2.translate(-0.003, 0.0065, -0.002);

  return createColoredGeometry([
    { geo: mound,  color: [0.32, 0.52, 0.18] }, // Base verde densa
    { geo: blade1, color: [0.42, 0.64, 0.24] }, // Ponta iluminada
    { geo: blade2, color: [0.36, 0.58, 0.20] }  // Sombra natural
  ]);
}

// 7. Campo Nativo / Formação Campestre (ID 12)
function createGrasslandNative3DGeo() {
  const base = new THREE.DodecahedronGeometry(0.009, 0);
  base.scale(1.1, 0.5, 1.1);
  base.translate(0, 0.0035, 0);

  const plume = new THREE.ConeGeometry(0.005, 0.014, 5);
  plume.translate(0, 0.011, 0);

  return createColoredGeometry([
    { geo: base,  color: [0.38, 0.48, 0.20] },
    { geo: plume, color: [0.72, 0.66, 0.40] }
  ]);
}

// 8. Soja (ID 39 - Formação Agrícola 3.2.1.1)
// Módulos de fileiras de cultivo contínuas e densas sobre solo preparado (sulcos de semeadura)
function createSoybeanCrop3DGeo() {
  const rowBase = new THREE.BoxGeometry(0.026, 0.002, 0.011);
  rowBase.translate(0, 0.001, 0);

  const bush1 = new THREE.DodecahedronGeometry(0.0068, 0);
  bush1.scale(1.4, 0.8, 1.15);
  bush1.translate(-0.0065, 0.004, 0);

  const bush2 = new THREE.DodecahedronGeometry(0.0072, 0);
  bush2.scale(1.45, 0.85, 1.15);
  bush2.translate(0.0065, 0.004, 0);

  return createColoredGeometry([
    { geo: rowBase, color: [0.34, 0.24, 0.16] }, // Solo agrícola preparado / sulco de plantio
    { geo: bush1,   color: [0.28, 0.52, 0.15] }, // Folhagem de soja viçosa
    { geo: bush2,   color: [0.36, 0.60, 0.19] }  // Folhagem iluminada pelo sol
  ]);
}

// 9. Outras Lavouras Temporárias / Milho e Grãos (ID 41 - 3.2.1.5)
// Colmos e talhões agrícolas com pendão amarelo (altura real ~1.8m)
function createTemporaryCrop3DGeo() {
  const stalk1 = new THREE.CylinderGeometry(0.001, 0.0015, 0.014, 4);
  stalk1.translate(-0.004, 0.007, 0);

  const stalk2 = new THREE.CylinderGeometry(0.001, 0.0015, 0.016, 4);
  stalk2.translate(0.004, 0.008, 0);

  const leaves = new THREE.ConeGeometry(0.007, 0.012, 5);
  leaves.translate(0, 0.011, 0);

  const tassel = new THREE.ConeGeometry(0.003, 0.007, 4);
  tassel.translate(0.002, 0.018, 0);

  return createColoredGeometry([
    { geo: stalk1, color: [0.36, 0.52, 0.18] },
    { geo: stalk2, color: [0.38, 0.56, 0.20] },
    { geo: leaves, color: [0.42, 0.62, 0.22] },
    { geo: tassel, color: [0.78, 0.66, 0.25] } // Pendão dourado
  ]);
}

// 10. Palmeira Buriti das Veredas Pantanosas (ID 11 - Mauritia flexuosa)
// Estipe alto esguio (~14m real) e copa circular em leque com vegetação paludosa
function createBuritiPalm3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.0025, 0.0038, 0.052, 5);
  trunk.translate(0, 0.026, 0);

  const crown1 = new THREE.DodecahedronGeometry(0.016, 0);
  crown1.scale(1.3, 0.55, 1.3);
  crown1.translate(0, 0.054, 0);

  const crown2 = new THREE.ConeGeometry(0.014, 0.012, 6);
  crown2.rotateX(Math.PI);
  crown2.translate(0, 0.057, 0);

  const wetlandSedge = new THREE.ConeGeometry(0.008, 0.008, 5);
  wetlandSedge.translate(0, 0.004, 0);

  return createColoredGeometry([
    { geo: trunk,        color: [0.38, 0.32, 0.25] }, // Estipe cinza-castanho
    { geo: crown1,       color: [0.18, 0.44, 0.16] }, // Frondes em leque
    { geo: crown2,       color: [0.25, 0.55, 0.20] }, // Folhas superiores
    { geo: wetlandSedge, color: [0.20, 0.45, 0.30] }  // Vegetação paludosa basal
  ]);
}

// 11. Solo Exposto & Não Vegetado (ID 25 - Terras Vermelhas / Cascalheiras)
// Módulos facetados baixos de solo laterítico e cascalho
function createBareGround3DGeo() {
  const mound = new THREE.DodecahedronGeometry(0.008, 0);
  mound.scale(1.6, 0.35, 1.5);
  mound.translate(0, 0.003, 0);

  const gravel1 = new THREE.BoxGeometry(0.006, 0.004, 0.006);
  gravel1.rotateY(0.4);
  gravel1.translate(-0.003, 0.003, 0.002);

  const gravel2 = new THREE.DodecahedronGeometry(0.004, 0);
  gravel2.translate(0.004, 0.003, -0.002);

  return createColoredGeometry([
    { geo: mound,   color: [0.72, 0.36, 0.22] }, // Solo laterítico vermelho-terracota
    { geo: gravel1, color: [0.55, 0.28, 0.18] }, // Cascalho ferroso escuro
    { geo: gravel2, color: [0.82, 0.54, 0.36] }  // Solo seco claro
  ]);
}

// 12. Corpos Hídricos / Rio e Margem Ripária (ID 33)
// Pedras de leito polidas pela água e juncos ripários
function createRiverBank3DGeo() {
  const stone1 = new THREE.DodecahedronGeometry(0.008, 0);
  stone1.scale(1.5, 0.45, 1.1);
  stone1.translate(0, 0.003, 0);

  const stone2 = new THREE.DodecahedronGeometry(0.006, 0);
  stone2.scale(1.2, 0.40, 1.3);
  stone2.translate(0.005, 0.003, -0.003);

  const reed = new THREE.ConeGeometry(0.003, 0.012, 4);
  reed.translate(-0.005, 0.007, 0.003);

  return createColoredGeometry([
    { geo: stone1, color: [0.28, 0.35, 0.42] }, // Rocha úmida ardósia/seixo
    { geo: stone2, color: [0.35, 0.42, 0.48] }, // Seixo fluvial polido
    { geo: reed,   color: [0.18, 0.48, 0.32] }  // Junco ripário / taboa
  ]);
}

// 1. Casa Térrea Colonial Goiana Autêntica (Típica de Goiás Velho)
// Embasamento de pedra (soco de cantaria), paredes caiadas/coloridas, portas e janelas com molduras, beiral largo e telhado de duas águas em telha de barro cerâmica com cumeeira
function createDetailedColonialHouseGeo(colorStyle = 0) {
  // Soco / embasamento de cantaria de pedra na linha de terra
  const plinth = new THREE.BoxGeometry(0.040, 0.003, 0.034);
  plinth.translate(0, 0.0015, 0);

  // Paredes principais de adobe/alvenaria colonial
  const walls = new THREE.BoxGeometry(0.038, 0.016, 0.032);
  walls.translate(0, 0.0095, 0);

  // Porta colonial alta de madeira nobre
  const door = new THREE.BoxGeometry(0.0065, 0.0125, 0.0012);
  door.translate(0, 0.0075, 0.0161);

  // Verga / bandeira da porta
  const doorFrame = new THREE.BoxGeometry(0.008, 0.002, 0.0015);
  doorFrame.translate(0, 0.0142, 0.0161);

  // Duas janelas coloniais de madeira com molduras almofadadas
  const winL = new THREE.BoxGeometry(0.006, 0.0075, 0.0012);
  winL.translate(-0.011, 0.010, 0.0161);

  const winR = new THREE.BoxGeometry(0.006, 0.0075, 0.0012);
  winR.translate(0.011, 0.010, 0.0161);

  // Beiral de madeira saliente (cimalha colonial)
  const eaves = new THREE.BoxGeometry(0.043, 0.0016, 0.036);
  eaves.translate(0, 0.0175, 0);

  // Telhado Colonial de Duas Águas com Telhas Cerâmicas e Cumeeira
  const roofPitchFront = new THREE.BoxGeometry(0.043, 0.002, 0.021);
  roofPitchFront.rotateX(0.40);
  roofPitchFront.translate(0, 0.0215, 0.0095);

  const roofPitchBack = new THREE.BoxGeometry(0.043, 0.002, 0.021);
  roofPitchBack.rotateX(-0.40);
  roofPitchBack.translate(0, 0.0215, -0.0095);

  const ridgeCap = new THREE.CylinderGeometry(0.0015, 0.0015, 0.044, 4);
  ridgeCap.rotateZ(Math.PI / 2);
  ridgeCap.translate(0, 0.0260, 0);

  // Paletas de cores coloniais autênticas de Goiás Velho:
  let wallColor = [0.95, 0.95, 0.93]; // Branco caiado
  let frameColor = [0.15, 0.38, 0.62]; // Azul colonial clássico
  if (colorStyle === 1) {
    wallColor = [0.86, 0.62, 0.24];  // Ocre dourado colonial
    frameColor = [0.96, 0.96, 0.96]; // Branco
  } else if (colorStyle === 2) {
    wallColor = [0.95, 0.95, 0.93];  // Branco
    frameColor = [0.18, 0.44, 0.26]; // Verde garrafa colonial
  } else if (colorStyle === 3) {
    wallColor = [0.76, 0.38, 0.32];  // Terracota / Rosa seco colonial
    frameColor = [0.96, 0.96, 0.96]; // Branco
  }

  const stoneColor = [0.46, 0.44, 0.40];      // Cantaria de pedra
  const darkWood = [0.22, 0.14, 0.08];        // Madeira nobre
  const tileColor = [0.74, 0.28, 0.14];       // Telha cerâmica terracota
  const ridgeColor = [0.65, 0.22, 0.10];      // Cumeeira escurecida

  return createColoredGeometry([
    { geo: plinth,         color: stoneColor },
    { geo: walls,          color: wallColor },
    { geo: door,           color: darkWood },
    { geo: doorFrame,      color: frameColor },
    { geo: winL,           color: frameColor },
    { geo: winR,           color: frameColor },
    { geo: eaves,          color: darkWood },
    { geo: roofPitchFront, color: tileColor },
    { geo: roofPitchBack,  color: tileColor },
    { geo: ridgeCap,       color: ridgeColor }
  ]);
}

// 2. Sobrado Histórico Colonial de 2 Pavimentos com Sacadas de Ferro Forjado
// Embasamento de pedra, portas comerciais no térreo, friso divisor, portas-janelas com sacadas trabalhadas no piso superior e telhado de 4 águas
function createDetailedColonialSobradoGeo(colorStyle = 0) {
  const plinth = new THREE.BoxGeometry(0.046, 0.0035, 0.040);
  plinth.translate(0, 0.00175, 0);

  // Pavimento Térreo
  const groundFloor = new THREE.BoxGeometry(0.044, 0.016, 0.038);
  groundFloor.translate(0, 0.0095, 0);

  // 3 Portas coloniais altas no térreo
  const door1 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door1.translate(-0.013, 0.008, 0.0191);
  const door2 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door2.translate(0, 0.008, 0.0191);
  const door3 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door3.translate(0.013, 0.008, 0.0191);

  // Friso / Cinta de cantaria divisória entre pavimentos
  const stringCourse = new THREE.BoxGeometry(0.0455, 0.002, 0.0395);
  stringCourse.translate(0, 0.0185, 0);

  // Segundo Pavimento
  const upperFloor = new THREE.BoxGeometry(0.044, 0.016, 0.038);
  upperFloor.translate(0, 0.0265, 0);

  // 3 Portas-janelas coloniais altas
  const upperWin1 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin1.translate(-0.013, 0.026, 0.0191);
  const upperWin2 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin2.translate(0, 0.026, 0.0191);
  const upperWin3 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin3.translate(0.013, 0.026, 0.0191);

  // Sacada Corrida com Balcão de Cantaria e Gradil de Ferro Forjado
  const balconySlab = new THREE.BoxGeometry(0.036, 0.0018, 0.006);
  balconySlab.translate(0, 0.019, 0.022);

  const balconyRailing = new THREE.BoxGeometry(0.036, 0.0065, 0.0012);
  balconyRailing.translate(0, 0.023, 0.025);

  // Beiral largo de madeira trabalhada
  const eaves = new THREE.BoxGeometry(0.048, 0.0022, 0.042);
  eaves.translate(0, 0.035, 0);

  // Telhado Colonial de Quatro Águas
  const roof = new THREE.ConeGeometry(0.034, 0.013, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.0415, 0);

  const wallColor = (colorStyle === 1) ? [0.86, 0.64, 0.26] : [0.94, 0.94, 0.92];
  const frameColor = (colorStyle === 1) ? [0.96, 0.96, 0.96] : [0.18, 0.36, 0.58];

  return createColoredGeometry([
    { geo: plinth,         color: [0.44, 0.42, 0.38] },
    { geo: groundFloor,    color: wallColor },
    { geo: door1,          color: [0.22, 0.14, 0.08] },
    { geo: door2,          color: [0.22, 0.14, 0.08] },
    { geo: door3,          color: [0.22, 0.14, 0.08] },
    { geo: stringCourse,   color: [0.38, 0.36, 0.32] },
    { geo: upperFloor,     color: wallColor },
    { geo: upperWin1,      color: frameColor },
    { geo: upperWin2,      color: frameColor },
    { geo: upperWin3,      color: frameColor },
    { geo: balconySlab,    color: [0.44, 0.42, 0.38] },
    { geo: balconyRailing, color: [0.12, 0.12, 0.12] }, // Ferro forjado preto
    { geo: eaves,          color: [0.26, 0.16, 0.10] },
    { geo: roof,           color: [0.70, 0.24, 0.11] }  // Telha cerâmica
  ]);
}

// 3. Igreja / Matriz Barroca Colonial Goiana (Inspirada na Igreja de Sant'Ana / São Francisco de Goiás Velho)
// Monumental adro de pedra com cruzeiro, frontispício barroco detalhado, duas torres sineiras com sinos dourados visíveis e cruz central
function createDetailedColonialChurchGeo() {
  // Grande Adro com Escadaria de Pedra de Quartzito
  const churchyard = new THREE.BoxGeometry(0.080, 0.004, 0.105);
  churchyard.translate(0, 0.002, 0.008);

  // Grande Cruzeiro de Pedra no Adro da Igreja
  const crossPlinth = new THREE.BoxGeometry(0.008, 0.006, 0.008);
  crossPlinth.translate(0, 0.007, 0.042);
  const crossShaft = new THREE.BoxGeometry(0.0016, 0.020, 0.0016);
  crossShaft.translate(0, 0.020, 0.042);
  const crossArm = new THREE.BoxGeometry(0.010, 0.0016, 0.0016);
  crossArm.translate(0, 0.024, 0.042);

  // Nave Principal da Igreja
  const nave = new THREE.BoxGeometry(0.046, 0.034, 0.070);
  nave.translate(0, 0.019, -0.012);

  // Telhado Colonial da Nave
  const naveRoof = new THREE.BoxGeometry(0.050, 0.0025, 0.072);
  naveRoof.translate(0, 0.0365, -0.012);

  // Frontispício Barroco Curvilíneo
  const pediment = new THREE.BoxGeometry(0.028, 0.012, 0.003);
  pediment.translate(0, 0.040, 0.023);

  // Cruz Monumental no Cume do Frontão
  const pedimentCrossShaft = new THREE.BoxGeometry(0.0012, 0.010, 0.0012);
  pedimentCrossShaft.translate(0, 0.050, 0.023);
  const pedimentCrossArm = new THREE.BoxGeometry(0.006, 0.0012, 0.0012);
  pedimentCrossArm.translate(0, 0.052, 0.023);

  // Grande Portal Barroco com Verga em Arco de Madeira Nobre
  const portal = new THREE.BoxGeometry(0.012, 0.018, 0.002);
  portal.translate(0, 0.011, 0.024);

  // Janelões Altos do Coro
  const choirWinL = new THREE.BoxGeometry(0.006, 0.010, 0.0015);
  choirWinL.translate(-0.010, 0.026, 0.024);
  const choirWinR = new THREE.BoxGeometry(0.006, 0.010, 0.0015);
  choirWinR.translate(0.010, 0.026, 0.024);

  // Óculo Barroco Circular
  const oculus = new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8);
  oculus.rotateX(Math.PI / 2);
  oculus.translate(0, 0.031, 0.024);

  // DUAS TORRES SINEIRAS MONUMENTAIS (Esquerda e Direita)
  const towerL = new THREE.BoxGeometry(0.016, 0.056, 0.016);
  towerL.translate(-0.022, 0.028, 0.018);

  const towerR = new THREE.BoxGeometry(0.016, 0.056, 0.016);
  towerR.translate(0.022, 0.028, 0.018);

  // Vãos Vazados das Sineiras (Aberturas em arco escurecidas)
  const belfryArchL = new THREE.BoxGeometry(0.008, 0.011, 0.002);
  belfryArchL.translate(-0.022, 0.046, 0.0261);

  const belfryArchR = new THREE.BoxGeometry(0.008, 0.011, 0.002);
  belfryArchR.translate(0.022, 0.046, 0.0261);

  // Sinos de Bronze Dourado nas Sineiras
  const bellL = new THREE.CylinderGeometry(0.0016, 0.0030, 0.0045, 6);
  bellL.translate(-0.022, 0.046, 0.024);

  const bellR = new THREE.CylinderGeometry(0.0016, 0.0030, 0.0045, 6);
  bellR.translate(0.022, 0.046, 0.024);

  // Cúpulas / Coruchéus das Torres em Telha Cerâmica / Azul Barroco
  const spireL = new THREE.ConeGeometry(0.013, 0.016, 4);
  spireL.rotateY(Math.PI / 4);
  spireL.translate(-0.022, 0.064, 0.018);

  const spireR = new THREE.ConeGeometry(0.013, 0.016, 4);
  spireR.rotateY(Math.PI / 4);
  spireR.translate(0.022, 0.064, 0.018);

  return createColoredGeometry([
    { geo: churchyard,         color: [0.52, 0.50, 0.46] }, // Pedra de quartzito
    { geo: crossPlinth,        color: [0.46, 0.44, 0.40] },
    { geo: crossShaft,         color: [0.38, 0.36, 0.32] },
    { geo: crossArm,           color: [0.38, 0.36, 0.32] },
    { geo: nave,               color: [0.96, 0.96, 0.95] }, // Branco caiado monumental
    { geo: naveRoof,           color: [0.72, 0.25, 0.12] }, // Telha de barro
    { geo: pediment,           color: [0.96, 0.96, 0.95] },
    { geo: pedimentCrossShaft, color: [0.85, 0.72, 0.22] }, // Cruz dourada
    { geo: pedimentCrossArm,   color: [0.85, 0.72, 0.22] },
    { geo: portal,             color: [0.24, 0.14, 0.08] }, // Madeira nobre
    { geo: choirWinL,          color: [0.18, 0.36, 0.58] }, // Moldura azul barroca
    { geo: choirWinR,          color: [0.18, 0.36, 0.58] },
    { geo: oculus,             color: [0.22, 0.38, 0.58] },
    { geo: towerL,             color: [0.96, 0.96, 0.95] },
    { geo: towerR,             color: [0.96, 0.96, 0.95] },
    { geo: belfryArchL,        color: [0.12, 0.12, 0.14] },
    { geo: belfryArchR,        color: [0.12, 0.12, 0.14] },
    { geo: bellL,              color: [0.86, 0.70, 0.24] }, // Bronze dourado
    { geo: bellR,              color: [0.86, 0.70, 0.24] },
    { geo: spireL,             color: [0.18, 0.36, 0.56] }, // Cúpula azul colonial
    { geo: spireR,             color: [0.18, 0.36, 0.56] }
  ]);
}

// 4. Lampião Colonial de Ferro Forjado Goiano
function createColonialLanternGeo() {
  const base = new THREE.CylinderGeometry(0.0016, 0.0022, 0.003, 5);
  base.translate(0, 0.0015, 0);

  const post = new THREE.CylinderGeometry(0.0007, 0.0009, 0.018, 4);
  post.translate(0, 0.011, 0);

  const arm = new THREE.BoxGeometry(0.0035, 0.001, 0.001);
  arm.translate(0.0015, 0.0195, 0);

  const lantern = new THREE.ConeGeometry(0.0022, 0.004, 4);
  lantern.rotateX(Math.PI);
  lantern.translate(0.003, 0.018, 0);

  return createColoredGeometry([
    { geo: base,    color: [0.14, 0.14, 0.14] }, // Ferro fundido
    { geo: post,    color: [0.14, 0.14, 0.14] },
    { geo: arm,     color: [0.14, 0.14, 0.14] },
    { geo: lantern, color: [0.98, 0.76, 0.22] }  // Vidro com luz quente âmbar
  ]);
}

// 5. Árvores dos Quintais e Praças Coloniais de Goiás Velho (Verdes Frondosas, Pomares Densos, Ipês Amarelos e Rosas)
function createColonialYardTreeGeo(treeType = 'green') {
  const trunk = new THREE.CylinderGeometry(0.0022, 0.0038, 0.022, 5);
  trunk.translate(0, 0.011, 0);

  const branch1 = new THREE.CylinderGeometry(0.0012, 0.0018, 0.010, 4);
  branch1.rotateZ(0.35);
  branch1.translate(0.003, 0.018, 0);

  const canopy1 = new THREE.DodecahedronGeometry(0.016, 0);
  canopy1.scale(1.25, 0.85, 1.25);
  canopy1.translate(0, 0.025, 0);

  const canopy2 = new THREE.DodecahedronGeometry(0.011, 0);
  canopy2.translate(0.005, 0.032, -0.003);

  let c1, c2;
  if (treeType === 'deep_green') {
    // Verde profundo / Pomar fechado (Mangueira, Oitizeiro, Jabuticabeira)
    c1 = [0.12, 0.40, 0.16];
    c2 = [0.16, 0.48, 0.20];
  } else if (treeType === 'yellow') {
    // Ipê Amarelo florido tradicional
    c1 = [0.96, 0.78, 0.12];
    c2 = [0.98, 0.84, 0.18];
  } else if (treeType === 'pink') {
    // Ipê Rosa florido tradicional
    c1 = [0.88, 0.38, 0.62];
    c2 = [0.94, 0.48, 0.70];
  } else {
    // Verde Vivo tradicional / Árvore de sombra frondosa dos quintais goianos
    c1 = [0.22, 0.54, 0.22];
    c2 = [0.28, 0.62, 0.26];
  }

  return createColoredGeometry([
    { geo: trunk,   color: [0.32, 0.24, 0.17] },
    { geo: branch1, color: [0.32, 0.24, 0.17] },
    { geo: canopy1, color: c1 },
    { geo: canopy2, color: c2 }
  ]);
}

// 6. Gado Bovino Nelore Realista com Cupim Proeminente, Barbela, Chifres e Pelagem
function createNeloreCowGeo(variant = 'nelore') {
  // Tronco volumoso e robusto
  const body = new THREE.BoxGeometry(0.026, 0.014, 0.013);
  body.translate(0, 0.014, 0);

  // Cupim (Giba) Zebuína proeminente sobre a cernelha
  const hump = new THREE.DodecahedronGeometry(0.005, 0);
  hump.scale(1.25, 1.55, 1.05);
  hump.translate(-0.007, 0.0235, 0);

  // Barbela pendente flexuosa sob o peito
  const dewlap = new THREE.ConeGeometry(0.0038, 0.0085, 4);
  dewlap.scale(1.0, 1.0, 0.5);
  dewlap.translate(-0.014, 0.009, 0);

  // Pescoço
  const neck = new THREE.BoxGeometry(0.009, 0.010, 0.009);
  neck.rotateZ(-0.35);
  neck.translate(-0.013, 0.016, 0);

  // Cabeça com chanfro alongado
  const head = new THREE.BoxGeometry(0.010, 0.0075, 0.0075);
  head.translate(-0.0185, 0.014, 0);

  // Focinho escuro
  const muzzle = new THREE.BoxGeometry(0.004, 0.005, 0.0065);
  muzzle.translate(-0.023, 0.012, 0);

  // Chifres elegantes voltados para cima e trás
  const hornL = new THREE.ConeGeometry(0.0014, 0.006, 3);
  hornL.rotateX(0.40);
  hornL.rotateZ(-0.30);
  hornL.translate(-0.017, 0.0195, 0.004);

  const hornR = new THREE.ConeGeometry(0.0014, 0.006, 3);
  hornR.rotateX(-0.40);
  hornR.rotateZ(-0.30);
  hornR.translate(-0.017, 0.0195, -0.004);

  // Orelhas caídas
  const earL = new THREE.ConeGeometry(0.002, 0.0065, 3);
  earL.rotateX(0.60);
  earL.translate(-0.015, 0.0155, 0.0065);

  const earR = new THREE.ConeGeometry(0.002, 0.0065, 3);
  earR.rotateX(-0.60);
  earR.translate(-0.015, 0.0155, -0.0065);

  // 4 Membros com articulações e cascos escuros
  const legFL = new THREE.CylinderGeometry(0.0022, 0.0018, 0.012, 4);
  legFL.translate(-0.008, 0.006, 0.0045);

  const legFR = new THREE.CylinderGeometry(0.0022, 0.0018, 0.012, 4);
  legFR.translate(-0.008, 0.006, -0.0045);

  const legBL = new THREE.CylinderGeometry(0.0025, 0.0018, 0.012, 4);
  legBL.translate(0.008, 0.006, 0.0045);

  const legBR = new THREE.CylinderGeometry(0.0025, 0.0018, 0.012, 4);
  legBR.translate(0.008, 0.006, -0.0045);

  // Cascos pretos
  const hoofFL = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofFL.translate(-0.008, 0.001, 0.0045);
  const hoofFR = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofFR.translate(-0.008, 0.001, -0.0045);
  const hoofBL = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofBL.translate(0.008, 0.001, 0.0045);
  const hoofBR = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofBR.translate(0.008, 0.001, -0.0045);

  // Cauda com tufo
  const tail = new THREE.CylinderGeometry(0.0008, 0.0008, 0.012, 3);
  tail.rotateZ(0.25);
  tail.translate(0.014, 0.010, 0);

  let bodyColor = [0.95, 0.95, 0.93]; // Nelore branco clássico
  let humpColor = [0.90, 0.90, 0.88];
  if (variant === 'spotted') {
    bodyColor = [0.18, 0.18, 0.18]; // Malhada P&B
    humpColor = [0.92, 0.92, 0.92];
  } else if (variant === 'brown') {
    bodyColor = [0.62, 0.32, 0.16]; // Girolando castanho
    humpColor = [0.52, 0.26, 0.12];
  }

  return createColoredGeometry([
    { geo: body,    color: bodyColor },
    { geo: hump,    color: humpColor },
    { geo: dewlap,  color: bodyColor },
    { geo: neck,    color: bodyColor },
    { geo: head,    color: bodyColor },
    { geo: muzzle,  color: [0.18, 0.18, 0.18] }, // Focinho preto
    { geo: hornL,   color: [0.88, 0.85, 0.72] }, // Chifre marfim
    { geo: hornR,   color: [0.88, 0.85, 0.72] },
    { geo: earL,    color: bodyColor },
    { geo: earR,    color: bodyColor },
    { geo: legFL,   color: bodyColor },
    { geo: legFR,   color: bodyColor },
    { geo: legBL,   color: bodyColor },
    { geo: legBR,   color: bodyColor },
    { geo: hoofFL,  color: [0.16, 0.16, 0.16] }, // Cascos escuros
    { geo: hoofFR,  color: [0.16, 0.16, 0.16] },
    { geo: hoofBL,  color: [0.16, 0.16, 0.16] },
    { geo: hoofBR,  color: [0.16, 0.16, 0.16] },
    { geo: tail,    color: [0.22, 0.20, 0.20] }
  ]);
}

// 7. Cavalo de Lida / Manga-larga Marchador (Porte nobre, pescoço arqueado, crina e cauda)
function createHorseGeo() {
  const body = new THREE.BoxGeometry(0.026, 0.013, 0.010);
  body.translate(0, 0.016, 0);

  const neck = new THREE.BoxGeometry(0.007, 0.015, 0.006);
  neck.rotateZ(-0.62);
  neck.translate(-0.012, 0.021, 0);

  const head = new THREE.BoxGeometry(0.009, 0.0065, 0.0055);
  head.rotateZ(0.20);
  head.translate(-0.018, 0.025, 0);

  const earL = new THREE.ConeGeometry(0.0012, 0.004, 3);
  earL.translate(-0.017, 0.029, 0.0018);
  const earR = new THREE.ConeGeometry(0.0012, 0.004, 3);
  earR.translate(-0.017, 0.029, -0.0018);

  const mane = new THREE.BoxGeometry(0.003, 0.013, 0.002);
  mane.rotateZ(-0.62);
  mane.translate(-0.010, 0.023, 0);

  // 4 Patas esguias
  const legFL = new THREE.CylinderGeometry(0.0016, 0.0013, 0.015, 4);
  legFL.translate(-0.008, 0.0075, 0.0035);
  const legFR = new THREE.CylinderGeometry(0.0016, 0.0013, 0.015, 4);
  legFR.translate(-0.008, 0.0075, -0.0035);
  const legBL = new THREE.CylinderGeometry(0.0018, 0.0014, 0.015, 4);
  legBL.translate(0.008, 0.0075, 0.0035);
  const legBR = new THREE.CylinderGeometry(0.0018, 0.0014, 0.015, 4);
  legBR.translate(0.008, 0.0075, -0.0035);

  const tail = new THREE.ConeGeometry(0.0026, 0.016, 4);
  tail.rotateZ(0.35);
  tail.translate(0.014, 0.013, 0);

  const coatColor = [0.52, 0.26, 0.12]; // Castanho alazão
  const maneColor = [0.12, 0.10, 0.08]; // Crina preta

  return createColoredGeometry([
    { geo: body,  color: coatColor },
    { geo: neck,  color: coatColor },
    { geo: head,  color: coatColor },
    { geo: earL,  color: coatColor },
    { geo: earR,  color: coatColor },
    { geo: mane,  color: maneColor },
    { geo: legFL, color: coatColor },
    { geo: legFR, color: coatColor },
    { geo: legBL, color: coatColor },
    { geo: legBR, color: coatColor },
    { geo: tail,  color: maneColor }
  ]);
}

// 8. Trator Agrícola Moderno (John Deere verde ou Case vermelho com rodas gigantes e implemento)
function createTractorGeo(isGreen = true) {
  const hood = new THREE.BoxGeometry(0.020, 0.012, 0.012);
  hood.translate(-0.008, 0.011, 0);

  const cabin = new THREE.BoxGeometry(0.015, 0.015, 0.014);
  cabin.translate(0.007, 0.020, 0);

  const cabRoof = new THREE.BoxGeometry(0.017, 0.0028, 0.016);
  cabRoof.translate(0.007, 0.028, 0);

  const exhaust = new THREE.CylinderGeometry(0.0009, 0.0009, 0.016, 4);
  exhaust.translate(-0.001, 0.023, 0.0055);

  // Rodas Traseiras Gigantes com Garras
  const wheelRL = new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8);
  wheelRL.rotateX(Math.PI / 2);
  wheelRL.translate(0.008, 0.009, 0.009);

  const wheelRR = new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8);
  wheelRR.rotateX(Math.PI / 2);
  wheelRR.translate(0.008, 0.009, -0.009);

  // Rodas Dianteiras Direcionais
  const wheelFL = new THREE.CylinderGeometry(0.006, 0.006, 0.0035, 6);
  wheelFL.rotateX(Math.PI / 2);
  wheelFL.translate(-0.014, 0.006, 0.0075);

  const wheelFR = new THREE.CylinderGeometry(0.006, 0.006, 0.0035, 6);
  wheelFR.rotateX(Math.PI / 2);
  wheelFR.translate(-0.014, 0.006, -0.0075);

  // Implemento Acoplado Traseiro (Grade Aradora / Plantadeira)
  const implement = new THREE.BoxGeometry(0.016, 0.004, 0.022);
  implement.translate(0.020, 0.005, 0);

  const bodyColor = isGreen ? [0.16, 0.54, 0.20] : [0.82, 0.18, 0.15];
  const roofColor = isGreen ? [0.92, 0.84, 0.16] : [0.96, 0.96, 0.96];

  return createColoredGeometry([
    { geo: hood,      color: bodyColor },
    { geo: cabin,     color: [0.20, 0.32, 0.40] }, // Vidro fumê
    { geo: cabRoof,   color: roofColor },
    { geo: exhaust,   color: [0.16, 0.16, 0.16] },
    { geo: wheelRL,   color: [0.16, 0.16, 0.16] },
    { geo: wheelRR,   color: [0.16, 0.16, 0.16] },
    { geo: wheelFL,   color: [0.16, 0.16, 0.16] },
    { geo: wheelFR,   color: [0.16, 0.16, 0.16] },
    { geo: implement, color: [0.28, 0.28, 0.28] }
  ]);
}

// 9. Colheitadeira de Grãos de Alta Capacidade com Plataforma Draper
function createHarvesterGeo() {
  const body = new THREE.BoxGeometry(0.036, 0.020, 0.020);
  body.translate(0, 0.019, 0);

  const cab = new THREE.BoxGeometry(0.013, 0.013, 0.016);
  cab.translate(-0.013, 0.027, 0);

  const cabRoof = new THREE.BoxGeometry(0.015, 0.0025, 0.018);
  cabRoof.translate(-0.013, 0.034, 0);

  // Plataforma Frontal Larga de Corte Draper (Corte de grãos)
  const draper = new THREE.BoxGeometry(0.008, 0.005, 0.060);
  draper.translate(-0.024, 0.005, 0);

  const reel = new THREE.CylinderGeometry(0.003, 0.003, 0.058, 6);
  reel.rotateX(Math.PI / 2);
  reel.translate(-0.024, 0.009, 0);

  // Tubo de Descarga Basculante (Auger)
  const auger = new THREE.CylinderGeometry(0.0016, 0.0016, 0.032, 4);
  auger.rotateZ(-0.35);
  auger.rotateY(0.40);
  auger.translate(0.006, 0.030, 0.015);

  const wheelFL = new THREE.CylinderGeometry(0.010, 0.010, 0.006, 8);
  wheelFL.rotateX(Math.PI / 2);
  wheelFL.translate(-0.007, 0.010, 0.012);

  const wheelFR = new THREE.CylinderGeometry(0.010, 0.010, 0.006, 8);
  wheelFR.rotateX(Math.PI / 2);
  wheelFR.translate(-0.007, 0.010, -0.012);

  const wheelRL = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 6);
  wheelRL.rotateX(Math.PI / 2);
  wheelRL.translate(0.013, 0.007, 0.010);

  const wheelRR = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 6);
  wheelRR.rotateX(Math.PI / 2);
  wheelRR.translate(0.013, 0.007, -0.010);

  return createColoredGeometry([
    { geo: body,    color: [0.82, 0.18, 0.15] }, // Vermelho Case
    { geo: cab,     color: [0.20, 0.32, 0.40] },
    { geo: cabRoof, color: [0.96, 0.96, 0.96] },
    { geo: draper,  color: [0.26, 0.26, 0.26] },
    { geo: reel,    color: [0.86, 0.78, 0.18] }, // Molinete dourado
    { geo: auger,   color: [0.82, 0.18, 0.15] },
    { geo: wheelFL, color: [0.16, 0.16, 0.16] },
    { geo: wheelFR, color: [0.16, 0.16, 0.16] },
    { geo: wheelRL, color: [0.16, 0.16, 0.16] },
    { geo: wheelRR, color: [0.16, 0.16, 0.16] }
  ]);
}

// Criador de Instância Contínua com Coordenadas Sub-Pixel Livres (Sem vínculo com centro de pixel)
function createContinuousItem(xCol, yRow, demW, demH, geoW, geoH, scaleBase, rnd, fixedRot, tiltX = 0, tiltZ = 0, offsetY = 0) {
  const u = Math.max(0, Math.min(1, xCol / (demW - 1)));
  const v = Math.max(0, Math.min(1, yRow / (demH - 1)));
  const x = (u - 0.5) * geoW;
  const z = (v - 0.5) * geoH;
  const elev = getBilinearElevation(u, v, demW, demH);
  const rotY = (fixedRot !== undefined) ? fixedRot : rnd * Math.PI * 2;
  const scaleMult = scaleBase * (0.85 + rnd * 0.30); // Variação botânica e estrutural natural

  return {
    x, z, elev, rotY,
    tiltX, tiltZ,
    offsetY,
    scaleX: scaleMult,
    scaleY: scaleMult,
    scaleZ: scaleMult
  };
}

// 8. Build All Brazilian Biome Props with Free Continuous Sub-Pixel Scattering
function buildPropsMeshes() {
  if (!rawClasses || !rawElevations) return;

  if (propsGroup) {
    scene.remove(propsGroup);
    propsGroup.traverse(child => {
      if (child.isInstancedMesh && child.geometry) {
        child.geometry.dispose();
      }
    });
  }
  propsGroup = new THREE.Group();
  scene.add(propsGroup);

  // Clear previous layers
  for (const k of Object.keys(propLayers)) {
    delete propLayers[k];
  }

  const density = state.props.density || 1.0;
  const dSqrt = Math.sqrt(density);

  const demW = state.demDimensions.width; // 1650
  const demH = state.demDimensions.height; // 847
  const geoW = state.terrainSpan.width; // 200
  const geoH = state.terrainSpan.height; // 102.6

  const forestItems = [];
  const cerradoTreeItems = [];
  const cerradoShrubItems = [];
  const rocksItems = [];
  const pastureItems = [];
  const silvicultureItems = [];
  const grasslandItems = [];

  // Coleções de Arquitetura Colonial Goiana (Goiás Velho)
  const urbanHousesWhite = [];
  const urbanHousesOchre = [];
  const urbanHousesGreen = [];
  const urbanHousesRose = [];
  const urbanSobrados = [];
  const urbanSobradosOchre = [];
  const urbanChurches = [];
  const urbanLanterns = [];
  const urbanTreesGreen = [];
  const urbanTreesDeepGreen = [];
  const urbanTreesYellow = [];
  const urbanTreesPink = [];

  const soybeanItems = [];
  const tempCropsItems = [];
  const wetlandItems = [];
  const bareItems = [];
  const waterItems = [];

  // Animais e Máquinas
  const cattleNeloreItems = [];
  const cattleSpottedItems = [];
  const cattleBrownItems = [];
  const horseItems = [];
  const tractorsGreenItems = [];
  const tractorsRedItems = [];
  const harvesterItems = [];

  // Função PRNG com Math.imul garantindo distribuição estocástica uniforme [0, 1) em qualquer semente e coordenada contínua
  function pHash(x, y, seed = 0) {
    const ix = Math.floor(x * 64);
    const iy = Math.floor(y * 64);
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // 1. Mata Tropical / Floresta Estacional & Galeria (ID 3)
  const fStep = 2.0 / dSqrt;
  for (let r = 0; r < demH; r += fStep) {
    for (let c = 0; c < demW; c += fStep) {
      const cA = c + pHash(c, r, 11) * fStep;
      const rA = r + pHash(c, r, 12) * fStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 3) {
        const rndA = pHash(cA, rA, 13);
        const tiltX = (pHash(cA, rA, 14) - 0.5) * 0.08;
        const tiltZ = (pHash(cA, rA, 15) - 0.5) * 0.08;
        const scaleBase = 1.15 + (rndA > 0.70 ? 0.35 : 0.0);
        forestItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, scaleBase, rndA, undefined, tiltX, tiltZ));
      }

      const cB = c + pHash(c, r, 21) * fStep;
      const rB = r + pHash(c, r, 22) * fStep;
      const pixCB = Math.max(0, Math.min(demW - 1, Math.round(cB)));
      const pixRB = Math.max(0, Math.min(demH - 1, Math.round(rB)));
      if (rawClasses[pixRB * demW + pixCB] === 3) {
        const rndB = pHash(cB, rB, 23);
        const tiltX = (pHash(cB, rB, 24) - 0.5) * 0.08;
        const tiltZ = (pHash(cB, rB, 25) - 0.5) * 0.08;
        const scaleBase = 0.95 + rndB * 0.30;
        forestItems.push(createContinuousItem(cB, rB, demW, demH, geoW, geoH, scaleBase, rndB, undefined, tiltX, tiltZ));
      }
    }
  }

  // 2. Cerrado & Arbustos (ID 4 - Formação Savânica)
  const cStep = 2.6 / dSqrt;
  for (let r = 0; r < demH; r += cStep) {
    for (let c = 0; c < demW; c += cStep) {
      const cA = c + pHash(c, r, 31) * cStep;
      const rA = r + pHash(c, r, 32) * cStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 4) {
        const rndA = pHash(cA, rA, 33);
        const tiltX = (pHash(cA, rA, 34) - 0.5) * 0.24;
        const tiltZ = (pHash(cA, rA, 35) - 0.5) * 0.24;
        cerradoTreeItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.20, rndA, undefined, tiltX, tiltZ));
      }

      const cB = c + pHash(c, r, 41) * cStep;
      const rB = r + pHash(c, r, 42) * cStep;
      const pixCB = Math.max(0, Math.min(demW - 1, Math.round(cB)));
      const pixRB = Math.max(0, Math.min(demH - 1, Math.round(rB)));
      if (rawClasses[pixRB * demW + pixCB] === 4) {
        const rndB = pHash(cB, rB, 43);
        cerradoShrubItems.push(createContinuousItem(cB, rB, demW, demH, geoW, geoH, 1.10, rndB));
      }

      if (pHash(c, r, 45) > 0.45) {
        const cC = c + pHash(c, r, 46) * cStep;
        const rC = r + pHash(c, r, 47) * cStep;
        const pixCC = Math.max(0, Math.min(demW - 1, Math.round(cC)));
        const pixRC = Math.max(0, Math.min(demH - 1, Math.round(rC)));
        if (rawClasses[pixRC * demW + pixCC] === 4) {
          cerradoShrubItems.push(createContinuousItem(cC, rC, demW, demH, geoW, geoH, 0.95, pHash(cC, rC, 48)));
        }
      }
    }
  }

  // 3. Afloramento Rochoso e Campo Rupestre (ID 29)
  const rkStep = 1.8 / dSqrt;
  for (let r = 0; r < demH; r += rkStep) {
    for (let c = 0; c < demW; c += rkStep) {
      const cA = c + pHash(c, r, 81) * rkStep;
      const rA = r + pHash(c, r, 82) * rkStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 29) {
        const rndA = pHash(cA, rA, 83);
        const tiltX = (pHash(cA, rA, 84) - 0.5) * 0.35;
        const tiltZ = (pHash(cA, rA, 85) - 0.5) * 0.35;
        rocksItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.25, rndA, undefined, tiltX, tiltZ));
      }
      if (pHash(c, r, 86) > 0.40) {
        const cB = c + pHash(c, r, 87) * rkStep;
        const rB = r + pHash(c, r, 88) * rkStep;
        const pixCB = Math.max(0, Math.min(demW - 1, Math.round(cB)));
        const pixRB = Math.max(0, Math.min(demH - 1, Math.round(rB)));
        if (rawClasses[pixRB * demW + pixCB] === 29) {
          rocksItems.push(createContinuousItem(cB, rB, demW, demH, geoW, geoH, 1.05, pHash(cB, rB, 89), undefined, 0.20, -0.20));
        }
      }
    }
  }

  // 4. Pastagem / Capim Braquiária 3D Sólido (ID 15 & Mosaico 21)
  const pStep = 2.6 / dSqrt;
  for (let r = 0; r < demH; r += pStep) {
    for (let c = 0; c < demW; c += pStep) {
      const cA = c + pHash(c, r, 101) * pStep;
      const rA = r + pHash(c, r, 102) * pStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      const clsA = rawClasses[pixRA * demW + pixCA];
      if (clsA === 15 || clsA === 21) {
        pastureItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.45, pHash(cA, rA, 103)));
      }

      const cB = c + pHash(c, r, 104) * pStep;
      const rB = r + pHash(c, r, 105) * pStep;
      const pixCB = Math.max(0, Math.min(demW - 1, Math.round(cB)));
      const pixRB = Math.max(0, Math.min(demH - 1, Math.round(rB)));
      const clsB = rawClasses[pixRB * demW + pixCB];
      if (clsB === 15 || clsB === 21) {
        pastureItems.push(createContinuousItem(cB, rB, demW, demH, geoW, geoH, 1.35, pHash(cB, rB, 106)));
      }
    }
  }

  // 5. Silvicultura / Floresta Plantada de Eucalipto (ID 9) - Linhas Geométricas de Plantio Florestal
  const silvBlockSize = 16;
  const silvBCols = Math.ceil(demW / silvBlockSize);
  const silvBRows = Math.ceil(demH / silvBlockSize);
  const silvMaxR = silvBlockSize * 0.85;
  const silvRowSpacing = 1.8 / dSqrt;    // Espaçamento entre fileiras (corredores de manejo florestal)
  const silvAlongSpacing = 0.95 / dSqrt; // Espaçamento entre eucaliptos na linha
  const silvNRows = Math.ceil(silvMaxR / silvRowSpacing);
  const silvNPts = Math.ceil(silvMaxR / silvAlongSpacing);

  for (let by = 0; by < silvBRows; by++) {
    for (let bx = 0; bx < silvBCols; bx++) {
      const c0 = bx * silvBlockSize;
      const r0 = by * silvBlockSize;
      let hasSilv = false;
      for (let dr = 0; dr < silvBlockSize; dr += 3) {
        for (let dc = 0; dc < silvBlockSize; dc += 3) {
          const pr = Math.min(demH - 1, r0 + dr);
          const pc = Math.min(demW - 1, c0 + dc);
          if (rawClasses[pr * demW + pc] === 9) { hasSilv = true; break; }
        }
        if (hasSilv) break;
      }
      if (!hasSilv) continue;

      // Orientação retilínea do talhão florestal
      const parcelAngle = ((pHash(bx, by, 120) * 8) | 0) * (Math.PI / 8) + 0.12;
      const dirX = Math.cos(parcelAngle);
      const dirY = Math.sin(parcelAngle);
      const perpX = -Math.sin(parcelAngle);
      const perpY = Math.cos(parcelAngle);
      const cx = (bx + 0.5) * silvBlockSize;
      const cy = (by + 0.5) * silvBlockSize;

      for (let i = -silvNRows; i <= silvNRows; i++) {
        for (let j = -silvNPts; j <= silvNPts; j++) {
          const c = cx + i * silvRowSpacing * perpX + j * silvAlongSpacing * dirX;
          const r = cy + i * silvRowSpacing * perpY + j * silvAlongSpacing * dirY;
          if (c >= c0 && c < c0 + silvBlockSize && r >= r0 && r < r0 + silvBlockSize) {
            const pc = Math.round(c);
            const pr = Math.round(r);
            if (pc >= 0 && pc < demW && pr >= 0 && pr < demH && rawClasses[pr * demW + pc] === 9) {
              const rnd = pHash(c, r, 125);
              const treeRot = -parcelAngle + (rnd - 0.5) * 0.15;
              silvicultureItems.push(createContinuousItem(c, r, demW, demH, geoW, geoH, 1.05 + (rnd - 0.5) * 0.15, rnd, treeRot));
            }
          }
        }
      }
    }
  }

  // 6. Campo Nativo / Formação Campestre (ID 12)
  const gStep = 1.8 / dSqrt;
  for (let r = 0; r < demH; r += gStep) {
    for (let c = 0; c < demW; c += gStep) {
      const cA = c + pHash(c, r, 141) * gStep;
      const rA = r + pHash(c, r, 142) * gStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 12) {
        grasslandItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.20, pHash(cA, rA, 143)));
      }
    }
  }

  // Função auxiliar para analisar densidade local da malha urbana (1 a 9 pixels vizinhos)
  function getUrbanDensity(c, r) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = r + dy;
      if (ny < 0 || ny >= demH) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c + dx;
        if (nx < 0 || nx >= demW) continue;
        if (rawClasses[ny * demW + nx] === 24) count++;
      }
    }
    return count;
  }

  // 7. Estruturas Arquitetônicas Coloniais Reais de Goiás Velho (Casas Térreas, Sobrados, Igreja Barroca, Lampiões e Ipês)
  for (let r = 0; r < demH; r += 1.3) {
    for (let c = 0; c < demW; c += 1.3) {
      const pixC = Math.max(0, Math.min(demW - 1, Math.round(c)));
      const pixR = Math.max(0, Math.min(demH - 1, Math.round(r)));
      if (rawClasses[pixR * demW + pixC] === 24) {
        const density = getUrbanDensity(pixC, pixR);
        const rnd1 = pHash(c, r, 701);
        const streetAngles = [0, Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4];
        const baseAng = streetAngles[Math.floor(rnd1 * 4)] + (pHash(c, r, 702) - 0.5) * 0.12;

        const cA = c + (pHash(c, r, 703) - 0.5) * 0.5;
        const rA = r + (pHash(c, r, 704) - 0.5) * 0.5;

        // Igreja monumental no núcleo histórico denso
        if (density >= 6 && rnd1 > 0.985 && Math.floor(r) % 5 === 0 && Math.floor(c) % 5 === 0) {
          urbanChurches.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.15, rnd1, baseAng, 0, 0, 0.001));
        } else if (density >= 5 && rnd1 > 0.60) {
          // Sobrados coloniais de 2 pavimentos com sacadas de ferro forjado
          if (rnd1 > 0.82) {
            urbanSobradosOchre.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.05, rnd1, baseAng, 0, 0, 0.001));
          } else {
            urbanSobrados.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.05, rnd1, baseAng, 0, 0, 0.001));
          }
        } else {
          // Casas coloniais térreas com fachadas coloridas tradicionais de Goiás
          const palRnd = pHash(cA, rA, 705);
          if (palRnd < 0.42) {
            urbanHousesWhite.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.0, rnd1, baseAng, 0, 0, 0.001));
          } else if (palRnd < 0.68) {
            urbanHousesOchre.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.0, rnd1, baseAng, 0, 0, 0.001));
          } else if (palRnd < 0.86) {
            urbanHousesGreen.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.0, rnd1, baseAng, 0, 0, 0.001));
          } else {
            urbanHousesRose.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.0, rnd1, baseAng, 0, 0, 0.001));
          }
        }

        // Lampião colonial nos becos e ruas
        if (pHash(c, r, 706) > 0.65) {
          const lC = cA + 0.35 * Math.cos(baseAng + Math.PI / 2);
          const lR = rA + 0.35 * Math.sin(baseAng + Math.PI / 2);
          urbanLanterns.push(createContinuousItem(lC, lR, demW, demH, geoW, geoH, 1.0, rnd1, baseAng, 0, 0, 0.001));
        }

        // Árvores dos quintais, becos e praças da cidade (Verdes frondosas, pomares densos e ipês)
        const urbanTreeThresh = Math.max(0.30, 0.58 - (density - 1.0) * 0.18);
        if (pHash(c, r, 707) > urbanTreeThresh) {
          const tC = cA - 0.45 * Math.cos(baseAng);
          const tR = rA - 0.45 * Math.sin(baseAng);
          const treeRnd = pHash(tC, tR, 708);
          const item = createContinuousItem(tC, tR, demW, demH, geoW, geoH, 1.15, treeRnd, undefined, 0, 0, 0.001);

          if (treeRnd < 0.55) {
            // 55% Árvores verdes frondosas de sombra dos quintais e calçadas goianas
            urbanTreesGreen.push(item);
          } else if (treeRnd < 0.82) {
            // 27% Árvores verde escuro densas dos pomares (mangueiras/oitizeiros)
            urbanTreesDeepGreen.push(item);
          } else if (treeRnd < 0.94) {
            // 12% Ipês amarelos floridos tradicionais
            urbanTreesYellow.push(item);
          } else {
            // 6% Ipês rosas floridos tradicionais
            urbanTreesPink.push(item);
          }
        }
      }
    }
  }

  // CENTRO HISTÓRICO MONUMENTAL NO PRESET "Cidade de Goiás" (x: 58.0, z: -46.5 -> col: 1303, row: 40)
  // Adro monumental com a Igreja Barroca, Cruzeiro de pedra, Sobrados com sacadas, lampiões e árvores
  urbanChurches.push(createContinuousItem(1303, 40, demW, demH, geoW, geoH, 1.35, 0.5, -0.25, 0, 0, 0.002));
  urbanSobrados.push(createContinuousItem(1303 - 2.8, 40 - 1.2, demW, demH, geoW, geoH, 1.15, 0.5, 0.35, 0, 0, 0.001));
  urbanSobradosOchre.push(createContinuousItem(1303 + 2.8, 40 - 0.8, demW, demH, geoW, geoH, 1.15, 0.5, -0.40, 0, 0, 0.001));
  urbanSobrados.push(createContinuousItem(1303 - 3.2, 40 + 2.2, demW, demH, geoW, geoH, 1.10, 0.5, 1.30, 0, 0, 0.001));
  urbanHousesOchre.push(createContinuousItem(1303 + 3.2, 40 + 2.2, demW, demH, geoW, geoH, 1.10, 0.5, -1.25, 0, 0, 0.001));
  urbanHousesWhite.push(createContinuousItem(1303 - 5.0, 40 + 0.5, demW, demH, geoW, geoH, 1.05, 0.5, 0.35, 0, 0, 0.001));
  urbanHousesGreen.push(createContinuousItem(1303 + 5.0, 40 + 0.8, demW, demH, geoW, geoH, 1.05, 0.5, -0.40, 0, 0, 0.001));
  urbanHousesRose.push(createContinuousItem(1303, 40 + 3.8, demW, demH, geoW, geoH, 1.10, 0.5, 3.14, 0, 0, 0.001));
  urbanLanterns.push(createContinuousItem(1303 - 1.5, 40 + 2.0, demW, demH, geoW, geoH, 1.15, 0.5, 0, 0, 0, 0.001));
  urbanLanterns.push(createContinuousItem(1303 + 1.5, 40 + 2.0, demW, demH, geoW, geoH, 1.15, 0.5, 0, 0, 0, 0.001));
  // Árvores na praça histórica: verdes de sombra, pomar e ipês
  urbanTreesGreen.push(createContinuousItem(1303 - 2.5, 40 + 3.0, demW, demH, geoW, geoH, 1.25, 0.5, 0, 0, 0, 0.001));
  urbanTreesDeepGreen.push(createContinuousItem(1303 + 2.5, 40 + 3.0, demW, demH, geoW, geoH, 1.25, 0.5, 0, 0, 0, 0.001));
  urbanTreesGreen.push(createContinuousItem(1303, 40 + 4.8, demW, demH, geoW, geoH, 1.30, 0.5, 0, 0, 0, 0.001));
  urbanTreesYellow.push(createContinuousItem(1303 - 4.5, 40 - 1.2, demW, demH, geoW, geoH, 1.20, 0.5, 0, 0, 0, 0.001));
  urbanTreesPink.push(createContinuousItem(1303 + 4.5, 40 - 1.2, demW, demH, geoW, geoH, 1.20, 0.5, 0, 0, 0, 0.001));

  // 8. Soja (ID 39 - Formação Agrícola 3.2.1.1) - Linhas Mecanizadas de Semeadura e Sulcos Paralelos
  const soyBlockSize = 20;
  const soyBCols = Math.ceil(demW / soyBlockSize);
  const soyBRows = Math.ceil(demH / soyBlockSize);
  const soyMaxR = soyBlockSize * 0.85;
  const soyRowSpacing = 1.25 / dSqrt;   // Espaçamento entre leiras paralelas
  const soyAlongSpacing = 0.75 / dSqrt;  // Encadeamento contínuo das plantas na linha de cultivo
  const soyNRows = Math.ceil(soyMaxR / soyRowSpacing);
  const soyNPts = Math.ceil(soyMaxR / soyAlongSpacing);

  for (let by = 0; by < soyBRows; by++) {
    for (let bx = 0; bx < soyBCols; bx++) {
      const c0 = bx * soyBlockSize;
      const r0 = by * soyBlockSize;
      let hasSoy = false;
      for (let dr = 0; dr < soyBlockSize; dr += 3) {
        for (let dc = 0; dc < soyBlockSize; dc += 3) {
          const pr = Math.min(demH - 1, r0 + dr);
          const pc = Math.min(demW - 1, c0 + dc);
          if (rawClasses[pr * demW + pc] === 39) { hasSoy = true; break; }
        }
        if (hasSoy) break;
      }
      if (!hasSoy) continue;

      // Ângulo característico da semeadura do talhão de soja
      const parcelAngle = ((pHash(bx, by, 180) * 8) | 0) * (Math.PI / 8) + (pHash(bx, by, 181) - 0.5) * 0.05;
      const dirX = Math.cos(parcelAngle);
      const dirY = Math.sin(parcelAngle);
      const perpX = -Math.sin(parcelAngle);
      const perpY = Math.cos(parcelAngle);
      const cx = (bx + 0.5) * soyBlockSize;
      const cy = (by + 0.5) * soyBlockSize;

      for (let i = -soyNRows; i <= soyNRows; i++) {
        for (let j = -soyNPts; j <= soyNPts; j++) {
          const c = cx + i * soyRowSpacing * perpX + j * soyAlongSpacing * dirX;
          const r = cy + i * soyRowSpacing * perpY + j * soyAlongSpacing * dirY;
          if (c >= c0 && c < c0 + soyBlockSize && r >= r0 && r < r0 + soyBlockSize) {
            const pc = Math.round(c);
            const pr = Math.round(r);
            if (pc >= 0 && pc < demW && pr >= 0 && pr < demH && rawClasses[pr * demW + pc] === 39) {
              const rnd = pHash(c, r, 185);
              // Rotação orientada exatamente ao longo do eixo da linha de plantio (-parcelAngle)
              soybeanItems.push(createContinuousItem(c, r, demW, demH, geoW, geoH, 1.25, rnd, -parcelAngle));
            }
          }
        }
      }
    }
  }

  // 9. Outras Lavouras Temporárias / Milho e Grãos (ID 41 - 3.2.1.5) - Fileiras Paralelas de Plantio
  const tempBlockSize = 20;
  const tempBCols = Math.ceil(demW / tempBlockSize);
  const tempBRows = Math.ceil(demH / tempBlockSize);
  const tempMaxR = tempBlockSize * 0.85;
  const tempRowSpacing = 1.45 / dSqrt;
  const tempAlongSpacing = 1.15 / dSqrt;
  const tempNRows = Math.ceil(tempMaxR / tempRowSpacing);
  const tempNPts = Math.ceil(tempMaxR / tempAlongSpacing);

  for (let by = 0; by < tempBRows; by++) {
    for (let bx = 0; bx < tempBCols; bx++) {
      const c0 = bx * tempBlockSize;
      const r0 = by * tempBlockSize;
      let hasTemp = false;
      for (let dr = 0; dr < tempBlockSize; dr += 3) {
        for (let dc = 0; dc < tempBlockSize; dc += 3) {
          const pr = Math.min(demH - 1, r0 + dr);
          const pc = Math.min(demW - 1, c0 + dc);
          if (rawClasses[pr * demW + pc] === 41) { hasTemp = true; break; }
        }
        if (hasTemp) break;
      }
      if (!hasTemp) continue;

      // Ângulo característico da semeadura do talhão de milho/grãos
      const parcelAngle = ((pHash(bx, by, 210) * 8) | 0) * (Math.PI / 8) + (pHash(bx, by, 211) - 0.5) * 0.05;
      const dirX = Math.cos(parcelAngle);
      const dirY = Math.sin(parcelAngle);
      const perpX = -Math.sin(parcelAngle);
      const perpY = Math.cos(parcelAngle);
      const cx = (bx + 0.5) * tempBlockSize;
      const cy = (by + 0.5) * tempBlockSize;

      for (let i = -tempNRows; i <= tempNRows; i++) {
        for (let j = -tempNPts; j <= tempNPts; j++) {
          const c = cx + i * tempRowSpacing * perpX + j * tempAlongSpacing * dirX;
          const r = cy + i * tempRowSpacing * perpY + j * tempAlongSpacing * dirY;
          if (c >= c0 && c < c0 + tempBlockSize && r >= r0 && r < r0 + tempBlockSize) {
            const pc = Math.round(c);
            const pr = Math.round(r);
            if (pc >= 0 && pc < demW && pr >= 0 && pr < demH && rawClasses[pr * demW + pc] === 41) {
              const rnd = pHash(c, r, 215);
              // Rotação alinhada com as fileiras de milho
              tempCropsItems.push(createContinuousItem(c, r, demW, demH, geoW, geoH, 1.20, rnd, -parcelAngle));
            }
          }
        }
      }
    }
  }

  // 10. Campo Alagado e Veredas de Buriti (ID 11)
  const wStep = 1.0 / dSqrt;
  for (let r = 0; r < demH; r += wStep) {
    for (let c = 0; c < demW; c += wStep) {
      const cA = c + pHash(c, r, 251) * wStep;
      const rA = r + pHash(c, r, 252) * wStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 11) {
        const rndA = pHash(cA, rA, 253);
        const tiltX = (pHash(cA, rA, 254) - 0.5) * 0.10;
        const tiltZ = (pHash(cA, rA, 255) - 0.5) * 0.10;
        wetlandItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 0.95 + rndA * 0.45, rndA, undefined, tiltX, tiltZ));
      }
    }
  }

  // 11. Solo Exposto & Cascalheiras (ID 25)
  const bStep = 1.8 / dSqrt;
  for (let r = 0; r < demH; r += bStep) {
    for (let c = 0; c < demW; c += bStep) {
      const cA = c + pHash(c, r, 271) * bStep;
      const rA = r + pHash(c, r, 272) * bStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 25) {
        bareItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.15, pHash(cA, rA, 273)));
      }
    }
  }

  // 12. Corpos Hídricos / Rios e Margens Ripárias (ID 33)
  const hStep = 1.6 / dSqrt;
  for (let r = 0; r < demH; r += hStep) {
    for (let c = 0; c < demW; c += hStep) {
      const cA = c + pHash(c, r, 291) * hStep;
      const rA = r + pHash(c, r, 292) * hStep;
      const pixCA = Math.max(0, Math.min(demW - 1, Math.round(cA)));
      const pixRA = Math.max(0, Math.min(demH - 1, Math.round(rA)));
      if (rawClasses[pixRA * demW + pixCA] === 33) {
        waterItems.push(createContinuousItem(cA, rA, demW, demH, geoW, geoH, 1.10, pHash(cA, rA, 293)));
      }
    }
  }

  // 13. Rebanhos Bovinos (Nelore, Malhado P&B, Girolando Castanho) e Cavalos nas Pastagens (ID 15 & 21)
  for (let r = 0; r < demH; r += 9) {
    for (let c = 0; c < demW; c += 9) {
      const centerC = c + pHash(c, r, 501) * 9;
      const centerR = r + pHash(c, r, 502) * 9;
      const pixC = Math.max(0, Math.min(demW - 1, Math.round(centerC)));
      const pixR = Math.max(0, Math.min(demH - 1, Math.round(centerR)));
      const cls = rawClasses[pixR * demW + pixC];
      if (cls === 15 || cls === 21) {
        if (pHash(c, r, 503) > 0.50) {
          const herdSize = 3 + Math.floor(pHash(c, r, 504) * 4); // 3 a 6 por rebanho
          for (let k = 0; k < herdSize; k++) {
            const herdAngle = pHash(c, r, k * 7 + 510) * Math.PI * 2;
            const herdDist = 0.8 + Math.sqrt(pHash(c, r, k * 7 + 511)) * 3.8;
            const cowC = centerC + Math.cos(herdAngle) * herdDist;
            const cowR = centerR + Math.sin(herdAngle) * herdDist;
            const cowPixC = Math.max(0, Math.min(demW - 1, Math.round(cowC)));
            const cowPixR = Math.max(0, Math.min(demH - 1, Math.round(cowR)));
            const cowCls = rawClasses[cowPixR * demW + cowPixC];
            if (cowCls === 15 || cowCls === 21) {
              const cowRnd = pHash(cowC, cowR, k * 7 + 512);
              const cowRot = pHash(cowC, cowR, k * 7 + 513) * Math.PI * 2;
              const cowScale = 1.05 + (cowRnd - 0.5) * 0.20;
              const item = createContinuousItem(cowC, cowR, demW, demH, geoW, geoH, cowScale, cowRnd, cowRot, 0, 0, 0.001);

              if (cowRnd < 0.78) {
                cattleNeloreItems.push(item);
              } else if (cowRnd < 0.90) {
                cattleSpottedItems.push(item);
              } else {
                cattleBrownItems.push(item);
              }
            }
          }

          // Cavalo pastando no piquete (~15% dos rebanhos)
          if (pHash(c, r, 540) > 0.82) {
            const horseAngle = pHash(c, r, 541) * Math.PI * 2;
            const horseDist = 2.0 + pHash(c, r, 542) * 2.5;
            const horseC = centerC + Math.cos(horseAngle) * horseDist;
            const horseR = centerR + Math.sin(horseAngle) * horseDist;
            const horsePixC = Math.max(0, Math.min(demW - 1, Math.round(horseC)));
            const horsePixR = Math.max(0, Math.min(demH - 1, Math.round(horseR)));
            if (rawClasses[horsePixR * demW + horsePixC] === 15 || rawClasses[horsePixR * demW + horsePixC] === 21) {
              const horseRnd = pHash(horseC, horseR, 543);
              const horseRot = pHash(horseC, horseR, 544) * Math.PI * 2;
              horseItems.push(createContinuousItem(horseC, horseR, demW, demH, geoW, geoH, 1.10, horseRnd, horseRot, 0, 0, 0.001));
            }
          }
        }
      }
    }
  }

  // REBANHO GARANTIDO NO PRESET "Rebanho no Pasto 🐄" (x: 12.8, z: -19.9 -> col: 930, row: 259)
  const presetCows = [
    { dc: 0, dr: 0, rot: 0.6, type: 'nelore', scale: 1.20 },
    { dc: -0.8, dr: 0.6, rot: 1.2, type: 'nelore', scale: 1.15 },
    { dc: 0.7, dr: -0.6, rot: 2.1, type: 'nelore', scale: 1.22 },
    { dc: -1.3, dr: -0.4, rot: 0.2, type: 'spotted', scale: 1.18 },
    { dc: 1.2, dr: 0.8, rot: 3.4, type: 'brown', scale: 1.15 },
    { dc: -0.5, dr: -1.4, rot: 4.2, type: 'nelore', scale: 1.18 },
    { dc: 1.6, dr: -1.2, rot: 1.9, type: 'spotted', scale: 1.16 },
    { dc: -1.8, dr: 1.2, rot: 5.1, type: 'horse', scale: 1.20 },
    { dc: -2.4, dr: 0.3, rot: 4.8, type: 'horse', scale: 1.18 }
  ];
  for (const pc of presetCows) {
    const cCow = 930 + pc.dc;
    const rCow = 259 + pc.dr;
    const item = createContinuousItem(cCow, rCow, demW, demH, geoW, geoH, pc.scale, 0.5, pc.rot, 0, 0, 0.001);
    if (pc.type === 'nelore') cattleNeloreItems.push(item);
    else if (pc.type === 'spotted') cattleSpottedItems.push(item);
    else if (pc.type === 'brown') cattleBrownItems.push(item);
    else if (pc.type === 'horse') horseItems.push(item);
  }

  // 14. Maquinário Agrícola (Tratores e Colheitadeiras nas lavouras - ID 39 & 41)
  // Alinhados exatamente com as linhas de plantio e sulcos de cultivo
  for (let r = 0; r < demH; r += 8) {
    for (let c = 0; c < demW; c += 8) {
      const machC = c + pHash(c, r, 601) * 8;
      const machR = r + pHash(c, r, 602) * 8;
      const pixC = Math.max(0, Math.min(demW - 1, Math.round(machC)));
      const pixR = Math.max(0, Math.min(demH - 1, Math.round(machR)));
      const cls = rawClasses[pixR * demW + pixC];
      if (cls === 39 || cls === 41) {
        if (pHash(c, r, 603) > 0.42) {
          const seedAngle = (cls === 39) ? 180 : 210;
          const bx = Math.floor(machC / 20);
          const by = Math.floor(machR / 20);
          const parcelAngle = ((pHash(bx, by, seedAngle) * 8) | 0) * (Math.PI / 8) + (pHash(bx, by, seedAngle + 1) - 0.5) * 0.05;
          const forward = pHash(c, r, 604) > 0.5;
          // Alinhado ao longo da linha de plantio do talhão (ida ou volta no sulco)
          const machRot = forward ? (Math.PI - parcelAngle) : -parcelAngle;
          const machRnd = pHash(machC, machR, 605);
          const item = createContinuousItem(machC, machR, demW, demH, geoW, geoH, 1.25, machRnd, machRot, 0, 0, 0.002);

          if (machRnd < 0.40) {
            tractorsGreenItems.push(item);
          } else if (machRnd < 0.65) {
            tractorsRedItems.push(item);
          } else {
            harvesterItems.push(item);
          }
        }
      }
    }
  }

  // MAQUINÁRIO GARANTIDO NO PRESET "Colheitadeiras & Tratores 🚜" (Lavouras de Soja - col: 1530, row: 590)
  // Posicionados em linhas de plantio paralelas vizinhas no sentido exato da semeadura mecanizada
  const soyHeroBx = Math.floor(1530 / 20);
  const soyHeroBy = Math.floor(590 / 20);
  const soyHeroParcelAng = ((pHash(soyHeroBx, soyHeroBy, 180) * 8) | 0) * (Math.PI / 8) + (pHash(soyHeroBx, soyHeroBy, 181) - 0.5) * 0.05;
  const machSoyRot = Math.PI - soyHeroParcelAng;
  const perpSoyX = -Math.sin(soyHeroParcelAng);
  const perpSoyY = Math.cos(soyHeroParcelAng);
  const dirSoyX = Math.cos(soyHeroParcelAng);
  const dirSoyY = Math.sin(soyHeroParcelAng);

  // Colheitadeira Draper trabalhando na linha de soja
  const itemHarvester1 = createContinuousItem(1530, 590, demW, demH, geoW, geoH, 1.40, 0.5, machSoyRot, 0, 0, 0.002);
  harvesterItems.push(itemHarvester1);

  // Trator John Deere (Verde) com carretel graneleiro acompanhando na linha paralela adjacente
  const itemTractorSide = createContinuousItem(1530 + perpSoyX * 2.7, 590 + perpSoyY * 2.7, demW, demH, geoW, geoH, 1.35, 0.5, machSoyRot, 0, 0, 0.002);
  tractorsGreenItems.push(itemTractorSide);

  // Trator Case IH (Vermelho) trabalhando com grade aradora mais à frente na linha de plantio
  const itemTractorAhead = createContinuousItem(1530 + dirSoyX * 7.5, 590 + dirSoyY * 7.5, demW, demH, geoW, geoH, 1.35, 0.5, machSoyRot, 0, 0, 0.002);
  tractorsRedItems.push(itemTractorAhead);

  // Segundo grupo de maquinário na lavoura temporária / milho (col: 1340, row: 680)
  const tempHeroBx = Math.floor(1340 / 20);
  const tempHeroBy = Math.floor(680 / 20);
  const tempHeroAng = ((pHash(tempHeroBx, tempHeroBy, 210) * 8) | 0) * (Math.PI / 8) + (pHash(tempHeroBx, tempHeroBy, 211) - 0.5) * 0.05;
  const machTempRot = Math.PI - tempHeroAng;
  harvesterItems.push(createContinuousItem(1340, 680, demW, demH, geoW, geoH, 1.35, 0.5, machTempRot, 0, 0, 0.002));
  tractorsGreenItems.push(createContinuousItem(1340 - Math.sin(tempHeroAng) * 2.8, 680 + Math.cos(tempHeroAng) * 2.8, demW, demH, geoW, geoH, 1.30, 0.5, machTempRot, 0, 0, 0.002));

  // Materiais PBR Sólidos com Vertex Colors para Vegetação e Elementos 3D
  const botanicalMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.04,
    flatShading: true
  });

  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true
  });

  const pastureMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.03,
    flatShading: true
  });

  const urbanMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.80,
    metalness: 0.08,
    flatShading: true
  });

  // 1. Mata Tropical (Dossel 3D volumétrico multi-camadas)
  setupInstancedSolidLayer('forest', 'forest', createTropicalTree3DGeo(), botanicalMat, forestItems);

  // 2. Cerrado - Árvores tortuosas (Tronco retorcido + copa aberta)
  setupInstancedSolidLayer('cerrado_trees', 'cerrado', createCerradoTree3DGeo(), botanicalMat, cerradoTreeItems);

  // 2. Cerrado - Arbustos densos (Moitas 3D volumétricas)
  setupInstancedSolidLayer('cerrado_shrubs', 'cerrado', createCerradoShrub3DGeo(), botanicalMat, cerradoShrubItems);

  // 3. Rochas de Quartzito & Campo Rupestre (Blocos geológicos facetados + Vellozia)
  setupInstancedSolidLayer('rocks', 'rocks', createQuartziteRock3DGeo(), rockMat, rocksItems);

  // 4. Pastagem / Capim Braquiária (Campo denso volumétrico de pasto)
  setupInstancedSolidLayer('pasture', 'pasture', create3DPastureTuftGeo(), pastureMat, pastureItems);

  // 5. Silvicultura / Eucalipto (Árvores esguias em linhas)
  setupInstancedSolidLayer('silviculture', 'silviculture', createEucalyptus3DGeo(), botanicalMat, silvicultureItems);

  // 6. Campo Nativo (Gramíneas nativas com plumas campestres 3D)
  setupInstancedSolidLayer('grassland', 'grassland', createGrasslandNative3DGeo(), pastureMat, grasslandItems);

  // 7. Estruturas Arquitetônicas Coloniais Reais de Goiás Velho (Casas Térreas Coloridas, Sobrados com Sacadas, Igreja Barroca, Lampiões e Ipês)
  setupInstancedSolidLayer('urban_houses_white', 'urban', createDetailedColonialHouseGeo(0), urbanMat, urbanHousesWhite);
  setupInstancedSolidLayer('urban_houses_ochre', 'urban', createDetailedColonialHouseGeo(1), urbanMat, urbanHousesOchre);
  setupInstancedSolidLayer('urban_houses_green', 'urban', createDetailedColonialHouseGeo(2), urbanMat, urbanHousesGreen);
  setupInstancedSolidLayer('urban_houses_rose',  'urban', createDetailedColonialHouseGeo(3), urbanMat, urbanHousesRose);
  setupInstancedSolidLayer('urban_sobrados',      'urban', createDetailedColonialSobradoGeo(0), urbanMat, urbanSobrados);
  setupInstancedSolidLayer('urban_sobrados_ochre','urban', createDetailedColonialSobradoGeo(1), urbanMat, urbanSobradosOchre);
  setupInstancedSolidLayer('urban_churches',      'urban', createDetailedColonialChurchGeo(), urbanMat, urbanChurches);
  setupInstancedSolidLayer('urban_lanterns',          'urban', createColonialLanternGeo(), urbanMat, urbanLanterns);
  setupInstancedSolidLayer('urban_trees_green',      'urban', createColonialYardTreeGeo('green'),      botanicalMat, urbanTreesGreen);
  setupInstancedSolidLayer('urban_trees_deep_green', 'urban', createColonialYardTreeGeo('deep_green'), botanicalMat, urbanTreesDeepGreen);
  setupInstancedSolidLayer('urban_trees_yellow',     'urban', createColonialYardTreeGeo('yellow'),     botanicalMat, urbanTreesYellow);
  setupInstancedSolidLayer('urban_trees_pink',       'urban', createColonialYardTreeGeo('pink'),       botanicalMat, urbanTreesPink);

  // 8. Soja (3.2.1.1)
  setupInstancedSolidLayer('soybean', 'soybean', createSoybeanCrop3DGeo(), botanicalMat, soybeanItems);

  // 9. Outras Lavouras Temporárias (3.2.1.5)
  setupInstancedSolidLayer('tempcrops', 'tempcrops', createTemporaryCrop3DGeo(), botanicalMat, tempCropsItems);

  // 10. Campo Alagado e Veredas de Buriti (2.3)
  setupInstancedSolidLayer('wetland', 'wetland', createBuritiPalm3DGeo(), botanicalMat, wetlandItems);

  // 11. Solo Exposto & Não Vegetado (4.6)
  setupInstancedSolidLayer('bare', 'bare', createBareGround3DGeo(), rockMat, bareItems);

  // 12. Rios e Margens Ripárias (5.1)
  setupInstancedSolidLayer('water', 'water', createRiverBank3DGeo(), rockMat, waterItems);

  // 13. Rebanho Bovino (Vaquinhas Nelore brancas, malhadas P&B e girolando castanhas)
  setupInstancedSolidLayer('cattle_nelore',  'cattle', createNeloreCowGeo('nelore'),  rockMat, cattleNeloreItems);
  setupInstancedSolidLayer('cattle_spotted', 'cattle', createNeloreCowGeo('spotted'), rockMat, cattleSpottedItems);
  setupInstancedSolidLayer('cattle_brown',   'cattle', createNeloreCowGeo('brown'),   rockMat, cattleBrownItems);

  // 14. Cavalos nas Pastagens
  setupInstancedSolidLayer('horses', 'cattle', createHorseGeo(), rockMat, horseItems);

  // 15. Maquinário Agrícola (Tratores verdes John Deere / vermelhos Case e Colheitadeiras Draper)
  setupInstancedSolidLayer('tractors_green', 'machinery', createTractorGeo(true),  urbanMat, tractorsGreenItems);
  setupInstancedSolidLayer('tractors_red',   'machinery', createTractorGeo(false), urbanMat, tractorsRedItems);
  setupInstancedSolidLayer('harvesters',     'machinery', createHarvesterGeo(),    urbanMat, harvesterItems);

  const totalProps = forestItems.length + cerradoTreeItems.length + cerradoShrubItems.length +
                     rocksItems.length + pastureItems.length + silvicultureItems.length +
                     grasslandItems.length +
                     urbanHousesWhite.length + urbanHousesOchre.length + urbanHousesGreen.length + urbanHousesRose.length +
                     urbanSobrados.length + urbanSobradosOchre.length + urbanChurches.length + urbanLanterns.length +
                     urbanTreesGreen.length + urbanTreesDeepGreen.length + urbanTreesYellow.length + urbanTreesPink.length +
                     soybeanItems.length + tempCropsItems.length + wetlandItems.length +
                     bareItems.length + waterItems.length +
                     cattleNeloreItems.length + cattleSpottedItems.length + cattleBrownItems.length +
                     horseItems.length + tractorsGreenItems.length + tractorsRedItems.length + harvesterItems.length;

  if (badgePropsCount) {
    badgePropsCount.textContent = totalProps.toLocaleString('pt-BR') + ' objetos 3D';
  }
}

function setupInstancedSolidLayer(layerKey, categoryKey, geometry, material, items) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.castShadow = state.props.castShadows;
  mesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const s = state.props.scale;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
    dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
    dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = state.props.categories[categoryKey] && state.props.enabled;
  propsGroup.add(mesh);

  propLayers[layerKey] = { mesh, items, category: categoryKey };
}

// 9. Update Props Transforms (Exaggeration & Scale)
function updatePropsTransforms() {
  if (!propsGroup) return;
  const dummy = new THREE.Object3D();
  const s = state.props.scale;

  for (const key of Object.keys(propLayers)) {
    const layer = propLayers[key];
    const mesh = layer.mesh;
    const items = layer.items;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
      dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
      dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// 10. Update Exaggeration Dynamically (Terrain + Props)
function updateExaggeration(val) {
  state.exaggeration = val;
  if (!terrainGeometry || !rawElevations) return;

  const segW = 825;
  const segH = 423;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const posAttr = terrainGeometry.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const col = i % (segW + 1);
    const row = Math.floor(i / (segW + 1));
    const normU = col / segW;
    const normV = row / segH;
    const normElev = getBilinearElevation(normU, normV, demW, demH);
    const heightVal = normElev * state.baseHeight * state.exaggeration;
    posAttr.setY(i, heightVal);
  }

  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  updatePropsTransforms();
}

// 11. Layer & Opacity Control
function applyLayerMode() {
  if (!terrainMesh || !overlayMesh) return;

  const opacityGroup = document.getElementById('group-opacity');

  if (state.activeLayer === 'satellite') {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';

  } else if (state.activeLayer === 'blend') {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = true;
    overlayMesh.material.map = textures.mapbiomas;
    overlayMesh.material.opacity = state.mapbiomasOpacity;
    if (opacityGroup) opacityGroup.style.display = 'flex';

  } else if (state.activeLayer === 'mapbiomas') {
    terrainMesh.material.map = textures.mapbiomas;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';

  } else if (state.activeLayer === 'hypsometric') {
    terrainMesh.material.map = textures.hypsometric;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';
  }

  const resGroup = document.getElementById('group-texture-res');
  if (resGroup) {
    resGroup.style.display = (state.activeLayer === 'satellite' || state.activeLayer === 'blend') ? 'flex' : 'none';
  }

  terrainMesh.material.needsUpdate = true;
  overlayMesh.material.needsUpdate = true;
}

// 11.1 Dynamic Satellite Texture Resolution Switcher (4K, 8K, 12K Ultra)
async function setSatelliteResolution(res) {
  if (state.satResolution === res) return;
  const badge = document.getElementById('badge-sat-res');

  const maxTex = renderer ? renderer.capabilities.maxTextureSize : 8192;
  if (res === '12k' && maxTex < 12000) {
    alert(`Atenção: Sua GPU/WebGL reporta limite máximo de textura de ${maxTex}px. O modo 8K (8.192px) é o limite seguro do seu hardware.`);
    return;
  }

  document.querySelectorAll('#btn-group-sat-res .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.res === res);
  });

  state.satResolution = res;
  const labelMap = {
    '4k': '4K (4.096px)',
    '8k': '8K (8.192px)',
    '12k': '12K Ultra (12.288px)'
  };

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;

  let tex = textures['sat' + res];
  if (!tex) {
    if (badge) badge.textContent = `Carregando ${res.toUpperCase()}...`;
    const url = res === '12k' ? 'public/satellite_texture_12k.jpg' :
                res === '8k'  ? 'public/satellite_texture_8k.jpg' :
                                'public/satellite_texture_4k.jpg';
    try {
      tex = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      textures['sat' + res] = tex;
    } catch (err) {
      console.error('Erro ao carregar textura ' + res + ':', err);
      if (badge) badge.textContent = 'Erro ao carregar';
      return;
    }
  }

  if (badge) badge.textContent = labelMap[res] || res;
  textures.satellite = tex;

  if (terrainMesh && (state.activeLayer === 'satellite' || state.activeLayer === 'blend')) {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.needsUpdate = true;
  }
}

// 12. Camera Presets (Calibrados para Escala 1:1 Real)
function setCameraPreset(preset) {
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.btn-preset[data-view="${preset}"]`);
  if (btn) btn.classList.add('active');

  if (preset === 'crista') {
    animateCamera(12, 5.0, 18, 22, 2.6, 6);
  } else if (preset === 'urbano') {
    // Praça e Adro Histórico de Goiás Velho: Igreja Barroca com Sinos, Cruzeiro, Sobrados e Lampiões
    animateCamera(56.6, 0.96, -44.5, 58.04, 0.79, -46.45);
  } else if (preset === 'floresta') {
    animateCamera(-15, 4.2, 16, 2, 1.6, 8);
  } else if (preset === 'rebanho') {
    // Enquadramento de close-up em rebanho de pasto com gado bovino Nelore e cavalo
    animateCamera(13.6, 0.48, -19.0, 12.8, 0.40, -19.9);
  } else if (preset === 'maquinario') {
    // Enquadramento cinematográfico na colheitadeira Draper e trator John Deere alinhados nas linhas de soja
    animateCamera(86.55, 2.05, 19.10, 85.35, 1.78, 20.25);
  } else if (preset === 'soja') {
    // Vista aérea rasante cinematográfica sobre as linhas paralelas de semeadura da lavoura de soja
    animateCamera(83.60, 2.70, 22.40, 85.80, 1.78, 19.80);
  } else if (preset === 'silvicultura') {
    // Talhões florestais de eucalipto plantados em linhas e corredores geométricos
    animateCamera(77.20, 2.75, 15.60, 80.72, 1.80, 12.98);
  } else if (preset === 'veredas') {
    animateCamera(57, 2.4, -18, 62.2, 0.9, -22.4);
  } else if (preset === 'rios') {
    animateCamera(16, 1.8, -32, 20.2, 0.6, -36.8);
  } else if (preset === 'panoramica') {
    animateCamera(-42, 28, 68, 10, 1.4, 5);
  } else {
    animateCamera(-30, 22, 60, 10, 1.6, 5);
  }
}

let activeCameraAnimId = null;

function animateCamera(targetX, targetY, targetZ, lookX, lookY, lookZ, duration = 1200) {
  if (activeCameraAnimId) {
    cancelAnimationFrame(activeCameraAnimId);
    activeCameraAnimId = null;
  }

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(targetX, targetY, targetZ);
  const endTarget = new THREE.Vector3(lookX, lookY, lookZ);

  let progress = 0;
  const startTime = performance.now();

  function step(now) {
    progress = Math.min(1, (now - startTime) / duration);
    const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();

    if (progress < 1) {
      activeCameraAnimId = requestAnimationFrame(step);
    } else {
      activeCameraAnimId = null;
    }
  }

  activeCameraAnimId = requestAnimationFrame(step);
}

// 13. UI Event Listeners
function setupEventListeners() {
  sliderExaggeration.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valExaggeration.textContent = val.toFixed(1) + (val === 1.0 ? 'x (1:1 Real)' : 'x');
    updateExaggeration(val);
  });

  sliderSunAzimuth.addEventListener('input', (e) => {
    state.sunAzimuth = parseInt(e.target.value);
    valSunAzimuth.textContent = state.sunAzimuth + '°';
    updateSunPosition();
  });

  sliderSunElevation.addEventListener('input', (e) => {
    state.sunElevation = parseInt(e.target.value);
    valSunElevation.textContent = state.sunElevation + '°';
    updateSunPosition();
  });

  sliderOpacity.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valOpacity.textContent = val + '%';
    state.mapbiomasOpacity = val / 100.0;
    if (overlayMesh) {
      overlayMesh.material.opacity = state.mapbiomasOpacity;
    }
  });

  // Props Controls
  if (checkProps) {
    checkProps.addEventListener('change', (e) => {
      state.props.enabled = e.target.checked;
      if (propsGroup) propsGroup.visible = state.props.enabled;
    });
  }

  if (checkPropsShadows) {
    checkPropsShadows.addEventListener('change', (e) => {
      state.props.castShadows = e.target.checked;
      for (const key of Object.keys(propLayers)) {
        propLayers[key].mesh.castShadow = state.props.castShadows;
      }
    });
  }

  if (sliderPropScale) {
    sliderPropScale.addEventListener('input', (e) => {
      state.props.scale = parseFloat(e.target.value);
      if (valPropScale) {
        valPropScale.textContent = state.props.scale.toFixed(1) + (state.props.scale === 1.0 ? 'x (1:1 Botânico)' : 'x');
      }
      updatePropsTransforms();
    });
  }

  // 8.2 Controle Dinâmico de Densidade de Vegetação e Props (+ props por pixel)
  function setPropsDensity(newDensity) {
    state.props.density = newDensity;
    const tiers = [1.0, 1.5, 2.0, 2.5];
    const nextIdx = (tiers.indexOf(newDensity) + 1) % tiers.length;
    const nextTier = tiers[nextIdx];

    const labelMap = {
      1.0: '1.0x Padrão',
      1.5: '1.5x Alta (+50%)',
      2.0: '2.0x Densa (+100%)',
      2.5: '2.5x Ultra (+150%)'
    };

    const nextBadgeMap = {
      1.0: '+50% (1.5x)',
      1.5: '+100% (2.0x)',
      2.0: '+150% (2.5x)',
      2.5: 'Padrão (1.0x)'
    };

    if (valPropDensity) {
      valPropDensity.textContent = labelMap[newDensity] || (newDensity.toFixed(1) + 'x');
    }
    if (badgeDensityNext) {
      badgeDensityNext.textContent = nextBadgeMap[newDensity] || (`Próximo: ${nextTier.toFixed(1)}x`);
    }

    document.querySelectorAll('.btn-density').forEach(btn => {
      const bD = parseFloat(btn.dataset.density);
      btn.classList.toggle('active', Math.abs(bD - newDensity) < 0.05);
    });

    if (state.props.enabled) {
      buildPropsMeshes();
    }
  }

  window.setPropsDensity = setPropsDensity;

  if (btnIncreaseDensity) {
    btnIncreaseDensity.addEventListener('click', () => {
      const tiers = [1.0, 1.5, 2.0, 2.5];
      let cur = state.props.density || 1.0;
      let idx = tiers.findIndex(t => Math.abs(t - cur) < 0.05);
      if (idx === -1) idx = 0;
      let nextIdx = (idx + 1) % tiers.length;
      setPropsDensity(tiers[nextIdx]);

      btnIncreaseDensity.classList.add('pulse');
      setTimeout(() => btnIncreaseDensity.classList.remove('pulse'), 300);
    });
  }

  document.querySelectorAll('.btn-density').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseFloat(btn.dataset.density);
      if (!isNaN(d)) {
        setPropsDensity(d);
      }
    });
  });

  // Botão "🎯 Resetar para Escala 1:1 Real"
  const btnScale1to1 = document.getElementById('btn-scale-1to1');
  if (btnScale1to1) {
    btnScale1to1.addEventListener('click', () => {
      sliderExaggeration.value = '1.0';
      valExaggeration.textContent = '1.0x (1:1 Real)';
      updateExaggeration(1.0);

      if (sliderPropScale) {
        sliderPropScale.value = '1.0';
        if (valPropScale) valPropScale.textContent = '1.0x (1:1 Botânico)';
        state.props.scale = 1.0;
        updatePropsTransforms();
      }

      // Transição suave para enquadramento equilibrado em escala 1:1
      animateCamera(-30, 22, 60, 10, 1.6, 5);
    });
  }

  // Props Individual Category Chips
  document.querySelectorAll('.prop-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const propKey = chip.dataset.prop;
      const isActive = chip.classList.contains('active');
      if (isActive) {
        chip.classList.remove('active');
        chip.classList.add('disabled');
        state.props.categories[propKey] = false;
      } else {
        chip.classList.add('active');
        chip.classList.remove('disabled');
        state.props.categories[propKey] = true;
      }
      for (const [key, layer] of Object.entries(propLayers)) {
        if (layer.category === propKey || key === propKey) {
          layer.mesh.visible = state.props.categories[propKey] && state.props.enabled;
        }
      }
    });
  });

  // Layer buttons
  document.querySelectorAll('#btn-group-layer .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#btn-group-layer .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeLayer = btn.dataset.layer;
      applyLayerMode();
    });
  });

  // Satellite Resolution buttons (4K, 8K, 12K Ultra)
  document.querySelectorAll('#btn-group-sat-res .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSatelliteResolution(btn.dataset.res);
    });
  });

  // Camera preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    if (btn.id === 'btn-scale-1to1') return; // Manipulado separadamente
    btn.addEventListener('click', () => {
      setCameraPreset(btn.dataset.view);
    });
  });

  // Turntable
  checkTurntable.addEventListener('change', (e) => {
    state.turntable = e.target.checked;
    controls.autoRotate = state.turntable;
    controls.autoRotateSpeed = 1.2;
  });

  // Wireframe
  checkWireframe.addEventListener('change', (e) => {
    state.wireframe = e.target.checked;
    if (terrainMesh) {
      terrainMesh.material.wireframe = state.wireframe;
    }
  });

  // Reset view
  btnResetView.addEventListener('click', () => {
    animateCamera(-30, 22, 60, 10, 1.6, 5);
  });

  // Compass widget
  compassWidget.addEventListener('click', () => {
    animateCamera(0, 32, 65, 0, 1.5, 0);
  });

  // Funções de visibilidade dos painéis flutuantes (HUD)
  function hideControlPanel() {
    if (controlPanel) controlPanel.classList.add('minimized');
    if (btnShowPanel) btnShowPanel.classList.add('active');
    updateMasterToggleButton();
  }

  function showControlPanel() {
    if (controlPanel) controlPanel.classList.remove('minimized');
    if (btnShowPanel) btnShowPanel.classList.remove('active');
    updateMasterToggleButton();
  }

  function hideLegendPanel() {
    if (legendPanel) legendPanel.classList.add('minimized');
    if (btnShowLegend) btnShowLegend.classList.add('active');
    updateMasterToggleButton();
  }

  function showLegendPanel() {
    if (legendPanel) legendPanel.classList.remove('minimized');
    if (btnShowLegend) btnShowLegend.classList.remove('active');
    updateMasterToggleButton();
  }

  function updateMasterToggleButton() {
    if (!labelToggleAll || !iconToggleAll) return;
    const isControlMin = controlPanel && controlPanel.classList.contains('minimized');
    const isLegendMin = !legendPanel || legendPanel.classList.contains('minimized');
    if (isControlMin && isLegendMin) {
      labelToggleAll.textContent = 'Exibir Menus';
      iconToggleAll.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
      labelToggleAll.textContent = 'Ocultar Menus';
      iconToggleAll.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  }

  function toggleAllMenus() {
    const isControlMin = controlPanel && controlPanel.classList.contains('minimized');
    const isLegendMin = !legendPanel || legendPanel.classList.contains('minimized');
    if (isControlMin && isLegendMin) {
      showControlPanel();
      showLegendPanel();
    } else {
      hideControlPanel();
      hideLegendPanel();
    }
  }

  if (btnTogglePanel) btnTogglePanel.addEventListener('click', hideControlPanel);
  if (btnShowPanel) btnShowPanel.addEventListener('click', showControlPanel);
  if (btnToggleLegend) btnToggleLegend.addEventListener('click', hideLegendPanel);
  if (btnShowLegend) btnShowLegend.addEventListener('click', showLegendPanel);
  if (btnToggleAllMenus) btnToggleAllMenus.addEventListener('click', toggleAllMenus);

  // Modal de Estatísticas de Área & Classes
  const modalStats = document.getElementById('modal-stats');
  const btnOpenStats = document.getElementById('btn-open-stats');
  const btnCloseStats = document.getElementById('btn-close-stats');
  const btnCloseStatsFooter = document.getElementById('btn-close-stats-footer');
  const btnCopyStats = document.getElementById('btn-copy-stats');
  const btnExportCsv = document.getElementById('btn-export-csv');

  function openStatsModal() {
    if (modalStats) modalStats.classList.add('active');
  }

  function closeStatsModal() {
    if (modalStats) modalStats.classList.remove('active');
  }

  if (btnOpenStats) btnOpenStats.addEventListener('click', openStatsModal);
  if (btnCloseStats) btnCloseStats.addEventListener('click', closeStatsModal);
  if (btnCloseStatsFooter) btnCloseStatsFooter.addEventListener('click', closeStatsModal);

  if (modalStats) {
    modalStats.addEventListener('click', (e) => {
      if (e.target === modalStats) closeStatsModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStats && modalStats.classList.contains('active')) {
      closeStatsModal();
    }
  });

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportStatisticsCSV);
  }

  if (btnCopyStats) {
    btnCopyStats.addEventListener('click', () => copyStatisticsSummary(btnCopyStats));
  }
}

// Exportação CSV das estatísticas territoriais
function exportStatisticsCSV() {
  if (!state.metadata || !state.metadata.classes) return;
  let csv = 'ID,Classe_PT,Classe_EN,Grupo,Pixels_30m,Area_ha,Area_km2,Percentual\r\n';
  state.metadata.classes.forEach(c => {
    const ha = c.area_ha || (c.count * 0.09);
    const km2 = c.area_km2 || (ha / 100);
    csv += `"${c.id}","${c.name_pt}","${c.name_en || ''}","${c.group || ''}",${c.count},${ha.toFixed(2)},${km2.toFixed(4)},${c.percentage.toFixed(2)}\r\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mapbiomas_estatisticas_serra_dourada.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Cópia rápida do resumo estatístico
function copyStatisticsSummary(btn) {
  if (!state.metadata || !state.metadata.statistics) return;
  const s = state.metadata.statistics;
  let summary = `MapBiomas Brasil Col. 11 (2025) - Estatísticas Territoriais da Serra Dourada (GO)\n`;
  summary += `Área Total Mapeada: ${s.total_area_ha.toLocaleString('pt-BR')} ha (${s.total_area_km2.toLocaleString('pt-BR')} km² | ${s.total_pixels.toLocaleString('pt-BR')} pixels de 30m)\n\n`;
  summary += `Balanço por Macrogrupo:\n`;
  s.groups.forEach(g => {
    summary += `• ${g.name}: ${g.area_ha.toLocaleString('pt-BR')} ha (${g.percentage.toFixed(2)}%)\n`;
  });
  summary += `\nClasses Individuais de Uso e Cobertura:\n`;
  state.metadata.classes.forEach(c => {
    summary += `• ${c.name_pt}: ${(c.area_ha || c.count * 0.09).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha (${c.percentage.toFixed(2)}%)\n`;
  });

  navigator.clipboard.writeText(summary).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span style="color: var(--accent-green); font-weight: 700;">✓ Copiado!</span>`;
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  }).catch(() => {
    alert('Resumo copiado com sucesso.');
  });
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// 14. Render Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Deslocamento suave das nuvens no céu
  if (cloudMesh && cloudMesh.material && cloudMesh.material.map) {
    cloudMesh.material.map.offset.x += 0.00004;
    cloudMesh.material.map.offset.y += 0.000018;
  }

  if (compassRose && camera) {
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const deg = THREE.MathUtils.radToDeg(az);
    compassRose.style.transform = `rotate(${deg}deg)`;
  }

  renderer.render(scene, camera);
}
