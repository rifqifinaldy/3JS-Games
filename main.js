import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { keys, setupControls } from './controller.js';

// --- UI Elements ---
const elMenu = document.getElementById('main-menu');
const elUI = document.getElementById('ui');
const elEditorUI = document.getElementById('editor-ui');
const elGameOver = document.getElementById('game-over');
const btnPlay = document.getElementById('btn-play');
const btnEditor = document.getElementById('btn-editor');
const lblScore = document.getElementById('score');

// --- Global State ---
let APP_STATE = 'LOADING';
let isGameOver = false;

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
scene.add(dirLight);

// --- Constants ---
const TILE_SIZE = 4;
const SPEED = 0.12;
const TURN_SPEED = 0.04; // Steering rate (radians/frame)
const POLICE_SPEED = 0.08;

// --- 3rd Person Camera ---
let camAngleY = Math.PI; // Start behind the car (car faces -Z = Math.PI)
const CAM_DIST = 12;
const CAM_HEIGHT = 6;
const CAM_LERP = 0.08;
let playerHeading = Math.PI; // Car's facing angle (radians, Math.PI = facing -Z)

// --- Models & Game Objects ---
const models = {};
const gameObjects = { houses: [], collectibles: [] };
let playerModel = null;
let policeModel = null;
let score = 0;
let totalCollectibles = 0;

let policeTargetX = 0, policeTargetZ = 0;
let policeDir = { x: 0, z: 0 };
const houseBox = new THREE.Box3();
const playerBox = new THREE.Box3();
const policeBox = new THREE.Box3();

// --- Map Data ---
const GRID_W = 15;
const GRID_H = 13;
let mapGrid = [];

// --- Asset Registry for Editor (grouped by subfolder) ---
const ASSET_GROUPS = [
    {
        group: 'Buildings',
        folder: 'Assets/Building Block - Residential/Buildings',
        items: [
            { id: 'building-type-a', label: 'House A', file: 'building-type-a.glb' },
            { id: 'building-type-b', label: 'House B', file: 'building-type-b.glb' },
            { id: 'building-type-c', label: 'House C', file: 'building-type-c.glb' },
            { id: 'building-type-d', label: 'House D', file: 'building-type-d.glb' },
            { id: 'building-type-e', label: 'House E', file: 'building-type-e.glb' },
            { id: 'building-type-f', label: 'House F', file: 'building-type-f.glb' },
            { id: 'building-type-g', label: 'House G', file: 'building-type-g.glb' },
            { id: 'building-type-h', label: 'House H', file: 'building-type-h.glb' },
            { id: 'building-type-i', label: 'House I', file: 'building-type-i.glb' },
            { id: 'building-type-j', label: 'House J', file: 'building-type-j.glb' },
            { id: 'building-type-k', label: 'House K', file: 'building-type-k.glb' },
            { id: 'building-type-l', label: 'House L', file: 'building-type-l.glb' },
            { id: 'building-type-m', label: 'House M', file: 'building-type-m.glb' },
            { id: 'building-type-n', label: 'House N', file: 'building-type-n.glb' },
            { id: 'building-type-o', label: 'House O', file: 'building-type-o.glb' },
            { id: 'building-type-p', label: 'House P', file: 'building-type-p.glb' },
            { id: 'building-type-q', label: 'House Q', file: 'building-type-q.glb' },
            { id: 'building-type-r', label: 'House R', file: 'building-type-r.glb' },
            { id: 'building-type-s', label: 'House S', file: 'building-type-s.glb' },
            { id: 'building-type-t', label: 'House T', file: 'building-type-t.glb' },
            { id: 'building-type-u', label: 'House U', file: 'building-type-u.glb' },
        ]
    },
    {
        group: 'Fences',
        folder: 'Assets/Building Block - Residential/Fences',
        items: [
            { id: 'fence', label: 'Fence', file: 'fence.glb' },
            { id: 'fence-low', label: 'Fence Low', file: 'fence-low.glb' },
            { id: 'fence-1x2', label: 'Fence 1x2', file: 'fence-1x2.glb' },
            { id: 'fence-1x3', label: 'Fence 1x3', file: 'fence-1x3.glb' },
            { id: 'fence-1x4', label: 'Fence 1x4', file: 'fence-1x4.glb' },
            { id: 'fence-2x2', label: 'Fence 2x2', file: 'fence-2x2.glb' },
            { id: 'fence-2x3', label: 'Fence 2x3', file: 'fence-2x3.glb' },
            { id: 'fence-3x2', label: 'Fence 3x2', file: 'fence-3x2.glb' },
            { id: 'fence-3x3', label: 'Fence 3x3', file: 'fence-3x3.glb' },
        ]
    },
    {
        group: 'Trees',
        folder: 'Assets/Building Block - Residential/Trees',
        items: [
            { id: 'tree-large', label: 'Tree Large', file: 'tree-large.glb' },
            { id: 'tree-small', label: 'Tree Small', file: 'tree-small.glb' },
        ]
    },
    {
        group: 'Others',
        folder: 'Assets/Building Block - Residential/Others',
        items: [
            { id: 'driveway-long', label: 'Driveway Long', file: 'driveway-long.glb' },
            { id: 'driveway-short', label: 'Driveway Short', file: 'driveway-short.glb' },
            { id: 'path-long', label: 'Path Long', file: 'path-long.glb' },
            { id: 'path-short', label: 'Path Short', file: 'path-short.glb' },
            { id: 'path-stones-long', label: 'Stones Long', file: 'path-stones-long.glb' },
            { id: 'path-stones-messy', label: 'Stones Messy', file: 'path-stones-messy.glb' },
            { id: 'path-stones-short', label: 'Stones Short', file: 'path-stones-short.glb' },
            { id: 'planter', label: 'Planter', file: 'planter.glb' },
        ]
    }
];

