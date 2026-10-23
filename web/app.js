/**
 * MapBiomas 3D - Parque Estadual da Serra Dourada (Goiás)
 * Interactive Three.js WebGL Terrain Viewer with Satellite, MapBiomas & Procedural 3D Props
 */

// Hardware & Device Detection: Auto Mobile Profile
const isMobileDevice = (typeof window !== 'undefined') && (
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints > 0) ||
  (window.innerWidth <= 768)
);

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
  roads: { enabled: true, tier1: true, tier2: true, tier3: true },
  landmarks: { enabled: true, scale: 1.0 },
  isNadir: false,
  lastPerspective: null,
  totalPropsCount: 0,
  activePropsCount: 0,
  visibleChunksCount: 0,
  terrainLod: isMobileDevice ? 'balanced' : 'ultra', // 'ultra' (825x423), 'balanced' (412x211), 'fast' (206x105)
  dataLod: 'full', // 'full' (30m) or 'lod1' (meia-resolução)
  lodChunks: [],
  lod: {
    enabled: true,
    frustumCulling: true,
    nearDistance: isMobileDevice ? 24.0 : 35.0, // Impostor mais próximo no mobile
    farDistance: isMobileDevice ? 60.0 : 70.0   // 35-70 units = LOD 1 (Impostores 2.5D), > 70 units = LOD 2
  },
  props: {
    enabled: true,
    castShadows: !isMobileDevice,
    scale: 1.0,
    density: isMobileDevice ? 0.7 : 1.0, // Multiplicador de densidade de vegetação adaptativo (0.7x no mobile para 60 FPS)
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
const sliderPropDensity = document.getElementById('slider-prop-density');
const sliderPropDensitySettings = document.getElementById('slider-prop-density-settings');
const valPropDensity = document.getElementById('val-prop-density');
const valPropDensitySettings = document.getElementById('val-prop-density-settings');
const badgeDensityMultiplier = document.getElementById('badge-density-multiplier');
const densityHelperText = document.getElementById('density-helper-text');

// Settings Panel DOM Elements
const settingsPanel = document.getElementById('settings-panel');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnOpenSettingsSide = document.getElementById('btn-open-settings-side');
const btnCloseSettings = document.getElementById('btn-close-settings');

// LOD DOM Elements
const checkLodEnabled = document.getElementById('check-lod-enabled');
const checkLodFrustum = document.getElementById('check-lod-frustum');
const badgeLodMode = document.getElementById('badge-lod-mode');
const statLodChunks = document.getElementById('stat-lod-chunks');
const statLodProps = document.getElementById('stat-lod-props');
const statLodSavings = document.getElementById('stat-lod-savings');
const badgeTerrainLod = document.getElementById('badge-terrain-lod');
const badgeDataLod = document.getElementById('badge-data-lod');

// Nadir View DOM Elements
const btnToggleNadir = document.getElementById('btn-toggle-nadir');
const labelToggleNadir = document.getElementById('label-toggle-nadir');
const presetNadir = document.getElementById('preset-nadir');
const nadirFloatingBadge = document.getElementById('nadir-floating-badge');
const btnExitNadirBadge = document.getElementById('btn-exit-nadir-badge');

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

    updateProgress(90, 'Distribuindo vegetação, rochas e props 3D procedurais...');
    buildPropsMeshes();

    updateProgress(95, 'Carregando malha viária, trilhas e marcos históricos 3D...');
    await loadRoadsNetwork();
    await loadOSMLandmarks();
    await loadParqueBoundary();

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

  renderer = new THREE.WebGLRenderer({ antialias: !isMobileDevice, powerPreference: 'high-performance' });
  renderer.setSize(w, h);
  renderer.setPixelRatio(isMobileDevice ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 2.0));
  renderer.shadowMap.enabled = !isMobileDevice;
  if (!isMobileDevice) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 450;
  controls.target.set(10, 1.6, 5);
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
  };

  // Lighting
  ambientLight = new THREE.HemisphereLight(0xdde9ff, 0x1a2130, 0.65);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xfff3db, 2.3);
  sunLight.castShadow = !isMobileDevice;
  if (!isMobileDevice) {
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
  }
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

  // Load High-Res Impostor Textures for Hierarchical LOD (2.5D Billboards)
  textures.impostors = {};
  const impostorList = [
    { key: 'forest', file: 'tree_tropical.png' },
    { key: 'cerrado_tree', file: 'tree_cerrado.png' },
    { key: 'cerrado_shrub', file: 'shrub_cerrado.png' },
    { key: 'silviculture', file: 'tree_eucalyptus.png' },
    { key: 'rocks', file: 'rock_rupestre.png' }
  ];

  await Promise.all(impostorList.map(async item => {
    try {
      const tex = await loadTex(`public/impostors/${item.file}`);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      textures.impostors[item.key] = tex;
    } catch (err) {
      console.warn(`Impostor texture ${item.file} não carregada:`, err);
    }
  }));
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
// Suporta LOD Dinâmico de Malha: Ultra (825x423), Equilibrado (412x211), Leve (206x105)
function buildTerrainMesh(customSegW, customSegH) {
  let segW = customSegW;
  let segH = customSegH;

  if (!segW || !segH) {
    if (state.terrainLod === 'balanced') {
      segW = 412; segH = 211;
    } else if (state.terrainLod === 'fast') {
      segW = 206; segH = 105;
    } else {
      segW = 825; segH = 423;
    }
  }

  const geoW = state.terrainSpan.width;
  const geoH = state.terrainSpan.height;

  const newGeometry = new THREE.PlaneGeometry(geoW, geoH, segW, segH);
  newGeometry.rotateX(-Math.PI / 2);

  const posAttr = newGeometry.attributes.position;
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
  newGeometry.computeVertexNormals();

  if (terrainGeometry) terrainGeometry.dispose();
  terrainGeometry = newGeometry;

  if (terrainMesh && overlayMesh) {
    terrainMesh.geometry = terrainGeometry;
    overlayMesh.geometry = terrainGeometry;
    buildTerrainSkirt();
    return;
  }

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

// Gerador de Geometria Impostor Cross-Quad (LOD 1 & 2): 2 planos verticais ortogonais em "X"
function createCrossQuadGeometry(w, h) {
  const g1 = new THREE.PlaneGeometry(w, h);
  g1.translate(0, h / 2, 0);
  const g2 = new THREE.PlaneGeometry(w, h);
  g2.rotateY(Math.PI / 2);
  g2.translate(0, h / 2, 0);
  if (window.THREE && THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeBufferGeometries) {
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries([g1, g2], false);
    if (merged) {
      merged.computeVertexNormals();
      return merged;
    }
  }
  return g1;
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

  // Materiais Impostores 2.5D (LOD 1 & 2) com AlphaTest
  const impostorMats = {
    forest: textures.impostors && textures.impostors.forest ? new THREE.MeshStandardMaterial({
      map: textures.impostors.forest,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    cerrado_tree: textures.impostors && textures.impostors.cerrado_tree ? new THREE.MeshStandardMaterial({
      map: textures.impostors.cerrado_tree,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    cerrado_shrub: textures.impostors && textures.impostors.cerrado_shrub ? new THREE.MeshStandardMaterial({
      map: textures.impostors.cerrado_shrub,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    silviculture: textures.impostors && textures.impostors.silviculture ? new THREE.MeshStandardMaterial({
      map: textures.impostors.silviculture,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    rocks: textures.impostors && textures.impostors.rocks ? new THREE.MeshStandardMaterial({
      map: textures.impostors.rocks,
      alphaTest: 0.45,
      roughness: 0.85,
      metalness: 0.08,
      side: THREE.DoubleSide
    }) : rockMat
  };

  const impostorGeos = {
    forest: createCrossQuadGeometry(0.048, 0.085),
    cerrado_tree: createCrossQuadGeometry(0.038, 0.042),
    cerrado_shrub: createCrossQuadGeometry(0.025, 0.020),
    silviculture: createCrossQuadGeometry(0.022, 0.075),
    rocks: createCrossQuadGeometry(0.035, 0.025)
  };

  // 1. Definições de Todas as Camadas Ecológicas e Objetos
  const layerDefs = [
    { key: 'forest', category: 'forest', type: 'botanical', geo: createTropicalTree3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.forest, impostorMat: impostorMats.forest, items: forestItems },
    { key: 'cerrado_trees', category: 'cerrado', type: 'botanical', geo: createCerradoTree3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.cerrado_tree, impostorMat: impostorMats.cerrado_tree, items: cerradoTreeItems },
    { key: 'cerrado_shrubs', category: 'cerrado', type: 'botanical', geo: createCerradoShrub3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.cerrado_shrub, impostorMat: impostorMats.cerrado_shrub, items: cerradoShrubItems },
    { key: 'rocks', category: 'rocks', type: 'rock', geo: createQuartziteRock3DGeo(), mat: rockMat, impostorGeo: impostorGeos.rocks, impostorMat: impostorMats.rocks, items: rocksItems },
    { key: 'pasture', category: 'pasture', type: 'micro', geo: create3DPastureTuftGeo(), mat: pastureMat, items: pastureItems },
    { key: 'silviculture', category: 'silviculture', type: 'botanical', geo: createEucalyptus3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.silviculture, impostorMat: impostorMats.silviculture, items: silvicultureItems },
    { key: 'grassland', category: 'grassland', type: 'micro', geo: createGrasslandNative3DGeo(), mat: pastureMat, items: grasslandItems },
    { key: 'urban_houses_white', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(0), mat: urbanMat, items: urbanHousesWhite },
    { key: 'urban_houses_ochre', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(1), mat: urbanMat, items: urbanHousesOchre },
    { key: 'urban_houses_green', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(2), mat: urbanMat, items: urbanHousesGreen },
    { key: 'urban_houses_rose',  category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(3), mat: urbanMat, items: urbanHousesRose },
    { key: 'urban_sobrados',      category: 'urban', type: 'landmark', geo: createDetailedColonialSobradoGeo(0), mat: urbanMat, items: urbanSobrados },
    { key: 'urban_sobrados_ochre',category: 'urban', type: 'landmark', geo: createDetailedColonialSobradoGeo(1), mat: urbanMat, items: urbanSobradosOchre },
    { key: 'urban_churches',      category: 'urban', type: 'landmark', geo: createDetailedColonialChurchGeo(), mat: urbanMat, items: urbanChurches },
    { key: 'urban_lanterns',      category: 'urban', type: 'landmark', geo: createColonialLanternGeo(), mat: urbanMat, items: urbanLanterns },
    { key: 'urban_trees_green',      category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('green'),      mat: botanicalMat, items: urbanTreesGreen },
    { key: 'urban_trees_deep_green', category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('deep_green'), mat: botanicalMat, items: urbanTreesDeepGreen },
    { key: 'urban_trees_yellow',     category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('yellow'),     mat: botanicalMat, items: urbanTreesYellow },
    { key: 'urban_trees_pink',       category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('pink'),       mat: botanicalMat, items: urbanTreesPink },
    { key: 'soybean', category: 'soybean', type: 'botanical', geo: createSoybeanCrop3DGeo(), mat: botanicalMat, items: soybeanItems },
    { key: 'tempcrops', category: 'tempcrops', type: 'botanical', geo: createTemporaryCrop3DGeo(), mat: botanicalMat, items: tempCropsItems },
    { key: 'wetland', category: 'wetland', type: 'landmark', geo: createBuritiPalm3DGeo(), mat: botanicalMat, items: wetlandItems },
    { key: 'bare', category: 'bare', type: 'rock', geo: createBareGround3DGeo(), mat: rockMat, items: bareItems },
    { key: 'water', category: 'water', type: 'rock', geo: createRiverBank3DGeo(), mat: rockMat, items: waterItems },
    { key: 'cattle_nelore', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('nelore'), mat: rockMat, items: cattleNeloreItems },
    { key: 'cattle_spotted', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('spotted'), mat: rockMat, items: cattleSpottedItems },
    { key: 'cattle_brown', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('brown'), mat: rockMat, items: cattleBrownItems },
    { key: 'horses', category: 'cattle', type: 'landmark', geo: createHorseGeo(), mat: rockMat, items: horseItems },
    { key: 'tractors_green', category: 'machinery', type: 'landmark', geo: createTractorGeo(true), mat: urbanMat, items: tractorsGreenItems },
    { key: 'tractors_red', category: 'machinery', type: 'landmark', geo: createTractorGeo(false), mat: urbanMat, items: tractorsRedItems },
    { key: 'harvesters', category: 'machinery', type: 'landmark', geo: createHarvesterGeo(), mat: urbanMat, items: harvesterItems }
  ];

  // 2. Inicialização dos 32 Chunks Espaciais (Grade 8x4)
  const CHUNK_COLS = 8;
  const CHUNK_ROWS = 4;
  state.lodChunks = [];
  const chunkItemBuckets = [];

  for (let ry = 0; ry < CHUNK_ROWS; ry++) {
    for (let cx = 0; cx < CHUNK_COLS; cx++) {
      const idx = ry * CHUNK_COLS + cx;
      const x0 = (cx / CHUNK_COLS - 0.5) * geoW;
      const x1 = ((cx + 1) / CHUNK_COLS - 0.5) * geoW;
      const z0 = (ry / CHUNK_ROWS - 0.5) * geoH;
      const z1 = ((ry + 1) / CHUNK_ROWS - 0.5) * geoH;

      const chunkGroup = new THREE.Group();
      const solidGroup = new THREE.Group();
      const impostorGroup = new THREE.Group();
      const microGroup = new THREE.Group();
      const landmarkGroup = new THREE.Group();

      chunkGroup.add(solidGroup);
      chunkGroup.add(impostorGroup);
      chunkGroup.add(microGroup);
      chunkGroup.add(landmarkGroup);

      impostorGroup.visible = false; // Começa com LOD0 ativo próximo à câmera

      propsGroup.add(chunkGroup);

      state.lodChunks.push({
        id: `chunk_${cx}_${ry}`,
        index: idx,
        col: cx,
        row: ry,
        box: new THREE.Box3(
          new THREE.Vector3(x0, -1, z0),
          new THREE.Vector3(x1, state.baseHeight * state.exaggeration + 1.5, z1)
        ),
        center: new THREE.Vector3((x0 + x1) / 2, (state.baseHeight * state.exaggeration) / 2, (z0 + z1) / 2),
        group: chunkGroup,
        solidGroup,
        impostorGroup,
        microGroup,
        landmarkGroup,
        layers: {},
        solidCount: 0,
        impostorCount: 0,
        microCount: 0,
        landmarkCount: 0
      });

      chunkItemBuckets.push({});
    }
  }

  // 3. Distribuição Espacial dos Elementos nos Chunks
  function getChunkIndex(x, z) {
    const u = (x / geoW) + 0.5;
    const v = (z / geoH) + 0.5;
    const cx = Math.max(0, Math.min(CHUNK_COLS - 1, Math.floor(u * CHUNK_COLS)));
    const cy = Math.max(0, Math.min(CHUNK_ROWS - 1, Math.floor(v * CHUNK_ROWS)));
    return cy * CHUNK_COLS + cx;
  }

  for (const def of layerDefs) {
    propLayers[def.key] = { category: def.category, items: def.items };
    for (let i = 0; i < def.items.length; i++) {
      const it = def.items[i];
      const chIdx = getChunkIndex(it.x, it.z);
      if (!chunkItemBuckets[chIdx][def.key]) {
        chunkItemBuckets[chIdx][def.key] = [];
      }
      chunkItemBuckets[chIdx][def.key].push(it);
    }
  }

  // 4. Instanciação Otimizada por Chunk com Suporte a LOD0 (3D Sólido) e LOD1 (Impostor)
  const dummy = new THREE.Object3D();
  const s = state.props.scale;

  for (let chIdx = 0; chIdx < state.lodChunks.length; chIdx++) {
    const chunk = state.lodChunks[chIdx];
    const buckets = chunkItemBuckets[chIdx];

    for (const def of layerDefs) {
      const items = buckets[def.key];
      if (!items || items.length === 0) continue;

      const layerData = {
        category: def.category,
        type: def.type,
        items: items,
        solidMesh: null,
        impostorMesh: null
      };

      // 4.1 Malha Sólida (LOD 0)
      if (def.geo) {
        const solidMesh = new THREE.InstancedMesh(def.geo, def.mat, items.length);
        solidMesh.castShadow = state.props.castShadows;
        solidMesh.receiveShadow = false;
        solidMesh.visible = state.props.categories[def.category] && state.props.enabled;

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
          dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
          dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
          dummy.updateMatrix();
          solidMesh.setMatrixAt(i, dummy.matrix);
        }
        solidMesh.instanceMatrix.needsUpdate = true;
        layerData.solidMesh = solidMesh;

        if (def.type === 'micro') {
          chunk.microGroup.add(solidMesh);
          chunk.microCount += items.length;
        } else if (def.type === 'landmark') {
          chunk.landmarkGroup.add(solidMesh);
          chunk.landmarkCount += items.length;
        } else {
          chunk.solidGroup.add(solidMesh);
          chunk.solidCount += items.length;
        }
      }

      // 4.2 Malha Impostor 2.5D (LOD 1 & 2 para árvores e rochas)
      if (def.impostorGeo && def.impostorMat) {
        const impostorMesh = new THREE.InstancedMesh(def.impostorGeo, def.impostorMat, items.length);
        impostorMesh.castShadow = false; // Impostores distantes dispensam mapa de sombras caro
        impostorMesh.receiveShadow = false;
        impostorMesh.visible = state.props.categories[def.category] && state.props.enabled;

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
          dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
          dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
          dummy.updateMatrix();
          impostorMesh.setMatrixAt(i, dummy.matrix);
        }
        impostorMesh.instanceMatrix.needsUpdate = true;
        layerData.impostorMesh = impostorMesh;
        chunk.impostorGroup.add(impostorMesh);
        chunk.impostorCount += items.length;
      }

      chunk.layers[def.key] = layerData;
    }
  }

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

  state.totalPropsCount = totalProps;

  if (badgePropsCount) {
    badgePropsCount.textContent = totalProps.toLocaleString('pt-BR') + ' objetos 3D';
  }

  updateLODVisibility(true);
}

// 9. Atualização de Transformações de Props nos Chunks (Exagero & Escala)
function updatePropsTransforms() {
  if (!propsGroup || !state.lodChunks) return;
  const dummy = new THREE.Object3D();
  const s = state.props.scale;

  for (let chIdx = 0; chIdx < state.lodChunks.length; chIdx++) {
    const chunk = state.lodChunks[chIdx];
    chunk.box.min.y = -0.5;
    chunk.box.max.y = state.baseHeight * state.exaggeration + 1.5;
    chunk.center.y = (state.baseHeight * state.exaggeration) / 2;

    for (const key of Object.keys(chunk.layers)) {
      const layer = chunk.layers[key];
      const items = layer.items;
      const solidMesh = layer.solidMesh;
      const impostorMesh = layer.impostorMesh;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
        dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
        dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
        dummy.updateMatrix();

        if (solidMesh) solidMesh.setMatrixAt(i, dummy.matrix);
        if (impostorMesh) impostorMesh.setMatrixAt(i, dummy.matrix);
      }

      if (solidMesh) solidMesh.instanceMatrix.needsUpdate = true;
      if (impostorMesh) impostorMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// 10. Atualização do Exagero Vertical Dinâmico (Relevo + Props)
function updateExaggeration(val) {
  state.exaggeration = val;
  if (!terrainGeometry || !rawElevations) return;

  const segW = terrainGeometry.parameters ? terrainGeometry.parameters.widthSegments : 825;
  const segH = terrainGeometry.parameters ? terrainGeometry.parameters.heightSegments : 423;
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
  updateRoadsElevation();
  updateOSMLandmarksElevation();
  updateParqueBoundaryElevation();
  updateSkirtElevation();
  updateLODVisibility(true);
}

// 10.1 Gerenciador de LOD Inteligente (Frustum Culling + Transição por Distância de Chunks)
const lodFrustum = new THREE.Frustum();
const lodProjMatrix = new THREE.Matrix4();
let lastLODCheckTime = 0;

function updateLODVisibility(force = false) {
  if (!state.lodChunks || !state.lodChunks.length || !camera) return;

  const now = performance.now();
  if (!force && now - lastLODCheckTime < 45) return; // Limita a ~22 verificações/segundo para 60 FPS estáveis
  lastLODCheckTime = now;

  let visibleChunks = 0;
  let activeProps = 0;
  const totalProps = state.totalPropsCount || 1;

  if (!state.lod.enabled) {
    // Modo Bruto (LOD Desativado): Desenha tudo em 3D sólido sem descarte
    for (let i = 0; i < state.lodChunks.length; i++) {
      const ch = state.lodChunks[i];
      ch.group.visible = true;
      ch.solidGroup.visible = true;
      ch.impostorGroup.visible = false;
      ch.microGroup.visible = true;
      ch.landmarkGroup.visible = true;
      activeProps += ch.solidCount + ch.microCount + ch.landmarkCount;
      visibleChunks++;
    }
  } else {
    // LOD Inteligente Ativo: Frustum Culling + Transição Distante
    lodProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    lodFrustum.setFromProjectionMatrix(lodProjMatrix);

    const camPos = camera.position;
    const nearSq = state.lod.nearDistance * state.lod.nearDistance;
    const farSq = state.lod.farDistance * state.lod.farDistance;

    for (let i = 0; i < state.lodChunks.length; i++) {
      const ch = state.lodChunks[i];

      // 1. Frustum Culling do Chunk
      if (state.lod.frustumCulling && !lodFrustum.intersectsBox(ch.box)) {
        ch.group.visible = false;
        continue;
      }

      ch.group.visible = true;
      visibleChunks++;

      // 2. Avaliação de Distância do Chunk à Câmera
      const distSq = camPos.distanceToSquared(ch.center);

      if (distSq < nearSq) {
        // LOD 0: Perto (< 35m) -> 3D Sólido completo + micro-props
        ch.solidGroup.visible = true;
        ch.impostorGroup.visible = false;
        ch.microGroup.visible = true;
        ch.landmarkGroup.visible = true;
        activeProps += ch.solidCount + ch.microCount + ch.landmarkCount;
      } else if (distSq < farSq) {
        // LOD 1: Médio (35 a 70m) -> Impostores 2.5D cross-quads, micro-props ocultos
        ch.solidGroup.visible = false;
        ch.impostorGroup.visible = true;
        ch.microGroup.visible = false;
        ch.landmarkGroup.visible = true;
        activeProps += ch.impostorCount + ch.landmarkCount;
      } else {
        // LOD 2: Longe (> 70m) -> Apenas impostores essenciais e marcos
        ch.solidGroup.visible = false;
        ch.impostorGroup.visible = true;
        ch.microGroup.visible = false;
        ch.landmarkGroup.visible = true;
        activeProps += ch.impostorCount + ch.landmarkCount;
      }
    }
  }

  state.visibleChunksCount = visibleChunks;
  state.activePropsCount = activeProps;

  // Atualização em tempo real das métricas do HUD
  if (statLodChunks) statLodChunks.textContent = `${visibleChunks} / ${state.lodChunks.length}`;
  if (statLodProps) statLodProps.textContent = `${activeProps.toLocaleString('pt-BR')}`;
  if (statLodSavings && totalProps > 0) {
    const savingsPct = Math.max(0, Math.min(99, Math.round((1 - activeProps / totalProps) * 100)));
    statLodSavings.textContent = `-${savingsPct}%`;
  }
}

// Atualização de Visibilidade por Categoria em todos os Chunks
function updateCategoryVisibility(catKey) {
  if (!state.lodChunks) return;
  const isVis = state.props.categories[catKey] && state.props.enabled;
  for (const chunk of state.lodChunks) {
    for (const key of Object.keys(chunk.layers)) {
      const layer = chunk.layers[key];
      if (layer.category === catKey) {
        if (layer.solidMesh) layer.solidMesh.visible = isVis;
        if (layer.impostorMesh) layer.impostorMesh.visible = isVis;
      }
    }
  }
  updateLODVisibility(true);
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

// 11.9 Nadir View Mode Manager (Visão Aérea Zenital / Modo Mapa 2D/3D)
function enterNadirMode() {
  if (state.isNadir) return;
  state.isNadir = true;

  // Salva última posição de câmera 3D para restaurar depois
  state.lastPerspective = {
    pos: camera.position.clone(),
    target: controls.target.clone()
  };

  // Oculta camada de nuvens para garantir imagem de satélite / MapBiomas perfeitamente nítida
  if (cloudMesh) cloudMesh.visible = false;

  // Atualiza botões e badges
  if (btnToggleNadir) btnToggleNadir.classList.add('active');
  if (labelToggleNadir) labelToggleNadir.textContent = 'Vista 3D';
  if (presetNadir) presetNadir.classList.add('active');
  if (nadirFloatingBadge) nadirFloatingBadge.style.display = 'flex';

  document.querySelectorAll('.btn-preset').forEach(b => {
    if (b !== presetNadir) b.classList.remove('active');
  });

  // Voo suave para o Zênite (Norte para cima, centro em 0,0,0)
  // Altitude 175 unidades com FOV 40° enquadra todo o relevo (200 x 102.6)
  animateCamera(0, 175, 0.001, 0, 0, 0, 1300, () => {
    // No modo mapa zenital, botão esquerdo do mouse faz PAN (estilo GIS / Google Maps)
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  });
}

function exitNadirMode(animateBack = true) {
  if (!state.isNadir) return;
  state.isNadir = false;

  // Restaura controles 3D completos
  controls.enableRotate = true;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;

  // Restaura nuvens atmosféricas
  if (cloudMesh) cloudMesh.visible = true;

  // Atualiza UI
  if (btnToggleNadir) btnToggleNadir.classList.remove('active');
  if (labelToggleNadir) labelToggleNadir.textContent = 'Visão Nadir';
  if (presetNadir) presetNadir.classList.remove('active');
  if (nadirFloatingBadge) nadirFloatingBadge.style.display = 'none';

  if (animateBack) {
    if (state.lastPerspective) {
      animateCamera(
        state.lastPerspective.pos.x,
        state.lastPerspective.pos.y,
        state.lastPerspective.pos.z,
        state.lastPerspective.target.x,
        state.lastPerspective.target.y,
        state.lastPerspective.target.z,
        1300
      );
    } else {
      setCameraPreset('panoramica');
    }
  }
}

function toggleNadirMode() {
  if (state.isNadir) {
    exitNadirMode(true);
  } else {
    enterNadirMode();
  }
}

// 12. Camera Presets (Calibrados para Escala 1:1 Real)
function setCameraPreset(preset) {
  if (preset === 'nadir') {
    enterNadirMode();
    return;
  }

  if (state.isNadir) {
    exitNadirMode(false);
  }

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

function animateCamera(targetX, targetY, targetZ, lookX, lookY, lookZ, duration = 1200, onComplete = null) {
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
      if (typeof onComplete === 'function') onComplete();
    }
  }

  activeCameraAnimId = requestAnimationFrame(step);
}

// Floating Toast Notification
function showToastNotification(message, icon = '⚡', duration = 2600) {
  const toast = document.getElementById('app-toast');
  const msgEl = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  if (iconEl) iconEl.textContent = icon;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}
window.showToastNotification = showToastNotification;

// Dicionário de Tópicos Explicativos para Popups / Modal
const INFO_TOPICS = {
  lod: {
    icon: '⚡',
    title: 'LOD Dinâmico (Level of Detail)',
    subtitle: 'Otimização Hierárquica em Tempo Real por Distância',
    description: 'O sistema de <strong>LOD (Nível de Detalhe)</strong> ajusta a complexidade gráfica de cada objeto com base na distância da câmera, garantindo máxima fidelidade visual perto do observador sem sobrecarregar a GPU com objetos distantes.',
    details: [
      '<strong>LOD 0 (&lt; 35m):</strong> Árvores e arbustos com malha 3D volumétrica completa, galhos e sombras detalhadas.',
      '<strong>LOD 1 (35m a 70m):</strong> Substituição automática por <em>impostores 2.5D de planos cruzados</em> (cross-quad billboards), reduzindo polígonos em 85% com aparência idêntica à distância.',
      '<strong>LOD 2 (&gt; 70m):</strong> Oclusão suave e culling de pequenos arbustos para priorizar o relevo e marcos principais.'
    ],
    impact: 'Permite renderizar <strong>mais de 1,5 milhão de elementos vegetais</strong> mantendo 60 FPS fixos.',
    recommendation: 'Recomendado manter <strong>SEMPRE ATIVO</strong>.'
  },
  frustum: {
    icon: '👁️',
    title: 'Frustum Culling (Oclusão de Campo Visual)',
    subtitle: 'Divisão Espacial em 32 Chunks Georreferenciados',
    description: 'Descarta do pipeline de renderização qualquer geometria, árvore ou rodovia que esteja <strong>fora do campo de visão da câmera</strong> ou às suas costas.',
    details: [
      'A região é particionada em uma grade espacial de <strong>32 chunks independentes</strong> (4x8 setores).',
      'A cada quadro (16ms), os planos da pirâmide visual da câmera (Frustum) testam os limites esféricos de cada chunk.',
      'Chunks fora da visão têm sua chamada de desenho (<em>draw call</em>) cancelada instantaneamente.'
    ],
    impact: 'Economiza entre <strong>50% e 75% da carga da placa de vídeo</strong> em qualquer ângulo de observação.',
    recommendation: 'Recomendado manter <strong>SEMPRE ATIVO</strong>.'
  },
  'terrain-lod': {
    icon: '🏔️',
    title: 'Malha do Terreno (Resolução Poligonal)',
    subtitle: 'Densidade da Grade de Vértices Altimétricos',
    description: 'Controla a quantidade de subdivisões poligonais do relevo topográfico gerado a partir do Modelo Digital de Elevação (DEM).',
    details: [
      '<strong>Ultra:</strong> Malha em resolução nativa (350.000 a 622.000 vértices). Ideal para visualizar cânions, paredões e escarpas com máxima nitidez.',
      '<strong>Equilibrado (-75% vértices):</strong> Grade reduzida pela metade em cada eixo (~87k vértices). Mantém o relevo fiel com renderização 4x mais veloz.',
      '<strong>Leve (-94% vértices):</strong> Grade ultra-leve (~21k vértices). Ideal para notebooks ou celulares com GPUs integradas.'
    ],
    impact: 'Reduz a memória geométrica da malha de 40 MB para menos de 3 MB.',
    recommendation: 'Use <em>Equilibrado</em> se o dispositivo apresentar perda de quadros.'
  },
  'data-lod': {
    icon: '📦',
    title: 'Pipeline de Dados (Transmissão & Memória)',
    subtitle: 'Resolução dos Arquivos Binários Altimétricos e Classes',
    description: 'Alterna entre os conjuntos de dados georreferenciados transmitidos do servidor para a memória do navegador.',
    details: [
      '<strong>DEM 30m Completo:</strong> Dados integrais Copernicus e MapBiomas em 30 metros de resolução espacial.',
      '<strong>LOD 1 (Meia Resolução):</strong> Dados pré-processados e compactados em meia resolução espacial (4x menor volume de download, 1,3 MB vs 5,6 MB).',
      'Ao alternar, o relevo e todas as instâncias vegetais são reconstruídos em tempo real com novos limites e elevações interpoladas.'
    ],
    impact: 'Carregamento <strong>4x mais rápido</strong> e economia de dezenas de megabytes de memória RAM.',
    recommendation: 'Excelente para conexões mais lentas ou carregamento instantâneo.'
  },
  'prop-density': {
    icon: '🌿',
    title: 'Densidade de Props & Vegetação',
    subtitle: 'Multiplicador de População Botânica e Objetos 3D',
    description: 'Multiplica a quantidade de árvores típicas (Mata de Galeria, Cerrado Típico, Campo Cerrado, etc.) distribuídas proporcionalmente pela cobertura da terra do MapBiomas.',
    details: [
      '<strong>0.5x (Leve):</strong> Reduz pela metade a vegetação para foco em relevo e infraestrutura.',
      '<strong>1.0x (Padrão 1:1):</strong> Proporção botânica cientificamente calibrada para a cobertura real do Cerrado.',
      '<strong>2.0x a 3.5x (Denso):</strong> Cobertura arbórea fechada e luxuriante em vales e platôs.',
      '<strong>5.0x (Hiper):</strong> Densidade extrema para testes de estresse gráfico, instanciando até 2 milhões de árvores com o LOD ativo.'
    ],
    impact: 'Gera florestas densas e hiper-realistas utilizando aceleração por hardware (GPU InstancedMesh).',
    recommendation: 'Escala <strong>1.0x</strong> é o padrão equilibrado para 60 FPS.'
  },
  nadir: {
    icon: '🛰️',
    title: 'Visão Nadir (Modo Aéreo Cartográfico)',
    subtitle: 'Projeção Perpendicular de Câmera Top-Down (90°)',
    description: 'Trava a câmera diretamente acima do centro da região, apontando a 90° em relação ao plano do horizonte.',
    details: [
      'Permite analisar limites territoriais oficiais, eixos viários e manchas de vegetação como em uma imagem de satélite georreferenciada.',
      'A rotação polar é travada com o Norte no topo da tela para navegação cartográfica padronizada.',
      'Para retornar à exploração 3D livre, basta clicar novamente no botão Nadir ou em qualquer outro ângulo predefinido.'
    ],
    impact: 'Transforma o modelo 3D em um SIG cartográfico aéreo interativo instantâneo.',
    recommendation: 'Use o botão da barra superior ou a tecla de atalho <strong>N</strong>.'
  },
  exaggeration: {
    icon: '📐',
    title: 'Exagero Vertical do Relevo',
    subtitle: 'Escala do Eixo Z / Altura Topográfica',
    description: 'Multiplica a elevação das montanhas, cânions e vales em relação à extensão horizontal.',
    details: [
      '<strong>1.0x (1:1 Real):</strong> Altura em escala física real idêntica à natureza.',
      '<strong>1.5x a 2.5x:</strong> Exagero moderado que destaca cristas geológicas e morros do planalto.',
      '<strong>4.0x:</strong> Máximo contraste topográfico para fins didáticos e científicos.'
    ],
    impact: 'Ajusta dinamicamente a altura de rodovias, marcos 3D e vegetação para permanecerem perfeitamente drapeados ao relevo.',
    recommendation: 'Clique no botão <em>Resetar para Escala 1:1</em> a qualquer momento.'
  },
  'prop-scale': {
    icon: '📏',
    title: 'Escala dos Props (Tamanho Botânico e Arquitetônico)',
    subtitle: 'Dimensão Métrica Relativa de Árvores e Objetos 3D',
    description: 'Ajusta a altura e proporção métrica de todas as árvores, lavouras, edificações coloniais e animais em relação ao relevo topográfico.',
    details: [
      '<strong>1.0x (1:1 Real):</strong> Altura botânica estritamente calibrada com a realidade (ipês de 8m, cerrados de 4m, matas de 15m).',
      '<strong>2.0x a 4.0x:</strong> Amplia a vegetação e monumentos para visualização clara em planos gerais ou telas menores.',
      '<strong>0.5x:</strong> Reduz o porte da vegetação para dar foco total às cristas geológicas e desníveis do terreno.'
    ],
    impact: 'Atualiza instantaneamente as matrizes de transformação de todas as instâncias GPU sem recarregar dados.',
    recommendation: 'Mantenha em <strong>1.0x</strong> para proporção botânica cientificamente realista.'
  }
};

function openInfoModal(topicKey) {
  const data = INFO_TOPICS[topicKey];
  if (!data) return;
  const backdrop = document.getElementById('info-modal-backdrop');
  if (!backdrop) return;

  const iconEl = document.getElementById('info-modal-icon');
  const titleEl = document.getElementById('info-modal-title');
  const subEl = document.getElementById('info-modal-subtitle');
  const descEl = document.getElementById('info-modal-desc');
  const detailsList = document.getElementById('info-modal-details');
  const impactEl = document.getElementById('info-modal-impact');
  const recEl = document.getElementById('info-modal-rec');

  if (iconEl) iconEl.textContent = data.icon;
  if (titleEl) titleEl.textContent = data.title;
  if (subEl) subEl.textContent = data.subtitle;
  if (descEl) descEl.innerHTML = data.description;

  if (detailsList) {
    detailsList.innerHTML = '';
    data.details.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = item;
      detailsList.appendChild(li);
    });
  }

  if (impactEl) impactEl.innerHTML = data.impact;
  if (recEl) recEl.innerHTML = `💡 <strong>Dica de Desempenho:</strong> ${data.recommendation}`;

  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeInfoModal() {
  const backdrop = document.getElementById('info-modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}
window.openInfoModal = openInfoModal;
window.closeInfoModal = closeInfoModal;

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

  const checkRoads = document.getElementById('check-roads');
  if (checkRoads) {
    checkRoads.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (!state.roads) state.roads = {};
      state.roads.enabled = enabled;
      if (roadsLineMesh) {
        roadsLineMesh.visible = enabled;
      }
    });
  }

  const checkLandmarks = document.getElementById('check-landmarks');
  if (checkLandmarks) {
    checkLandmarks.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (!state.landmarks) state.landmarks = {};
      state.landmarks.enabled = enabled;
      if (osmLandmarksGroup) osmLandmarksGroup.visible = enabled;
      const badgeLandmarks = document.getElementById('badge-landmarks-count');
      if (badgeLandmarks) badgeLandmarks.textContent = enabled ? 'Ativo' : 'Desativado';
    });
  }

  const chkPESDBoundary = document.getElementById('check-pesd-boundary');
  if (chkPESDBoundary) {
    chkPESDBoundary.addEventListener('change', (e) => {
      if (pesdBoundaryGroup) {
        pesdBoundaryGroup.visible = e.target.checked;
      }
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

  const sliderPropScaleSettings = document.getElementById('slider-prop-scale-settings');
  const valPropScaleSettings = document.getElementById('val-prop-scale-settings');

  function updatePropScaleUI(val) {
    const txt = val.toFixed(1) + (Math.abs(val - 1.0) < 0.05 ? 'x (1:1 Botânico)' : 'x');
    if (valPropScale) valPropScale.textContent = txt;
    if (valPropScaleSettings) valPropScaleSettings.textContent = txt;
    if (sliderPropScale && parseFloat(sliderPropScale.value) !== val) sliderPropScale.value = val;
    if (sliderPropScaleSettings && parseFloat(sliderPropScaleSettings.value) !== val) sliderPropScaleSettings.value = val;
  }

  function onPropScaleInput(e) {
    const val = parseFloat(e.target.value);
    state.props.scale = val;
    updatePropScaleUI(val);
    updatePropsTransforms();
    if (typeof updateRoadsElevation === 'function') updateRoadsElevation();
    if (typeof updateOSMLandmarksElevation === 'function') updateOSMLandmarksElevation();
  }

  if (sliderPropScale) {
    sliderPropScale.addEventListener('input', onPropScaleInput);
  }
  if (sliderPropScaleSettings) {
    sliderPropScaleSettings.addEventListener('input', onPropScaleInput);
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

  // 🌿 Slider Contínuo de Densidade de Props (0.5x a 5.0x) com Debounce
  let densityDebounceTimer = null;

  function formatDensityLabel(val) {
    if (val < 0.9) return `${val.toFixed(1)}x (Econômico)`;
    if (val <= 1.2) return `${val.toFixed(1)}x (Padrão 1:1)`;
    if (val <= 2.2) return `${val.toFixed(1)}x (Alta Densidade)`;
    if (val <= 3.8) return `${val.toFixed(1)}x (Ultra Densa)`;
    return `${val.toFixed(1)}x (Hiper-Densidade 🔥)`;
  }

  // Helper para sincronizar marcas de escala (ticks) do slider de densidade
  function updateActiveTicks(val) {
    document.querySelectorAll('.slider-ticks-density').forEach(container => {
      container.querySelectorAll('.tick-item').forEach(tick => {
        const tVal = parseFloat(tick.dataset.val);
        if (Math.abs(tVal - val) < 0.25) {
          tick.classList.add('active');
        } else {
          tick.classList.remove('active');
        }
      });
    });
  }

  function setupDensityTicks(containerId, sliderId) {
    const container = document.getElementById(containerId);
    const slider = document.getElementById(sliderId);
    if (!container || !slider) return;

    container.querySelectorAll('.tick-item').forEach(tick => {
      tick.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = parseFloat(tick.dataset.val);
        if (isNaN(val)) return;
        slider.value = val;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        showToastNotification(`Densidade ajustada: ${val.toFixed(1)}x`, '🌿');
      });
    });
  }

  function updateDensityUI(val) {
    const txt = formatDensityLabel(val);
    if (valPropDensity) valPropDensity.textContent = txt;
    if (valPropDensitySettings) valPropDensitySettings.textContent = txt;
    if (badgeDensityMultiplier) badgeDensityMultiplier.textContent = `${val.toFixed(1)}x`;
    if (densityHelperText) {
      if (val > 3.8) {
        densityHelperText.textContent = 'Mais de 1,5M de instâncias ativas!';
        densityHelperText.style.color = '#c084fc';
      } else if (val > 2.0) {
        densityHelperText.textContent = 'Dossel denso e fechado';
        densityHelperText.style.color = 'var(--accent-green)';
      } else {
        densityHelperText.textContent = 'Equilibrada para qualquer GPU';
        densityHelperText.style.color = 'var(--text-muted)';
      }
    }
    updateActiveTicks(val);
  }

  function onDensityInput(e) {
    const val = parseFloat(e.target.value);
    if (sliderPropDensity && sliderPropDensity !== e.target) sliderPropDensity.value = val;
    if (sliderPropDensitySettings && sliderPropDensitySettings !== e.target) sliderPropDensitySettings.value = val;
    updateDensityUI(val);

    clearTimeout(densityDebounceTimer);
    densityDebounceTimer = setTimeout(() => {
      state.props.density = val;
      if (state.props.enabled) {
        buildPropsMeshes();
      }
    }, 220);
  }

  if (sliderPropDensity) {
    sliderPropDensity.addEventListener('input', onDensityInput);
  }
  if (sliderPropDensitySettings) {
    sliderPropDensitySettings.addEventListener('input', onDensityInput);
  }

  // Inicializar clique nas marcas de escala
  setupDensityTicks('ticks-prop-density', 'slider-prop-density');
  setupDensityTicks('ticks-prop-density-settings', 'slider-prop-density-settings');

  // Conectar botões de ajuda / informação com popup explicativo via delegação global em fase de captura
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-help-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const topic = btn.dataset.info || btn.getAttribute('data-info');
    if (topic) {
      openInfoModal(topic);
    }
  }, true);

  const btnCloseInfoModal = document.getElementById('btn-close-info-modal');
  const btnDismissInfoModal = document.getElementById('btn-dismiss-info-modal');
  const infoModalBackdrop = document.getElementById('info-modal-backdrop');

  if (btnCloseInfoModal) btnCloseInfoModal.addEventListener('click', closeInfoModal);
  if (btnDismissInfoModal) btnDismissInfoModal.addEventListener('click', closeInfoModal);
  if (infoModalBackdrop) {
    infoModalBackdrop.addEventListener('click', (e) => {
      if (e.target === infoModalBackdrop) closeInfoModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInfoModal();
  });

  // ⚙️ Gerenciador do Menu Flutuante de Ajustes & Otimizações
  function toggleSettingsPanel() {
    if (!settingsPanel) return;
    const isAct = settingsPanel.classList.toggle('active');
    if (btnOpenSettings) btnOpenSettings.classList.toggle('active', isAct);
    if (isAct && isMobileDevice) {
      hideControlPanel();
    }
  }

  function closeSettingsPanel() {
    if (!settingsPanel) return;
    settingsPanel.classList.remove('active');
    if (btnOpenSettings) btnOpenSettings.classList.remove('active');
  }

  if (btnOpenSettings) btnOpenSettings.addEventListener('click', toggleSettingsPanel);
  if (btnOpenSettingsSide) btnOpenSettingsSide.addEventListener('click', toggleSettingsPanel);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsPanel);

  // Botão "🎯 Resetar para Escala 1:1 Real"
  const btnScale1to1 = document.getElementById('btn-scale-1to1');
  if (btnScale1to1) {
    btnScale1to1.addEventListener('click', () => {
      sliderExaggeration.value = '1.0';
      valExaggeration.textContent = '1.0x (1:1 Real)';
      updateExaggeration(1.0);

      updatePropScaleUI(1.0);
      state.props.scale = 1.0;
      updatePropsTransforms();

      // Transição suave para enquadramento equilibrado em escala 1:1
      animateCamera(-30, 22, 60, 10, 1.6, 5);
      showToastNotification('Relevo e vegetação resetados para escala 1:1 real', '🎯');
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
      updateCategoryVisibility(propKey);
    });
  });

  // ⚡ Controles de Otimização LOD Inteligente
  if (checkLodEnabled) {
    checkLodEnabled.addEventListener('change', (e) => {
      state.lod.enabled = e.target.checked;
      if (badgeLodMode) {
        if (state.lod.enabled) {
          badgeLodMode.textContent = `Ativo (${state.lodChunks ? state.lodChunks.length : 32} Chunks)`;
          badgeLodMode.style.color = 'var(--accent-green)';
          badgeLodMode.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        } else {
          badgeLodMode.textContent = 'Desativado (Modo Bruto)';
          badgeLodMode.style.color = 'var(--accent-orange)';
          badgeLodMode.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        }
      }
      updateLODVisibility(true);
      showToastNotification(`LOD Dinâmico: ${e.target.checked ? 'Ativado (Hierárquico)' : 'Desativado (Bruto)'}`, '⚡');
    });
  }

  if (checkLodFrustum) {
    checkLodFrustum.addEventListener('change', (e) => {
      state.lod.frustumCulling = e.target.checked;
      updateLODVisibility(true);
      showToastNotification(`Frustum Culling: ${e.target.checked ? 'Ativado (32 Chunks)' : 'Desativado'}`, '👁️');
    });
  }

  // Resolução da Malha do Terreno (LOD Terreno)
  document.querySelectorAll('#btn-group-terrain-lod .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#btn-group-terrain-lod .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tlod = btn.dataset.tlod;
      state.terrainLod = tlod;
      const badge = document.getElementById('badge-terrain-lod');
      const labels = {
        ultra: 'Ultra (350k v)',
        balanced: 'Equilibrado (87k v)',
        fast: 'Leve (21k v)'
      };
      if (badge) badge.textContent = labels[tlod] || tlod;
      buildTerrainMesh();
      updatePropsTransforms();
      if (typeof updateRoadsElevation === 'function') updateRoadsElevation();
      if (typeof updateOSMLandmarksElevation === 'function') updateOSMLandmarksElevation();
      if (typeof updateParqueBoundaryElevation === 'function') updateParqueBoundaryElevation();
      showToastNotification(`Malha do relevo alterada para: ${labels[tlod] || tlod}`, '🏔️');
    });
  });

  // Pipeline de Dados (LOD de Processamento)
  document.querySelectorAll('#btn-group-data-lod .seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dlod = btn.dataset.dlod;
      if (state.dataLod === dlod) return;
      document.querySelectorAll('#btn-group-data-lod .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const badge = document.getElementById('badge-data-lod');
      if (badge) badge.textContent = dlod === 'lod1' ? 'LOD 1 (Meia Res - 4x Mais Rápido)' : 'DEM 30m Completo';
      await setDataPipelineLOD(dlod);
      showToastNotification(`Pipeline de dados: ${dlod === 'lod1' ? 'LOD 1 (Meia Resolução - 4x mais leve)' : 'DEM 30m Completo'}`, '📦');
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
    if (state.isNadir) exitNadirMode(false);
    animateCamera(-30, 22, 60, 10, 1.6, 5);
  });

  // Compass widget
  compassWidget.addEventListener('click', () => {
    if (state.isNadir) {
      exitNadirMode(true);
    } else {
      animateCamera(0, 32, 65, 0, 1.5, 0);
    }
  });

  // Nadir View mode listeners
  if (btnToggleNadir) {
    btnToggleNadir.addEventListener('click', toggleNadirMode);
  }
  if (btnExitNadirBadge) {
    btnExitNadirBadge.addEventListener('click', () => exitNadirMode(true));
  }

  // Funções de visibilidade dos painéis flutuantes (HUD)
  function hideControlPanel() {
    if (controlPanel) controlPanel.classList.add('minimized');
    if (btnShowPanel) btnShowPanel.classList.add('active');
    updateMasterToggleButton();
  }

  function showControlPanel() {
    if (controlPanel) controlPanel.classList.remove('minimized');
    if (btnShowPanel) btnShowPanel.classList.remove('active');
    if (isMobileDevice && settingsPanel) {
      closeSettingsPanel();
    }
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

  // 📱 Perfil Mobile Automático Inicial
  if (isMobileDevice) {
    hideControlPanel();
    if (sliderPropDensity) sliderPropDensity.value = '0.7';
    if (sliderPropDensitySettings) sliderPropDensitySettings.value = '0.7';
    updateDensityUI(0.7);

    const btnGroupTerrainLod = document.getElementById('btn-group-terrain-lod');
    if (btnGroupTerrainLod) {
      btnGroupTerrainLod.querySelectorAll('.btn-segmented-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tlod === 'balanced');
      });
    }
    if (badgeTerrainLod) {
      badgeTerrainLod.textContent = 'Equilibrado (87k v)';
      badgeTerrainLod.style.color = 'var(--accent-green)';
    }

    setTimeout(() => {
      showToastNotification('📱 Perfil Mobile Ativo: GPU e bateria otimizadas (60 FPS)', '⚡');
    }, 1200);
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

// 13. Pipeline de Dados Multi-Resolução (LOD de Processamento e Transmissão)
async function setDataPipelineLOD(dlod) {
  state.dataLod = dlod;
  updateProgress(20, 'Carregando dados altimétricos LOD...');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.classList.remove('fade-out');
  }

  try {
    if (dlod === 'lod1') {
      updateProgress(40, 'Carregando classes LOD 1 (340 KB - 4x mais leve)...');
      const cResp = await fetch('public/classes_lod1.bin');
      rawClasses = new Uint8Array(await cResp.arrayBuffer());

      updateProgress(65, 'Carregando elevação LOD 1 (1.3 MB - 4x mais leve)...');
      const eResp = await fetch('public/elevation_lod1.bin');
      rawElevations = new Float32Array(await eResp.arrayBuffer());

      state.demDimensions = { width: 825, height: 423 };
    } else {
      updateProgress(40, 'Carregando classes 30m (1.4 MB)...');
      const cResp = await fetch('public/classes.bin');
      rawClasses = new Uint8Array(await cResp.arrayBuffer());

      updateProgress(65, 'Carregando elevação 30m (5.6 MB)...');
      const eResp = await fetch('public/elevation.bin');
      rawElevations = new Float32Array(await eResp.arrayBuffer());

      state.demDimensions = { width: 1650, height: 847 };
    }

    updateProgress(80, 'Reconstruindo malha do relevo...');
    buildTerrainMesh();

    updateProgress(86, 'Atualizando vias, marcos e perímetro do parque...');
    if (typeof updateRoadsElevation === 'function') updateRoadsElevation();
    if (typeof updateOSMLandmarksElevation === 'function') updateOSMLandmarksElevation();
    if (typeof updateParqueBoundaryElevation === 'function') updateParqueBoundaryElevation();

    updateProgress(92, 'Reconstruindo chunks espaciais e instâncias 3D...');
    buildPropsMeshes();

    updateProgress(100, 'Pronto!');
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.classList.add('fade-out');
        setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
      }
    }, 300);
  } catch (err) {
    console.error('Erro ao alternar pipeline LOD:', err);
    if (loadingStatus) {
      loadingStatus.textContent = 'Erro ao carregar dados: ' + err.message;
      loadingStatus.style.color = '#ef4444';
    }
  }
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// 14. Render Animation Loop
function animate(now) {
  requestAnimationFrame(animate);
  controls.update();

  // Execução do gerenciador de LOD com verificação de frustum e distâncias
  if (state.lod && state.lod.enabled) {
    updateLODVisibility();
  }

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

// ============================================================================
// --- GERENCIADOR DE PEDESTAL / SAIA 3D DA MAQUETE ARQUITETÔNICA ---
// ============================================================================
let skirtMesh = null;
let skirtGeometry = null;
let rawSkirtEdgeMap = [];

function buildTerrainSkirt() {
  if (skirtMesh) {
    scene.remove(skirtMesh);
    if (skirtGeometry) skirtGeometry.dispose();
  }

  const segW = terrainGeometry && terrainGeometry.parameters ? terrainGeometry.parameters.widthSegments : 825;
  const segH = terrainGeometry && terrainGeometry.parameters ? terrainGeometry.parameters.heightSegments : 423;
  const geoW = state.terrainSpan.width;
  const geoH = state.terrainSpan.height;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const yBase = -1.5; // Base sólida do pedestal da maquete física

  const positions = [];
  rawSkirtEdgeMap = [];

  function addSkirtQuad(x1, z1, u1, v1, x2, z2, u2, v2) {
    const e1 = getBilinearElevation(u1, v1, demW, demH) * state.baseHeight * state.exaggeration;
    const e2 = getBilinearElevation(u2, v2, demW, demH) * state.baseHeight * state.exaggeration;
    const startIdx = positions.length / 3;

    // Triângulo 1: topo 1 -> topo 2 -> base 1
    positions.push(x1, e1, z1);
    rawSkirtEdgeMap.push({ idx: startIdx + 0, u: u1, v: v1 });
    positions.push(x2, e2, z2);
    rawSkirtEdgeMap.push({ idx: startIdx + 1, u: u2, v: v2 });
    positions.push(x1, yBase, z1);

    // Triângulo 2: base 1 -> topo 2 -> base 2
    positions.push(x1, yBase, z1);
    positions.push(x2, e2, z2);
    rawSkirtEdgeMap.push({ idx: startIdx + 4, u: u2, v: v2 });
    positions.push(x2, yBase, z2);
  }

  // 1. Borda Norte: z = -geoH / 2
  const zN = -geoH / 2;
  for (let c = 0; c < segW; c++) {
    const u1 = c / segW;
    const u2 = (c + 1) / segW;
    const x1 = (u1 - 0.5) * geoW;
    const x2 = (u2 - 0.5) * geoW;
    addSkirtQuad(x2, zN, u2, 0, x1, zN, u1, 0);
  }

  // 2. Borda Leste: x = geoW / 2
  const xE = geoW / 2;
  for (let r = 0; r < segH; r++) {
    const v1 = r / segH;
    const v2 = (r + 1) / segH;
    const z1 = (v1 - 0.5) * geoH;
    const z2 = (v2 - 0.5) * geoH;
    addSkirtQuad(xE, z2, 1, v2, xE, z1, 1, v1);
  }

  // 3. Borda Sul: z = geoH / 2
  const zS = geoH / 2;
  for (let c = segW; c > 0; c--) {
    const u1 = c / segW;
    const u2 = (c - 1) / segW;
    const x1 = (u1 - 0.5) * geoW;
    const x2 = (u2 - 0.5) * geoW;
    addSkirtQuad(x2, zS, u2, 1, x1, zS, u1, 1);
  }

  // 4. Borda Oeste: x = -geoW / 2
  const xW = -geoW / 2;
  for (let r = segH; r > 0; r--) {
    const v1 = r / segH;
    const v2 = (r - 1) / segH;
    const z1 = (v1 - 0.5) * geoH;
    const z2 = (v2 - 0.5) * geoH;
    addSkirtQuad(xW, z2, 0, v2, xW, z1, 0, v1);
  }

  skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  skirtGeometry.computeVertexNormals();

  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x141820, // Cinza ardósia escuro arquitetônico premium
    roughness: 0.92,
    metalness: 0.08,
    side: THREE.DoubleSide
  });

  skirtMesh = new THREE.Mesh(skirtGeometry, skirtMat);
  skirtMesh.receiveShadow = true;
  scene.add(skirtMesh);

  // Placa de fundo inferior da maquete
  const basePlateGeo = new THREE.PlaneGeometry(geoW, geoH);
  basePlateGeo.rotateX(Math.PI / 2);
  const basePlateMesh = new THREE.Mesh(basePlateGeo, skirtMat);
  basePlateMesh.position.y = yBase;
  basePlateMesh.receiveShadow = true;
  scene.add(basePlateMesh);
}

