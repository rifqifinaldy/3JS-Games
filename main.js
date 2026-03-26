import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { keys, setupControls } from './controller.js';

// 1. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 2. Lighting
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

// 3. Game State
let isGameOver = false;
let score = 0;
let totalCollectibles = 0;
const TILE_SIZE = 4; // Width of a tile block
const SPEED = 0.15;
const POLICE_SPEED = 0.08;

// Models
let playerModel = null;
let policeModel = null;
const houses = [];
const collectibles = [];
const houseBox = new THREE.Box3();
const playerBox = new THREE.Box3();
const policeBox = new THREE.Box3();

// 4. Map Layout (1 = House, 0 = Road)
const mapGrid = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

const gridWidth = mapGrid[0].length;
const gridHeight = mapGrid.length;

// Helper to convert grid coord to world coord
function getGridPos(x, z) {
    return {
        x: (x - gridWidth / 2) * TILE_SIZE,
        z: (z - gridHeight / 2) * TILE_SIZE
    };
}

// Helper to center things nicely on the ground
const groundGeo = new THREE.PlaneGeometry(gridWidth * TILE_SIZE, gridHeight * TILE_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }); // Dark Asphalt
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 5. Load Assets
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
const models = {};

console.log("Starting model load...");

manager.onLoad = function () {
    console.log('All assets loaded! Building world...');
    buildWorld();
    animate();
};

loader.load('Assets/Player - Car/sedan.glb', (gltf) => { models.sedan = gltf.scene; });
loader.load('Assets/Player - Car/police.glb', (gltf) => { models.police = gltf.scene; });
loader.load('Assets/Building Block - Residential/building-type-a.glb', (gltf) => { models.house = gltf.scene; });

function prepareModel(model, scale) {
    model.scale.set(scale, scale, scale);
    model.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
}

function buildWorld() {
    // Prepare models
    prepareModel(models.sedan, 1.2);
    prepareModel(models.police, 1.2);
    prepareModel(models.house, 3.8); // Scale up the house slightly so it borders closely on TILE_SIZE

    // Build Grid
    const collectibleGeo = new THREE.OctahedronGeometry(0.3);
    const collectibleMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 0.8 });

    for (let z = 0; z < gridHeight; z++) {
        for (let x = 0; x < gridWidth; x++) {
            const pos = getGridPos(x, z);
            
            if (mapGrid[z][x] === 1) {
                // Spawn House
                const house = models.house.clone();
                house.position.set(pos.x, 0, pos.z);
                // Randomly rotate house 0, 90, 180, or 270 degrees
                house.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
                scene.add(house);
                houses.push(house);
            } else {
                // Spawn Collectibles on roads
                // Don't spawn on exact center (where player will spawn)
                if (z !== 1 || x !== 1) {
                    const coin = new THREE.Mesh(collectibleGeo, collectibleMat);
                    coin.position.set(pos.x, 0.5, pos.z);
                    coin.castShadow = true;
                    scene.add(coin);
                    collectibles.push({ mesh: coin, baseY: 0.5, offset: Math.random() * 10 });
                    totalCollectibles++;
                }
            }
        }
    }

    document.getElementById('score').innerText = `0 / ${totalCollectibles}`;

    // Spawn Player
    playerModel = models.sedan.clone();
    const playerStart = getGridPos(1, 1);
    playerModel.position.set(playerStart.x, 0, playerStart.z);
    scene.add(playerModel);

    // Spawn Police
    policeModel = models.police.clone();
    const policeStart = getGridPos(gridWidth - 2, gridHeight - 2); // Bottom right road
    policeModel.position.set(policeStart.x, 0, policeStart.z);
    scene.add(policeModel);
}

// 6. Police AI
let policeTargetX = gridWidth - 2;
let policeTargetZ = gridHeight - 2;
let policeDir = { x: -1, z: 0 }; // Start moving left

function checkCollision(box, objectsList, shrinkAmount = 0.2) {
    for (const obj of objectsList) {
        houseBox.setFromObject(obj);
        houseBox.expandByScalar(-shrinkAmount); // Shrink bounding box to slide easier into corridors
        if (box.intersectsBox(houseBox)) return true;
    }
    return false;
}