// Flatten for easy iteration
const ASSET_REGISTRY = ASSET_GROUPS.flatMap(g => g.items.map(i => ({ ...i, folder: g.folder, group: g.group })));

// --- Preview Renderer (for thumbnails) ---
const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
previewRenderer.setSize(80, 80);
const previewScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
previewCamera.position.set(3, 3, 3);
previewCamera.lookAt(0, 0.5, 0);
previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
const prevDirLight = new THREE.DirectionalLight(0xffffff, 0.6);
prevDirLight.position.set(3, 5, 3);
previewScene.add(prevDirLight);

function generatePreviewDataURL(model) {
    // Clone and fit to preview
    const clone = model.clone();
    
    // Compute bounding box to auto-scale
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.0 / maxDim;
    clone.scale.multiplyScalar(scale);
    
    // Center
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(clone).getCenter(center);
    clone.position.sub(center);
    clone.position.y += 0.3;

    previewScene.add(clone);
    previewRenderer.render(previewScene, previewCamera);
    previewScene.remove(clone);
    
    return previewRenderer.domElement.toDataURL();
}

// --- Init Default Map (pre-designed suburban layout) ---
// H = house, _ = road, G = road+gem, P = player spawn, C = police spawn
const DEFAULT_MAP_STR = [
    'HHHHHHHHHHHHHHH',
    'HP_G_H___G___CH',
    'H_HHH_HHH_HH_H',
    'H___G___G___G_H',
    'HHH_HHH_HHH_HH',
    'H_G_____G_____H',
    'H_HHH_H_H_HHH_',
    'H_G___G___G___H',
    'HH_HHH_HHH_HHH',
    'H___G_____G___H',
    'H_HHH_HHH_HH_H',
    'HG___G___G____H',
    'HHHHHHHHHHHHHHH',
];

function initDefaultMap() {
    mapGrid = [];
    const houseTypes = ['building-type-a','building-type-b','building-type-c','building-type-d','building-type-e',
                        'building-type-f','building-type-g','building-type-h','building-type-i','building-type-j'];
    for (let z = 0; z < GRID_H; z++) {
        const row = [];
        for (let x = 0; x < GRID_W; x++) {
            const ch = DEFAULT_MAP_STR[z]?.[x] || '_';
            const cell = { type: 'road', assetId: null, rot: 0, hasGem: false, spawn: null };
            if (ch === 'H') {
                cell.type = 'house';
                cell.assetId = houseTypes[Math.floor(Math.random() * houseTypes.length)];
                cell.rot = (Math.floor(Math.random() * 4) * Math.PI) / 2;
            } else if (ch === 'G') {
                cell.hasGem = true;
            } else if (ch === 'P') {
                cell.spawn = 'player';
            } else if (ch === 'C') {
                cell.spawn = 'police';
            }
            row.push(cell);
        }
        mapGrid.push(row);
    }
}