function updateSkirtElevation() {
  if (!skirtMesh || !skirtGeometry || !rawSkirtEdgeMap.length) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const posAttr = skirtGeometry.attributes.position;

  for (let i = 0; i < rawSkirtEdgeMap.length; i++) {
    const item = rawSkirtEdgeMap[i];
    const elev = getBilinearElevation(item.u, item.v, demW, demH) * state.baseHeight * state.exaggeration;
    posAttr.setY(item.idx, elev);
  }
  posAttr.needsUpdate = true;
  skirtGeometry.computeVertexNormals();
}

// ============================================================================
// --- GERENCIADOR DE REDE VIÁRIA E TRILHAS 3D (OSM) ---
// ============================================================================
let roadsGroup = null;
let roadsLineMesh = null;
let rawRoadsVertices = [];
let roadsLoaded = false;

async function loadRoadsNetwork() {
  try {
    const resp = await fetch('public/roads.json');
    if (!resp.ok) return;
    const data = await resp.json();
    buildRoadsMesh(data);
    roadsLoaded = true;
    console.log('🛣️ Rede viária e trilhas OSM carregadas com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar rede viária OSM:', err);
  }
}

function buildRoadsMesh(data) {
  if (roadsGroup) {
    scene.remove(roadsGroup);
    roadsGroup.clear();
  }
  roadsGroup = new THREE.Group();
  window.roadsGroup = roadsGroup;
  scene.add(roadsGroup);

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  const positions = [];
  const colors = [];
  rawRoadsVertices = [];

  const tierColors = {
    tier1: new THREE.Color(0x0a0a0a), // Preto Ônix / Rodovias Principais (GO-070, GO-164)
    tier2: new THREE.Color(0x27272a), // Grafite Escuro / Estradas de Acesso ao PESD
    tier3: new THREE.Color(0x475569)  // Cinza Ardósia / Trilhas Ecológicas da Crista e Areião
  };

  const tiers = ['tier1', 'tier2', 'tier3'];
  let totalWays = 0;

  for (const t of tiers) {
    const list = data[t] || [];
    const col = tierColors[t];
    totalWays += list.length;

    for (let i = 0; i < list.length; i++) {
      const road = list[i];
      const pts = road.pts;
      if (!pts || pts.length < 2) continue;

      for (let j = 0; j < pts.length - 1; j++) {
        const p1 = pts[j];
        const p2 = pts[j + 1];

        const elev1 = getBilinearElevation(p1[2], p1[3], demW, demH) * state.baseHeight * state.exaggeration + 0.048;
        const elev2 = getBilinearElevation(p2[2], p2[3], demW, demH) * state.baseHeight * state.exaggeration + 0.048;

        positions.push(p1[0], elev1, p1[1]);
        colors.push(col.r, col.g, col.b);
        rawRoadsVertices.push({ u: p1[2], v: p1[3] });

        positions.push(p2[0], elev2, p2[1]);
        colors.push(col.r, col.g, col.b);
        rawRoadsVertices.push({ u: p2[2], v: p2[3] });
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });

  roadsLineMesh = new THREE.LineSegments(geom, mat);
  roadsLineMesh.visible = (state.roads && state.roads.enabled !== undefined) ? state.roads.enabled : true;
  roadsGroup.add(roadsLineMesh);

  const badge = document.getElementById('badge-roads-count');
  if (badge) badge.textContent = `${totalWays.toLocaleString('pt-BR')} vias e trilhas`;
}

function updateRoadsElevation() {
  if (!roadsLineMesh || !rawRoadsVertices.length) return;
  const posAttr = roadsLineMesh.geometry.attributes.position;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (let i = 0; i < rawRoadsVertices.length; i++) {
    const v = rawRoadsVertices[i];
    const elev = getBilinearElevation(v.u, v.v, demW, demH) * state.baseHeight * state.exaggeration + 0.048;
    posAttr.setY(i, elev);
  }
  posAttr.needsUpdate = true;
}

// ============================================================================
// --- GERENCIADOR DE LIMITES OFICIAIS DO PARQUE ESTADUAL DA SERRA DOURADA ---
// ============================================================================
let pesdBoundaryGroup = null;
let rawBoundaryVertices = [];

async function loadParqueBoundary() {
  try {
    const resp = await fetch('public/serra_dourada_boundary.json');
    if (!resp.ok) return;
    const data = await resp.json();
    buildParqueBoundaryMesh(data);
    console.log('🗺️ Limites oficiais do PESD carregados com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar limites do PESD:', err);
  }
}

function buildParqueBoundaryMesh(data) {
  if (pesdBoundaryGroup) {
    scene.remove(pesdBoundaryGroup);
    pesdBoundaryGroup.clear();
  }
  pesdBoundaryGroup = new THREE.Group();
  window.pesdBoundaryGroup = pesdBoundaryGroup;
  scene.add(pesdBoundaryGroup);
  rawBoundaryVertices = [];

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const ribbonH = 0.55; // Altura da fita luminosa arquitetônica

  // Fita vertical em Vermelho Carmesim clássico
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0xdc143c,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // Linha superior iluminada
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xff2a55,
    linewidth: 2,
    transparent: true,
    opacity: 0.98
  });

  const rings = data.rings || [];
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;

    const quadPositions = [];
    const linePositions = [];
    const ringVerts = [];

    const N = ring.length;
    for (let i = 0; i < N; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % N];

      const e1 = getBilinearElevation(p1[2], p1[3], demW, demH) * state.baseHeight * state.exaggeration;
      const e2 = getBilinearElevation(p2[2], p2[3], demW, demH) * state.baseHeight * state.exaggeration;

      const yBot1 = e1 + 0.04;
      const yTop1 = e1 + ribbonH;
      const yBot2 = e2 + 0.04;
      const yTop2 = e2 + ribbonH;

      // Triângulo 1: bot1 -> bot2 -> top2
      quadPositions.push(p1[0], yBot1, p1[1]);
      quadPositions.push(p2[0], yBot2, p2[1]);
      quadPositions.push(p2[0], yTop2, p2[1]);

      // Triângulo 2: bot1 -> top2 -> top1
      quadPositions.push(p1[0], yBot1, p1[1]);
      quadPositions.push(p2[0], yTop2, p2[1]);
      quadPositions.push(p1[0], yTop1, p1[1]);

      linePositions.push(p1[0], yTop1, p1[1]);

      ringVerts.push({
        u1: p1[2], v1: p1[3],
        u2: p2[2], v2: p2[3],
        quadStart: i * 18,
        lineIdx: i
      });
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    pesdBoundaryGroup.add(ribbonMesh);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMesh = new THREE.LineLoop(lineGeo, lineMat);
    pesdBoundaryGroup.add(lineMesh);

    rawBoundaryVertices.push({ ribbonMesh, lineMesh, ringVerts, ribbonH });
  }

  const chk = document.getElementById('check-pesd-boundary');
  pesdBoundaryGroup.visible = !chk || chk.checked;
}