function updatePoliceAI() {
    if (!policeModel) return;

    const currentPos = policeModel.position;
    const targetWorldPos = getGridPos(policeTargetX, policeTargetZ);

    const dx = targetWorldPos.x - currentPos.x;
    const dz = targetWorldPos.z - currentPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > POLICE_SPEED) {
        // Move towards target cell
        currentPos.x += (dx / dist) * POLICE_SPEED;
        currentPos.z += (dz / dist) * POLICE_SPEED;
        
        // Rotate car based on direction
        if (Math.abs(dx) > Math.abs(dz)) {
            policeModel.rotation.y = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
            policeModel.rotation.y = dz > 0 ? 0 : Math.PI;
        }
    } else {
        // Snap directly to the center of the valid tile
        currentPos.x = targetWorldPos.x;
        currentPos.z = targetWorldPos.z;

        // Choose next grid cell
        const dirs = [
            { x: 1, z: 0 }, { x: -1, z: 0 },
            { x: 0, z: 1 }, { x: 0, z: -1 }
        ];
        
        // Shuffle to make roaming random
        dirs.sort(() => Math.random() - 0.5);

        // Check mapGrid directly instead of bounding boxes
        let validDirs = dirs.filter(d => mapGrid[policeTargetZ + d.z][policeTargetX + d.x] === 0);

        // Prevent 180 backtrack if there's other options
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

// 7. Input
setupControls();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Main Loop
function animate() {
    if (isGameOver) return; // Stop if dead
    requestAnimationFrame(animate);

    // Player Movement
    const oldX = playerModel.position.x;
    const oldZ = playerModel.position.z;

    let isMoving = false;
    let targetRotation = playerModel.rotation.y;

    if (keys.w) { playerModel.position.z -= SPEED; targetRotation = Math.PI; isMoving = true; }
    if (keys.s) { playerModel.position.z += SPEED; targetRotation = 0; isMoving = true; }
    if (keys.a) { playerModel.position.x -= SPEED; targetRotation = Math.PI / 2; isMoving = true; }
    if (keys.d) { playerModel.position.x += SPEED; targetRotation = -Math.PI / 2; isMoving = true; }

    if (isMoving) {
        // Simple rotation interpolation (looks nicer if driving around corners)
        playerModel.rotation.y = targetRotation; 
    }

    // Wall Collision
    playerBox.setFromObject(playerModel);
    // Tweak bounding box sizing so the car fits down lanes easily
    // PlayerBox is standard, but houseBox shrinks slightly inside the check
    if (checkCollision(playerBox, houses, 0.4)) {
        playerModel.position.x = oldX;
        playerModel.position.z = oldZ;
    }

    // Police Logic
    updatePoliceAI();

    // Check Police Catching Player
    playerBox.setFromObject(playerModel); // Rebuild Box at final position
    policeBox.setFromObject(policeModel);
    policeBox.expandByScalar(-0.2); // Tweak exactly triggering
    if (playerBox.intersectsBox(policeBox)) {
        isGameOver = true;
        setTimeout(() => alert("Game Over! The police caught you! Refresh page to restart."), 50);
    }

    // Collectibles
    const time = Date.now() * 0.003;
    for (let i = collectibles.length - 1; i >= 0; i--) {
        const item = collectibles[i];
        
        item.mesh.rotation.y += 0.02;
        item.mesh.position.y = item.baseY + Math.sin(time + item.offset) * 0.1;

        if (playerModel.position.distanceTo(item.mesh.position) < 1.5) {
            scene.remove(item.mesh);
            collectibles.splice(i, 1);
            score++;
            document.getElementById('score').innerText = `${score} / ${totalCollectibles}`;

            if (score === totalCollectibles) {
                isGameOver = true;
                setTimeout(() => alert("You win! You successfully evaded the police and collected all gems!"), 50);
            }
        }
    }

    // Camera follow behavior
    camera.position.x += (playerModel.position.x - camera.position.x) * 0.1;
    camera.position.y += (playerModel.position.y + 16 - camera.position.y) * 0.1;
    camera.position.z += (playerModel.position.z + 14 - camera.position.z) * 0.1;
    camera.lookAt(playerModel.position);

    renderer.render(scene, camera);
}