// Empty map for the editor (just borders)
function initEmptyMap() {
    mapGrid = [];
    for (let z = 0; z < GRID_H; z++) {
        const row = [];
        for (let x = 0; x < GRID_W; x++) {
            const isBorder = (z === 0 || z === GRID_H - 1 || x === 0 || x === GRID_W - 1);
            row.push({
                type: isBorder ? 'house' : 'road',
                assetId: isBorder ? 'building-type-a' : null,
                rot: 0,
                hasGem: false,
                spawn: null
            });
        }
        mapGrid.push(row);
    }
    mapGrid[1][1].spawn = 'player';
    mapGrid[GRID_H - 2][GRID_W - 2].spawn = 'police';
}
initDefaultMap();

// --- Ground ---
const groundGeo = new THREE.PlaneGeometry(GRID_W * TILE_SIZE, GRID_H * TILE_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function getGridWorldPos(x, z) {
    return {
        x: (x - GRID_W / 2 + 0.5) * TILE_SIZE,
        z: (z - GRID_H / 2 + 0.5) * TILE_SIZE
    };
}

// --- Asset Loading ---
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);

let assetsLoaded = 0;
const totalAssets = ASSET_REGISTRY.length + 2; // +2 for sedan and police

function onAssetProgress() {
    assetsLoaded++;
    btnPlay.innerText = `Loading... (${assetsLoaded}/${totalAssets})`;
}

manager.onLoad = () => {
    prepareModel(models.sedan, 1.2);
    prepareModel(models.police, 1.2);
    
    ASSET_REGISTRY.forEach(entry => {
        if (models[entry.id]) {
            prepareModel(models[entry.id], 3.8);
        }
    });
    
    buildEditorPalette();
    
    btnPlay.innerText = "Start New Game";
    btnPlay.disabled = false;
    btnEditor.disabled = false;
    showMainMenu();
    animate();
};

// Load car models
loader.load('Assets/Player - Car/sedan.glb', (gltf) => { models.sedan = gltf.scene; onAssetProgress(); });
loader.load('Assets/Player - Car/police.glb', (gltf) => { models.police = gltf.scene; onAssetProgress(); });

// Load all building assets from their respective subfolders
ASSET_REGISTRY.forEach(entry => {
    loader.load(`${entry.folder}/${entry.file}`, (gltf) => {
        models[entry.id] = gltf.scene;
        onAssetProgress();
    }, undefined, (err) => {
        console.warn(`Failed to load ${entry.folder}/${entry.file}:`, err);
        onAssetProgress();
    });
});

const collectibleGeo = new THREE.OctahedronGeometry(0.3);
const collectibleMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 0.8 });

function prepareModel(model, scale) {
    model.scale.set(scale, scale, scale);
    model.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
}

// --- Build Editor Palette with Accordion Groups ---
function buildEditorPalette() {
    const palette = document.getElementById('editor-palette');
    palette.innerHTML = '';
    let isFirst = true;
    
    ASSET_GROUPS.forEach((group, groupIdx) => {
        // Accordion header (clickable)
        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.innerHTML = `<span class="accordion-arrow">&#9660;</span> ${group.group} <span class="accordion-count">(${group.items.length})</span>`;
        palette.appendChild(header);
        
        // Accordion body (collapsible container)
        const body = document.createElement('div');
        body.className = 'accordion-body';
        if (groupIdx > 0) body.classList.add('collapsed'); // Only first group open by default
        
        group.items.forEach(entry => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'tool';
            radio.value = entry.id;
            if (isFirst) { radio.checked = true; isFirst = false; }
            
            const img = document.createElement('img');
            img.className = 'asset-preview';
            if (models[entry.id]) {
                img.src = generatePreviewDataURL(models[entry.id]);
            }
            
            const span = document.createElement('span');
            span.textContent = entry.label;
            
            label.appendChild(radio);
            label.appendChild(img);
            label.appendChild(span);
            body.appendChild(label);
            
            radio.addEventListener('change', () => {
                currentTool = entry.id;
                updateHologramVisual();
                document.querySelectorAll('#editor-ui .toolbar:not(#editor-palette) input[name="tool"]').forEach(r => r.checked = false);
            });
        });
        
        palette.appendChild(body);
        
        // Toggle accordion on click
        header.addEventListener('click', () => {
            body.classList.toggle('collapsed');
            const arrow = header.querySelector('.accordion-arrow');
            arrow.innerHTML = body.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
        });
    });
}