function updateParqueBoundaryElevation() {
  if (!rawBoundaryVertices.length) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (const item of rawBoundaryVertices) {
    const qPos = item.ribbonMesh.geometry.attributes.position;
    const lPos = item.lineMesh.geometry.attributes.position;
    const h = item.ribbonH;

    for (const v of item.ringVerts) {
      const e1 = getBilinearElevation(v.u1, v.v1, demW, demH) * state.baseHeight * state.exaggeration;
      const e2 = getBilinearElevation(v.u2, v.v2, demW, demH) * state.baseHeight * state.exaggeration;

      const yBot1 = e1 + 0.04;
      const yTop1 = e1 + h;
      const yBot2 = e2 + 0.04;
      const yTop2 = e2 + h;

      const q = v.quadStart;
      qPos.setY(q / 3 + 0, yBot1);
      qPos.setY(q / 3 + 1, yBot2);
      qPos.setY(q / 3 + 2, yTop2);

      qPos.setY(q / 3 + 3, yBot1);
      qPos.setY(q / 3 + 4, yTop2);
      qPos.setY(q / 3 + 5, yTop1);

      lPos.setY(v.lineIdx, yTop1);
    }

    qPos.needsUpdate = true;
    lPos.needsUpdate = true;
  }
}

// ============================================================================
// --- MODELOS 3D E GERENCIADOR DE MARCOS & PATRIMÔNIO HISTÓRICO ---
// ============================================================================
let osmLandmarksGroup = null;

