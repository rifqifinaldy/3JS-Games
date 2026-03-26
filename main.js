import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { keys, setupControls } from './controller.js';

// --- UI Elements ---
const elMenu = document.getElementById('main-menu');
const elUI = document.getElementById('ui');
const elEditorUI = document.getElementById('editor-ui');
const btnPlay = document.getElementById('btn-play');
const btnEditor = document.getElementById('btn-editor');
const lblScore = document.getElementById('score');

// --- Global State ---
let APP_STATE = 'LOADING'; // LOADING, MENU, PLAYING, EDITOR
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

// --- Game Constants & Variables ---
const TILE_SIZE = 4;
const SPEED = 0.15;
const POLICE_SPEED = 0.08;

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

// --- Map Data Structure ---
const GRID_W = 15;
const GRID_H = 13;
let mapGrid = [];

function initDefaultMap() {
    mapGrid = [];
    for (let z = 0; z < GRID_H; z++) {
        const row = [];
        for (let x = 0; x < GRID_W; x++) {
            const isBorder = (z === 0 || z === GRID_H - 1 || x === 0 || x === GRID_W - 1);
            row.push({
                type: isBorder ? 'house' : 'road',
                rot: 0,
                hasGem: (!isBorder && Math.random() > 0.8),
                spawn: null
            });
        }
        mapGrid.push(row);
    }
    // Set default spawns
    mapGrid[1][1].spawn = 'player';
    mapGrid[1][1].hasGem = false;
    mapGrid[GRID_H - 2][GRID_W - 2].spawn = 'police';
    mapGrid[GRID_H - 2][GRID_W - 2].hasGem = false;
}

initDefaultMap();

// Ground
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

manager.onLoad = () => {
    prepareModel(models.sedan, 1.2);
    prepareModel(models.police, 1.2);
    prepareModel(models.house, 3.8);
    
    btnPlay.innerText = "Start New Game";
    btnPlay.disabled = false;
    btnEditor.disabled = false;
    showMainMenu();
    animate();
};

loader.load('Assets/Player - Car/sedan.glb', (gltf) => { models.sedan = gltf.scene; });
loader.load('Assets/Player - Car/police.glb', (gltf) => { models.police = gltf.scene; });
loader.load('Assets/Building Block - Residential/building-type-a.glb', (gltf) => { models.house = gltf.scene; });

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

// --- State Transitions ---
function clearWorld() {
    gameObjects.houses.forEach(h => scene.remove(h));
    gameObjects.collectibles.forEach(c => scene.remove(c.mesh));
    if (playerModel) scene.remove(playerModel);
    if (policeModel) scene.remove(policeModel);
    gameObjects.houses = [];
    gameObjects.collectibles = [];
}

function showMainMenu() {
    APP_STATE = 'MENU';
    elMenu.classList.add('active');
    elUI.classList.remove('active');
    elEditorUI.classList.remove('active');
    clearWorld();
    rebuildWorldVisuals(true); // Build purely for visual background
}

function startGame() {
    APP_STATE = 'PLAYING';
    isGameOver = false;
    elMenu.classList.remove('active');
    elEditorUI.classList.remove('active');
    elUI.classList.add('active');
    
    clearWorld();
    rebuildWorldVisuals(false);
}