// --- State Transitions ---
function clearWorld() {
    gameObjects.houses.forEach(h => scene.remove(h));
    gameObjects.collectibles.forEach(c => scene.remove(c.mesh));
    if (playerModel) scene.remove(playerModel);
    if (policeModel) scene.remove(policeModel);
    gameObjects.houses = [];
    gameObjects.collectibles = [];
    playerModel = null;
    policeModel = null;
}

function showMainMenu() {
    APP_STATE = 'MENU';
    elMenu.classList.add('active');
    elUI.classList.remove('active');
    elEditorUI.classList.remove('active');
    elGameOver.classList.remove('active');
    clearWorld();
    rebuildWorldVisuals(true);
}

function startGame(useDefaultMap = false) {
    if (useDefaultMap) initDefaultMap();
    APP_STATE = 'PLAYING';
    isGameOver = false;
    elMenu.classList.remove('active');
    elEditorUI.classList.remove('active');
    elGameOver.classList.remove('active');
    elUI.classList.add('active');
    
    clearWorld();
    rebuildWorldVisuals(false);
}

function showGameOver(title, message) {
    isGameOver = true;
    document.getElementById('game-over-title').innerText = title;
    document.getElementById('game-over-msg').innerText = message;
    elGameOver.classList.add('active');
}

// --- World Builder ---
function rebuildWorldVisuals(isMenuMode) {
    score = 0;
    totalCollectibles = 0;
    
    let pSpawn = { x: 1, z: 1 };
    let polSpawn = { x: GRID_W - 2, z: GRID_H - 2 };

    for (let z = 0; z < GRID_H; z++) {
        for (let x = 0; x < GRID_W; x++) {
            const cell = mapGrid[z][x];
            const pos = getGridWorldPos(x, z);
            
            if (cell.type === 'house') {
                const assetId = cell.assetId || 'building-type-a';
                if (models[assetId]) {
                    const house = models[assetId].clone();
                    house.position.set(pos.x, 0, pos.z);
                    house.rotation.y = cell.rot;
                    scene.add(house);
                    gameObjects.houses.push(house);
                }
            } else if (cell.type === 'road' && cell.hasGem && !isMenuMode) {
                const coin = new THREE.Mesh(collectibleGeo, collectibleMat);
                coin.position.set(pos.x, 0.5, pos.z);
                coin.castShadow = true;
                scene.add(coin);
                gameObjects.collectibles.push({ mesh: coin, baseY: 0.5, offset: Math.random() * 10 });
                totalCollectibles++;
            }

            if (cell.spawn === 'player') pSpawn = { x, z };
            if (cell.spawn === 'police') polSpawn = { x, z };
        }
    }

    lblScore.innerText = `0 / ${totalCollectibles}`;

    if (!isMenuMode) {
        playerModel = models.sedan.clone();
        const pwp = getGridWorldPos(pSpawn.x, pSpawn.z);
        playerModel.position.set(pwp.x, 0, pwp.z);
        scene.add(playerModel);

        policeModel = models.police.clone();
        const polWp = getGridWorldPos(polSpawn.x, polSpawn.z);
        policeModel.position.set(polWp.x, 0, polWp.z);
        policeTargetX = polSpawn.x;
        policeTargetZ = polSpawn.z;
        policeDir = { x: -1, z: 0 };
        scene.add(policeModel);
        
        // Reset camera angle to behind player
        camAngleY = 0;
    }
}

// --- Collision ---
function checkCollision(box, objectsList, shrinkAmount = 0.2) {
    for (const obj of objectsList) {
        houseBox.setFromObject(obj);
        houseBox.expandByScalar(-shrinkAmount);
        if (box.intersectsBox(houseBox)) return true;
    }
    return false;
}