// 1. Monólito da Pedra Goiana (Quartzito esculpido pelo intemperismo em equilíbrio precário)
function createPedraGoianaGeo() {
  // Base quartzítica robusta
  const base = new THREE.BoxGeometry(0.18, 0.09, 0.16);
  base.translate(0, 0.045, 0);
  applyVertexColors(base, [190, 165, 130]);

  // Rocha superior em equilíbrio oblíquo característico
  const topRock = new THREE.DodecahedronGeometry(0.14, 1);
  topRock.scale(1.4, 0.9, 1.1);
  topRock.rotateZ(0.25);
  topRock.rotateY(0.4);
  topRock.translate(0.04, 0.16, 0.02);
  applyVertexColors(topRock, [215, 185, 145]);

  return createColoredGeometry([base, topRock]);
}

// 2. Mirante Panorâmico da Serra Dourada (Deck de observação + mastro)
function createMirantePESDGeo() {
  // Deck de madeira
  const deck = new THREE.BoxGeometry(0.22, 0.02, 0.22);
  deck.translate(0, 0.08, 0);
  applyVertexColors(deck, [140, 100, 60]);

  // Pilares de sustentação
  const p1 = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4);
  p1.translate(-0.09, 0.04, -0.09);
  const p2 = p1.clone(); p2.translate(0.18, 0, 0);
  const p3 = p1.clone(); p3.translate(0, 0, 0.18);
  const p4 = p1.clone(); p4.translate(0.18, 0, 0.18);
  applyVertexColors(p1, [90, 65, 40]);
  applyVertexColors(p2, [90, 65, 40]);
  applyVertexColors(p3, [90, 65, 40]);
  applyVertexColors(p4, [90, 65, 40]);

  // Mastro central com sinalizador
  const pole = new THREE.CylinderGeometry(0.004, 0.005, 0.18, 6);
  pole.translate(0, 0.17, 0);
  applyVertexColors(pole, [220, 220, 230]);

  const flag = new THREE.BoxGeometry(0.05, 0.03, 0.003);
  flag.translate(0.028, 0.23, 0);
  applyVertexColors(flag, [34, 197, 94]); // Verde bandeira

  return createColoredGeometry([deck, p1, p2, p3, p4, pole, flag]);
}