// --- Game Logic ---
function rebuildWorldVisuals(isMenuMode) {
    score = 0;
    totalCollectibles = 0;
    
    let pSpawn = { x: 1, z: 1 };
    let polSpawn = { x: GRID_W-2, z: GRID_H-2 };

    for (let z = 0; z < GRID_H; z++) {
        for (let x = 0; x < GRID_W; x++) {
            const cell = mapGrid[z][x];
            const pos = getGridWorldPos(x, z);
            
            if (cell.type === 'house') {
                const house = models.house.clone();
                house.position.set(pos.x, 0, pos.z);
                house.rotation.y = cell.rot;
                scene.add(house);
                gameObjects.houses.push(house);
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
    }
}

function checkCollision(box, objectsList, shrinkAmount = 0.2) {
    for (const obj of objectsList) {
        houseBox.setFromObject(obj);
        houseBox.expandByScalar(-shrinkAmount);
        if (box.intersectsBox(houseBox)) return true;
    }
    return false;
}

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
            if(nz<0 || nz>=GRID_H || nx<0 || nx>=GRID_W) return false;
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
let currentTool = 'house';
let currentRot = 0;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let editorGridHelper = null;

function startEditor() {
    APP_STATE = 'EDITOR';
    elMenu.classList.remove('active');
    elUI.classList.remove('active');
    elEditorUI.classList.add('active');
    
    clearWorld();
    rebuildWorldVisuals(true);
    
    if(!editorGridHelper) {
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
    if (currentTool === 'house') mesh = models.house.clone();
    else if (currentTool === 'player') mesh = models.sedan.clone();
    else if (currentTool === 'police') mesh = models.police.clone();
    else if (currentTool === 'gem') mesh = new THREE.Mesh(collectibleGeo, collectibleMat);
    
    if (mesh) {
        if(currentTool === 'gem') mesh.position.y = 0.5;
        // Make it semi-transparent
        mesh.traverse(n => {
            if(n.isMesh) {
                n.material = n.material.clone();
                n.material.transparent = true;
                n.material.opacity = 0.5;
            }
        });
        mesh.rotation.y = currentRot;
        editorHologram.add(mesh);
    }
}

// Editor Interaction
window.addEventListener('mousemove', (e) => {
    if (APP_STATE !== 'EDITOR') return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', (e) => {
    if (APP_STATE !== 'EDITOR' || e.button !== 0) return;
    
    // Check if clicked exactly on the UI to avoid painting under menus
    if (e.target.closest('.overlay')) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);
    
    if (intersects.length > 0) {
        const p = intersects[0].point;
        const gX = Math.floor((p.x / TILE_SIZE) + (GRID_W / 2));
        const gZ = Math.floor((p.z / TILE_SIZE) + (GRID_H / 2));

        if (gX >= 0 && gX < GRID_W && gZ >= 0 && gZ < GRID_H) {
            const cell = mapGrid[gZ][gX];

            if (currentTool === 'house') {
                cell.type = 'house';
                cell.rot = currentRot;
                cell.spawn = null;
                cell.hasGem = false;
            } else if (currentTool === 'road') {
                cell.type = 'road';
                cell.spawn = null;
                cell.hasGem = false;
            } else if (currentTool === 'gem') {
                if (cell.type === 'road' && !cell.spawn) cell.hasGem = !cell.hasGem;
            } else if (currentTool === 'player' || currentTool === 'police') {
                // Clear old spawn
                for (let zz=0; zz<GRID_H; zz++) {
                    for (let xx=0; xx<GRID_W; xx++) {
                        if (mapGrid[zz][xx].spawn === currentTool) mapGrid[zz][xx].spawn = null;
                    }
                }
                cell.type = 'road';
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

document.querySelectorAll('input[name="tool"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentTool = e.target.value;
        updateHologramVisual();
    });
});

// UI Button Listeners
btnPlay.addEventListener('click', startGame);
btnEditor.addEventListener('click', startEditor);
document.getElementById('btn-editor-play').addEventListener('click', () => {
    if(editorGridHelper) editorGridHelper.visible = false;
    scene.remove(editorHologram);
    startGame();
});
document.getElementById('btn-editor-menu').addEventListener('click', () => {
    if(editorGridHelper) editorGridHelper.visible = false;
    scene.remove(editorHologram);
    showMainMenu();
});

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
        // Player Movement
        const oldX = playerModel.position.x;
        const oldZ = playerModel.position.z;
        let isMoving = false;
        let targetRotation = playerModel.rotation.y;

        if (keys.w) { playerModel.position.z -= SPEED; targetRotation = Math.PI; isMoving = true; }
        if (keys.s) { playerModel.position.z += SPEED; targetRotation = 0; isMoving = true; }
        if (keys.a) { playerModel.position.x -= SPEED; targetRotation = Math.PI / 2; isMoving = true; }
        if (keys.d) { playerModel.position.x += SPEED; targetRotation = -Math.PI / 2; isMoving = true; }

        if (isMoving) playerModel.rotation.y = targetRotation; 

        playerBox.setFromObject(playerModel);
        if (checkCollision(playerBox, gameObjects.houses, 0.4)) {
            playerModel.position.x = oldX;
            playerModel.position.z = oldZ;
        }

        updatePoliceAI();

        playerBox.setFromObject(playerModel);
        policeBox.setFromObject(policeModel);
        policeBox.expandByScalar(-0.2);
        if (playerBox.intersectsBox(policeBox)) {
            isGameOver = true;
            setTimeout(() => {
                alert("Game Over! The police caught you!");
                showMainMenu();
            }, 50);
        }

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
                    isGameOver = true;
                    setTimeout(() => {
                        alert("You win! You survived suburbia!");
                        showMainMenu();
                    }, 50);
                }
            }
        }

        camera.position.x += (playerModel.position.x - camera.position.x) * 0.1;
        camera.position.y += (playerModel.position.y + 16 - camera.position.y) * 0.1;
        camera.position.z += (playerModel.position.z + 14 - camera.position.z) * 0.1;
        camera.lookAt(playerModel.position);
    }

    renderer.render(scene, camera);
}