// --- Police AI ---
function updatePoliceAI() {
    if (!policeModel) return;

    const currentPos = policeModel.position;
    const targetWorldPos = getGridWorldPos(policeTargetX, policeTargetZ);

    const dx = targetWorldPos.x - currentPos.x;
    const dz = targetWorldPos.z - currentPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > POLICE_SPEED) {
        currentPos.x += (dx / dist) * POLICE_SPEED;
        currentPos.z += (dz / dist) * POLICE_SPEED;
        
        if (Math.abs(dx) > Math.abs(dz)) {
            policeModel.rotation.y = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
            policeModel.rotation.y = dz > 0 ? 0 : Math.PI;
        }
    } else {
        currentPos.x = targetWorldPos.x;
        currentPos.z = targetWorldPos.z;

        const dirs = [
            { x: 1, z: 0 }, { x: -1, z: 0 },
            { x: 0, z: 1 }, { x: 0, z: -1 }
        ];
        dirs.sort(() => Math.random() - 0.5);

        let validDirs = dirs.filter(d => {
            const nz = policeTargetZ + d.z;
            const nx = policeTargetX + d.x;
            if (nz < 0 || nz >= GRID_H || nx < 0 || nx >= GRID_W) return false;
            return mapGrid[nz][nx].type === 'road';
        });

        if (validDirs.length > 1) {
            validDirs = validDirs.filter(d => !(d.x === -policeDir.x && d.z === -policeDir.z));
        }

        if (validDirs.length > 0) {
            policeDir = validDirs[0];
            policeTargetX += policeDir.x;
            policeTargetZ += policeDir.z;
        }
    }
}

// --- Editor Mode ---
let editorHologram = new THREE.Group();
let currentTool = 'building-type-a';
let currentRot = 0;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let editorGridHelper = null;

function startEditor() {
    APP_STATE = 'EDITOR';
    initEmptyMap();
    elMenu.classList.remove('active');
    elUI.classList.remove('active');
    elGameOver.classList.remove('active');
    elEditorUI.classList.add('active');
    
    clearWorld();
    rebuildWorldVisuals(true);
    
    if (!editorGridHelper) {
        editorGridHelper = new THREE.GridHelper(Math.max(GRID_W, GRID_H) * TILE_SIZE, Math.max(GRID_W, GRID_H));
        editorGridHelper.position.y = 0.01;
        scene.add(editorGridHelper);
    }
    editorGridHelper.visible = true;
    scene.add(editorHologram);
    updateHologramVisual();
}

function updateHologramVisual() {
    editorHologram.clear();
    let mesh = null;
    
    // Check if it's a registered building asset
    const isAsset = ASSET_REGISTRY.some(a => a.id === currentTool);
    
    if (isAsset && models[currentTool]) {
        mesh = models[currentTool].clone();
    } else if (currentTool === 'player') {
        mesh = models.sedan.clone();
    } else if (currentTool === 'police') {
        mesh = models.police.clone();
    } else if (currentTool === 'gem') {
        mesh = new THREE.Mesh(collectibleGeo, collectibleMat);
    }
    
    if (mesh) {
        if (currentTool === 'gem') mesh.position.y = 0.5;
        mesh.traverse(n => {
            if (n.isMesh) {
                n.material = n.material.clone();
                n.material.transparent = true;
                n.material.opacity = 0.5;
            }
        });
        mesh.rotation.y = currentRot;
        editorHologram.add(mesh);
    }
}

// --- Editor Interaction ---
window.addEventListener('mousemove', (e) => {
    if (APP_STATE !== 'EDITOR') return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', (e) => {
    if (APP_STATE !== 'EDITOR' || e.button !== 0) return;
    if (e.target.closest('.overlay')) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);
    
    if (intersects.length > 0) {
        const p = intersects[0].point;
        const gX = Math.floor((p.x / TILE_SIZE) + (GRID_W / 2));
        const gZ = Math.floor((p.z / TILE_SIZE) + (GRID_H / 2));

        if (gX >= 0 && gX < GRID_W && gZ >= 0 && gZ < GRID_H) {
            const cell = mapGrid[gZ][gX];
            const isAsset = ASSET_REGISTRY.some(a => a.id === currentTool);

            if (isAsset) {
                cell.type = 'house';
                cell.assetId = currentTool;
                cell.rot = currentRot;
                cell.spawn = null;
                cell.hasGem = false;
            } else if (currentTool === 'road') {
                cell.type = 'road';
                cell.assetId = null;
                cell.spawn = null;
                cell.hasGem = false;
            } else if (currentTool === 'gem') {
                if (cell.type === 'road' && !cell.spawn) cell.hasGem = !cell.hasGem;
            } else if (currentTool === 'player' || currentTool === 'police') {
                for (let zz = 0; zz < GRID_H; zz++) {
                    for (let xx = 0; xx < GRID_W; xx++) {
                        if (mapGrid[zz][xx].spawn === currentTool) mapGrid[zz][xx].spawn = null;
                    }
                }
                cell.type = 'road';
                cell.assetId = null;
                cell.spawn = currentTool;
                cell.hasGem = false;
            }

            clearWorld();
            rebuildWorldVisuals(true);
        }
    }
});