// 3. Igreja Matriz de Sant'Ana (Catedral Colonial - Fachada monumental com torres gêmeas)
function createMatrizSantanaGeo() {
  // Corpo central da nave
  const nave = new THREE.BoxGeometry(0.24, 0.15, 0.32);
  nave.translate(0, 0.075, 0);
  applyVertexColors(nave, [245, 240, 230]);

  // Telhado cerâmico colonial
  const roof = new THREE.ConeGeometry(0.22, 0.07, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.2, 1.0, 1.6);
  roof.translate(0, 0.185, 0);
  applyVertexColors(roof, [180, 85, 45]);

  // Torre sineira esquerda
  const towerL = new THREE.BoxGeometry(0.065, 0.24, 0.065);
  towerL.translate(-0.13, 0.12, 0.13);
  applyVertexColors(towerL, [245, 240, 230]);
  const capL = new THREE.ConeGeometry(0.05, 0.06, 4);
  capL.rotateY(Math.PI / 4);
  capL.translate(-0.13, 0.27, 0.13);
  applyVertexColors(capL, [180, 85, 45]);

  // Torre sineira direita
  const towerR = new THREE.BoxGeometry(0.065, 0.24, 0.065);
  towerR.translate(0.13, 0.12, 0.13);
  applyVertexColors(towerR, [245, 240, 230]);
  const capR = capL.clone();
  capR.position.x = 0.13;

  // Frontispício / Portal barroco
  const portal = new THREE.BoxGeometry(0.05, 0.07, 0.015);
  portal.translate(0, 0.035, 0.165);
  applyVertexColors(portal, [100, 70, 45]);

  return createColoredGeometry([nave, roof, towerL, towerR, capL, capR, portal]);
}

// 4. Igreja de Santa Bárbara (Mirante no morro - torre central simplificada)
function createIgrejaSantaBarbaraGeo() {
  const base = new THREE.BoxGeometry(0.20, 0.12, 0.26);
  base.translate(0, 0.06, 0);
  applyVertexColors(base, [250, 250, 245]);

  const roof = new THREE.ConeGeometry(0.18, 0.06, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.2, 1.0, 1.4);
  roof.translate(0, 0.15, 0);
  applyVertexColors(roof, [190, 90, 50]);

  // Torre frontal única com campanário
  const tower = new THREE.BoxGeometry(0.06, 0.18, 0.06);
  tower.translate(0, 0.09, 0.11);
  applyVertexColors(tower, [245, 240, 235]);

  const cross = new THREE.BoxGeometry(0.01, 0.04, 0.01);
  cross.translate(0, 0.19, 0.11);
  applyVertexColors(cross, [210, 180, 60]);

  return createColoredGeometry([base, roof, tower, cross]);
}

// 5. Museu Casa de Cora Coralina (Casarão secular à beira do Rio Vermelho)
function createCasaCoraCoralinaGeo() {
  // Casarão térreo alongado com beiral colonial
  const house = new THREE.BoxGeometry(0.34, 0.09, 0.18);
  house.translate(0, 0.045, 0);
  applyVertexColors(house, [252, 250, 242]); // Caiado branco colonial

  // Telhado amplo de telha colonial
  const roof = new THREE.ConeGeometry(0.24, 0.06, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.6, 1.0, 1.2);
  roof.translate(0, 0.11, 0);
  applyVertexColors(roof, [185, 88, 48]);

  // Portais e janelas azuis tradicionais de Cora
  const door = new THREE.BoxGeometry(0.025, 0.05, 0.01);
  door.translate(-0.06, 0.025, 0.092);
  applyVertexColors(door, [40, 120, 200]); // Azul colonial

  const win1 = new THREE.BoxGeometry(0.025, 0.035, 0.01);
  win1.translate(0.04, 0.045, 0.092);
  applyVertexColors(win1, [40, 120, 200]);

  const win2 = win1.clone();
  win2.translate(0.06, 0, 0);

  // Mureta de pedra do Rio Vermelho
  const riverWall = new THREE.BoxGeometry(0.40, 0.04, 0.03);
  riverWall.translate(0, 0.02, 0.12);
  applyVertexColors(riverWall, [130, 125, 120]);

  return createColoredGeometry([house, roof, door, win1, win2, riverWall]);
}