window.addEventListener('keydown', (e) => {
    if (APP_STATE === 'EDITOR' && e.key.toLowerCase() === 'r') {
        currentRot -= Math.PI / 2;
        editorHologram.children.forEach(c => c.rotation.y = currentRot);
    }
});

// Non-asset tools (road, gem, player, police) from HTML
document.querySelectorAll('#editor-ui .toolbar:not(#editor-palette) input[name="tool"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentTool = e.target.value;
        updateHologramVisual();
        // Uncheck palette radios
        document.querySelectorAll('#editor-palette input[name="tool"]').forEach(r => r.checked = false);
    });
});

// --- Right-click camera orbit in PLAYING mode ---
let isRightMouseDown = false;
window.addEventListener('mousedown', (e) => {
    if (e.button === 2) isRightMouseDown = true;
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightMouseDown = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
    if (APP_STATE === 'PLAYING' && isRightMouseDown) {
        camAngleY -= e.movementX * 0.005;
    }
});

// --- UI Button Listeners ---
btnPlay.addEventListener('click', () => startGame(true)); // Start New Game = use pre-designed map
btnEditor.addEventListener('click', startEditor);
document.getElementById('btn-editor-play').addEventListener('click', () => {
    if (editorGridHelper) editorGridHelper.visible = false;
    scene.remove(editorHologram);
    startGame(false); // Play custom map from editor
});
document.getElementById('btn-editor-menu').addEventListener('click', () => {
    if (editorGridHelper) editorGridHelper.visible = false;
    scene.remove(editorHologram);
    showMainMenu();
});
document.getElementById('btn-go-menu').addEventListener('click', () => showMainMenu());
document.getElementById('btn-go-retry').addEventListener('click', () => startGame(false));