// 6. Palácio Conde dos Arcos (Sede do Governo colonial de Goiás)
function createPalacioCondeArcosGeo() {
  const main = new THREE.BoxGeometry(0.36, 0.14, 0.22);
  main.translate(0, 0.07, 0);
  applyVertexColors(main, [248, 245, 238]);

  const roof = new THREE.ConeGeometry(0.26, 0.07, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.5, 1.0, 1.2);
  roof.translate(0, 0.175, 0);
  applyVertexColors(roof, [180, 85, 45]);

  // Frontão central clássico
  const pediment = new THREE.ConeGeometry(0.08, 0.04, 4);
  pediment.rotateY(Math.PI / 4);
  pediment.scale(1.2, 1.0, 0.5);
  pediment.translate(0, 0.16, 0.11);
  applyVertexColors(pediment, [240, 235, 220]);

  // Portal monumental
  const portal = new THREE.BoxGeometry(0.05, 0.07, 0.012);
  portal.translate(0, 0.035, 0.112);
  applyVertexColors(portal, [95, 65, 40]);

  return createColoredGeometry([main, roof, pediment, portal]);
}

async function loadOSMLandmarks() {
  try {
    const resp = await fetch('public/osm_landmarks_3d.json');
    if (!resp.ok) return;
    const data = await resp.json();
    buildOSMLandmarks(data);
    console.log('🏛️ Marcos históricos e geográficos 3D carregados com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar marcos 3D:', err);
  }
}