// --- Main Loop ---
setupControls();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);

    if (APP_STATE === 'MENU') {
        const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time) * 30;
        camera.position.z = Math.sin(time) * 30;
        camera.position.y = 25;
        camera.lookAt(0, 0, 0);
    } 
    else if (APP_STATE === 'EDITOR') {
        camera.position.set(0, 45, 10);
        camera.lookAt(0, 0, 0);
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ground);
        if (intersects.length > 0) {
            const p = intersects[0].point;
            const gX = Math.floor((p.x / TILE_SIZE) + (GRID_W / 2));
            const gZ = Math.floor((p.z / TILE_SIZE) + (GRID_H / 2));
            
            if (gX >= 0 && gX < GRID_W && gZ >= 0 && gZ < GRID_H) {
                const wp = getGridWorldPos(gX, gZ);
                editorHologram.position.set(wp.x, 0, wp.z);
            }
        }
    }
    else if (APP_STATE === 'PLAYING' && !isGameOver) {
        // --- GTA-style Movement ---
        const oldX = playerModel.position.x;
        const oldZ = playerModel.position.z;
        let isMoving = false;
        let isReversing = false;

        // A/D = Steer (only while moving)
        if (keys.a && (keys.w || keys.s)) {
            playerHeading += TURN_SPEED * (keys.s ? -1 : 1);
        }
        if (keys.d && (keys.w || keys.s)) {
            playerHeading -= TURN_SPEED * (keys.s ? -1 : 1);
        }

        // W = Drive forward in the direction the car faces
        if (keys.w) {
            playerModel.position.x -= Math.sin(playerHeading) * SPEED;
            playerModel.position.z -= Math.cos(playerHeading) * SPEED;
            isMoving = true;
        }
        // S = Reverse
        if (keys.s) {
            playerModel.position.x += Math.sin(playerHeading) * SPEED * 0.6;
            playerModel.position.z += Math.cos(playerHeading) * SPEED * 0.6;
            isMoving = true;
            isReversing = true;
        }

        // Apply car visual rotation to match heading
        // The .glb model faces +Z by default, but our heading treats -Z as forward, so offset by PI
        playerModel.rotation.y = playerHeading + Math.PI;

        // Wall collision — use grid lookup instead of Box3 to prevent getting stuck
        // Convert player world position to grid coordinates and check if that tile is blocked
        const newGX = Math.floor((playerModel.position.x / TILE_SIZE) + (GRID_W / 2));
        const newGZ = Math.floor((playerModel.position.z / TILE_SIZE) + (GRID_H / 2));
        
        const isBlocked = (
            newGX < 0 || newGX >= GRID_W || newGZ < 0 || newGZ >= GRID_H ||
            mapGrid[newGZ]?.[newGX]?.type === 'house'
        );
        
        if (isBlocked) {
            playerModel.position.x = oldX;
            playerModel.position.z = oldZ;
        }

        updatePoliceAI();

        // Police catch check
        playerBox.setFromObject(playerModel);
        policeBox.setFromObject(policeModel);
        policeBox.expandByScalar(-0.2);
        if (playerBox.intersectsBox(policeBox)) {
            showGameOver("Busted! 🚔", "The police caught you!");
        }

        // Collectibles
        const time = Date.now() * 0.003;
        for (let i = gameObjects.collectibles.length - 1; i >= 0; i--) {
            const item = gameObjects.collectibles[i];
            item.mesh.rotation.y += 0.02;
            item.mesh.position.y = item.baseY + Math.sin(time + item.offset) * 0.1;

            if (playerModel.position.distanceTo(item.mesh.position) < 1.5) {
                scene.remove(item.mesh);
                gameObjects.collectibles.splice(i, 1);
                score++;
                lblScore.innerText = `${score} / ${totalCollectibles}`;

                if (score === totalCollectibles && totalCollectibles > 0) {
                    showGameOver("You Win! 🏆", "You survived suburbia and collected all gems!");
                }
            }
        }

        // --- GTA-style 3rd Person Camera ---
        // Camera target angle: always behind car, flip when reversing
        let targetCamAngle = playerHeading;
        if (isReversing) {
            targetCamAngle = playerHeading + Math.PI; // Look at front of car when reversing
        }

        // Only auto-follow when not manually orbiting with right-click
        if (!isRightMouseDown) {
            let angleDiff = targetCamAngle - camAngleY;
            // Normalize to [-PI, PI] for shortest rotation
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            camAngleY += angleDiff * 0.08;
        }

        const px = playerModel.position.x;
        const py = playerModel.position.y;
        const pz = playerModel.position.z;

        // Desired camera position
        let desiredDist = CAM_DIST;
        const desiredX = px + Math.sin(camAngleY) * desiredDist;
        const desiredZ = pz + Math.cos(camAngleY) * desiredDist;
        const desiredY = py + CAM_HEIGHT;

        // Raycast from player to desired camera pos to detect occlusion
        const playerPos = new THREE.Vector3(px, py + 1, pz);
        const desiredPos = new THREE.Vector3(desiredX, desiredY, desiredZ);
        const camDirVec = new THREE.Vector3().subVectors(desiredPos, playerPos).normalize();
        const camRay = new THREE.Raycaster(playerPos, camDirVec, 0, desiredDist + 2);
        const camHits = camRay.intersectObjects(gameObjects.houses, true);

        let finalDist = desiredDist;
        if (camHits.length > 0) {
            finalDist = Math.max(camHits[0].distance - 1.5, 2);
        }

        const camX = px + Math.sin(camAngleY) * finalDist;
        const camZ = pz + Math.cos(camAngleY) * finalDist;
        const camY = py + CAM_HEIGHT * (finalDist / desiredDist);

        camera.position.x += (camX - camera.position.x) * CAM_LERP;
        camera.position.y += (camY - camera.position.y) * CAM_LERP;
        camera.position.z += (camZ - camera.position.z) * CAM_LERP;
        camera.lookAt(px, py + 1, pz);
    }

    renderer.render(scene, camera);
}