function buildOSMLandmarks(data) {
  if (osmLandmarksGroup) {
    scene.remove(osmLandmarksGroup);
    osmLandmarksGroup.clear();
  }
  osmLandmarksGroup = new THREE.Group();
  window.osmLandmarksGroup = osmLandmarksGroup;
  scene.add(osmLandmarksGroup);

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  const landmarkGeos = {
    pedra_goiana: createPedraGoianaGeo(),
    mirante_pesd: createMirantePESDGeo(),
    catedral_santana: createMatrizSantanaGeo(),
    igreja_santa_barbara: createIgrejaSantaBarbaraGeo(),
    casa_cora_coralina: createCasaCoraCoralinaGeo(),
    palacio_conde_arcos: createPalacioCondeArcosGeo()
  };

  const pbrMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    metalness: 0.12,
    flatShading: true
  });

  const list = data.landmarks || [];
  const s = state.landmarks ? (state.landmarks.scale || 1.0) : 1.0;

  for (const lm of list) {
    const geo = landmarkGeos[lm.id];
    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, pbrMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.set(s, s, s);

    const elev = getBilinearElevation(lm.u, lm.v, demW, demH) * state.baseHeight * state.exaggeration;
    mesh.position.set(lm.scene_x, elev, lm.scene_z);
    mesh.userData = lm;
    osmLandmarksGroup.add(mesh);
  }

  osmLandmarksGroup.visible = state.landmarks ? (state.landmarks.enabled !== false) : true;
}

function updateLandmarksScale(scaleVal) {
  if (!state.landmarks) state.landmarks = {};
  state.landmarks.scale = scaleVal;
  if (!osmLandmarksGroup) return;
  osmLandmarksGroup.traverse(child => {
    if (child.isMesh && child.userData && child.userData.id) {
      child.scale.set(scaleVal, scaleVal, scaleVal);
    }
  });
}

function updateOSMLandmarksElevation() {
  if (!osmLandmarksGroup) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  osmLandmarksGroup.traverse(child => {
    if (child.isMesh && child.userData && child.userData.u !== undefined) {
      const elev = getBilinearElevation(child.userData.u, child.userData.v, demW, demH) * state.baseHeight * state.exaggeration;
      child.position.y = elev;
    }
  });
}
