import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetCache } from './assetCache.js';

export class House {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.colliders = [];
    this.interactiveObjects = [];
    this.doors = [];
    this.loadedModels = {};

    // Door data
    this.bedroomDoor = null;
    this.doorMesh = null;
    this.doorHp = 150;
    this.doorMaxHp = 150;
    this.doorLevel = 1;
    this.doorArmor = 0;
    this.isDoorBroken = false;
    this.doorShaking = 0;

    // Bed data - Ground level (Y = 0)
    this.bedMesh = null;
    this.bedLevel = 1;
    this.bedPosition = new THREE.Vector3(16, 0, -6);

    // CCTV desk data - Ground level (Y = 0)
    this.cctvDeskMesh = null;
    this.cctvPosition = new THREE.Vector3(13, 0, -9.5);

    // Turret pad data - Ground level (Y = 0.04)
    this.turretPadPosition = new THREE.Vector3(14.5, 0.04, -3);

    // CCTV Cameras
    this.cctvCameraPositions = [
      {
        id: 1,
        name: 'CAM 01: OUTSIDE BEDROOM DOOR (HALLWAY)',
        pos: new THREE.Vector3(9.2, 2.5, -4.5),
        target: new THREE.Vector3(10.2, 1.3, -4.5),
        fov: 75
      },
      {
        id: 2,
        name: 'CAM 02: CENTRAL HALLWAY & BASEMENT',
        pos: new THREE.Vector3(0, 3.0, 9),
        target: new THREE.Vector3(0, 0.5, 14),
        fov: 80
      },
      {
        id: 3,
        name: 'CAM 03: LIVING ROOM & LIBRARY',
        pos: new THREE.Vector3(4.5, 2.8, 3.5),
        target: new THREE.Vector3(9.0, 1.0, 5.0),
        fov: 80
      },
      {
        id: 4,
        name: 'CAM 04: ATTIC & ENTRANCE',
        pos: new THREE.Vector3(0, 3.0, -9),
        target: new THREE.Vector3(0, 0.8, -15),
        fov: 80
      }
    ];
  }

  async loadAssets(onStatus) {
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
    const assetsToLoad = [
      { key: 'door', url: base + 'models/doorWood.glb' },
      { key: 'bed', url: base + 'models/bed.glb' },
      { key: 'tv', url: base + 'models/tv.glb' },
      { key: 'table', url: base + 'models/table.glb' },
      { key: 'chair', url: base + 'models/chair.glb' },
      { key: 'couch', url: base + 'models/couchBig.glb' },
      { key: 'bookshelf', url: base + 'models/bookshelf.glb' },
      { key: 'fridge', url: base + 'models/fridge.glb' },
      { key: 'lamp', url: base + 'models/lamp.glb' },
      { key: 'tableLamp', url: base + 'models/tableLamp.glb' },
      { key: 'plant', url: base + 'models/plant.glb' },
      { key: 'cabinet', url: base + 'models/cabinet.glb' }
    ];

    for (const item of assetsToLoad) {
      try {
        const buffer = await AssetCache.loadArrayBuffer(item.url, onStatus);
        const gltf = await new Promise((resolve, reject) => {
          this.loader.parse(buffer, '', resolve, reject);
        });
        this.loadedModels[item.key] = gltf.scene;
      } catch (err) {
        console.warn(`Could not load ${item.url}, using procedural fallback:`, err);
      }
    }
  }

  buildHouse() {
    // Optimized materials with lower roughness calculations for smooth FPS
    const floorWoodMat = new THREE.MeshLambertMaterial({ color: 0x423225 });
    const floorTileMat = new THREE.MeshLambertMaterial({ color: 0x2b3137 });
    const floorStoneMat = new THREE.MeshLambertMaterial({ color: 0x1f1f22 });
    const wallPlasterMat = new THREE.MeshLambertMaterial({ color: 0x524c44 });
    const wallBedroomMat = new THREE.MeshLambertMaterial({ color: 0x38413f });
    const ceilingMat = new THREE.MeshLambertMaterial({ color: 0x262422 });

    const houseGroup = new THREE.Group();

    // 1. HALLWAY: Central Corridor
    this.createRoom({
      group: houseGroup,
      x: 0, z: 0,
      width: 6, depth: 24, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [
        { wall: 'north', offset: 0, width: 2.4 }, // to Attic
        { wall: 'south', offset: 0, width: 2.6 }, // to Basement
        { wall: 'west', offset: 2, width: 2.4 },  // to Kitchen
        { wall: 'east', offset: 4, width: 2.8 },  // to Living Room
        { wall: 'east', offset: -6, width: 2.4 }  // to Library
      ]
    });

    // 2. ATTIC: North of Hallway
    this.createRoom({
      group: houseGroup,
      x: 0, z: -17,
      width: 8, depth: 10, height: 3.2,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [{ wall: 'south', offset: 0, width: 2.4 }]
    });

    // 3. BASEMENT: South of Hallway (Monster Spawn)
    this.createRoom({
      group: houseGroup,
      x: 0, z: 17,
      width: 8, depth: 10, height: 3.5,
      floorMat: floorStoneMat,
      wallMat: new THREE.MeshLambertMaterial({ color: 0x242426 }),
      ceilingMat: ceilingMat,
      openings: [{ wall: 'north', offset: 0, width: 2.6 }]
    });

    // 4. KITCHEN: West of Hallway
    this.createRoom({
      group: houseGroup,
      x: -7, z: 3,
      width: 8, depth: 8, height: 3.5,
      floorMat: floorTileMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [
        { wall: 'east', offset: 0, width: 2.4 },
        { wall: 'west', offset: 0, width: 2.0 }
      ]
    });

    // 5. PANTRY: West of Kitchen
    this.createRoom({
      group: houseGroup,
      x: -14.5, z: 3,
      width: 7, depth: 8, height: 3.2,
      floorMat: floorTileMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [{ wall: 'east', offset: 0, width: 2.0 }]
    });

    // 6. LIVING ROOM: East of Hallway
    this.createRoom({
      group: houseGroup,
      x: 7.5, z: 4,
      width: 9, depth: 8, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [
        { wall: 'west', offset: 0, width: 2.8 },
        { wall: 'north', offset: 0, width: 2.4 }
      ]
    });

    // 7. LIBRARY: North of Living Room
    this.createRoom({
      group: houseGroup,
      x: 6.5, z: -5,
      width: 7, depth: 10, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      openings: [
        { wall: 'west', offset: -1, width: 2.4 },
        { wall: 'south', offset: 1, width: 2.4 },
        { wall: 'east', offset: 0.5, width: 2.2 }
      ]
    });

    // 8. BEDROOM: East of Library (Player's Sanctuary)
    this.createRoom({
      group: houseGroup,
      x: 16, z: -5.5,
      width: 12, depth: 11, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallBedroomMat,
      ceilingMat: ceilingMat,
      openings: [{ wall: 'west', offset: 1.0, width: 2.2 }]
    });

    this.scene.add(houseGroup);

    // Setup Bedroom Door
    this.setupBedroomDoor();

    // Populate Props with Ground-Alignment
    this.populateProps();

    // Setup Optimized Lighting
    this.setupHouseLighting();
  }

  setupBedroomDoor() {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(10.0, 0, -4.5);

    // Frame
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1f160f });
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 0.2), frameMat);
    frameLeft.position.set(0, 1.35, -1.05);
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 0.2), frameMat);
    frameRight.position.set(0, 1.35, 1.05);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 2.3), frameMat);
    frameTop.position.set(0, 2.7, 0);

    doorGroup.add(frameLeft);
    doorGroup.add(frameRight);
    doorGroup.add(frameTop);

    // Door Slab with Ground Alignment
    let doorMesh;
    if (this.loadedModels.door) {
      const grounded = groundAndScale(this.loadedModels.door.clone(), 2.6);
      doorMesh = grounded;
      doorMesh.rotation.y = Math.PI / 2;
    } else {
      const doorGeo = new THREE.BoxGeometry(0.12, 2.6, 2.0);
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x6e4321 });
      doorMesh = new THREE.Mesh(doorGeo, woodMat);
      doorMesh.position.set(0, 1.3, 0);
    }

    doorGroup.add(doorMesh);
    this.scene.add(doorGroup);

    this.bedroomDoor = doorGroup;
    this.doorMesh = doorMesh;

    this.createDoorHealthSprite(doorGroup);

    this.interactiveObjects.push({
      name: 'Door',
      position: new THREE.Vector3(11.2, 1.3, -4.5),
      radius: 2.5,
      prompt: '[E] Inspect & Upgrade Door',
      action: 'door'
    });

    const doorBox = new THREE.Box3(
      new THREE.Vector3(9.8, 0, -5.6),
      new THREE.Vector3(10.2, 3.0, -3.4)
    );
    this.doorCollider = doorBox;
    this.colliders.push(doorBox);
  }

  createDoorHealthSprite(doorGroup) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.set(0.1, 2.9, 0);

    doorGroup.add(sprite);

    this.doorSpriteCanvas = canvas;
    this.doorSpriteCtx = ctx;
    this.doorSpriteTexture = texture;
    this.updateDoorHealthSprite();
  }

  updateDoorHealthSprite() {
    if (!this.doorSpriteCtx) return;
    const ctx = this.doorSpriteCtx;
    ctx.clearRect(0, 0, 256, 64);

    ctx.fillStyle = 'rgba(10, 12, 18, 0.88)';
    ctx.roundRect ? ctx.roundRect(8, 8, 240, 48, 8) : ctx.fillRect(8, 8, 240, 48);
    ctx.fill();

    ctx.strokeStyle = '#445566';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`LVL ${this.doorLevel} DOOR`, 20, 27);

    const pct = Math.max(0, Math.min(1, this.doorHp / this.doorMaxHp));
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
    ctx.fillText(`${Math.ceil(this.doorHp)}/${this.doorMaxHp}`, 165, 27);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 34, 216, 14);

    ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#dc2626';
    ctx.fillRect(20, 34, 216 * pct, 14);

    this.doorSpriteTexture.needsUpdate = true;
  }

  upgradeDoor() {
    this.doorLevel += 1;
    const upgrades = [
      { name: 'Reinforced Wood', hp: 300, armor: 2, color: 0x5a3d28 },
      { name: 'Iron-Clad Plating', hp: 650, armor: 5, color: 0x475569 },
      { name: 'Steel Blast Vault', hp: 1400, armor: 10, color: 0x334155 },
      { name: 'Titanium Cyber Shield', hp: 3000, armor: 20, color: 0x0284c7 }
    ];

    const up = upgrades[Math.min(upgrades.length - 1, this.doorLevel - 2)];
    if (up) {
      this.doorMaxHp = up.hp;
      this.doorHp = up.hp;
      this.doorArmor = up.armor;
      this.isDoorBroken = false;

      if (this.doorMesh) {
        this.doorMesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.setHex(up.color);
          }
        });
      }
    }
    this.updateDoorHealthSprite();
  }

  repairDoor(amount = 50) {
    if (this.isDoorBroken) {
      this.isDoorBroken = false;
      this.doorHp = Math.min(this.doorMaxHp, amount);
    } else {
      this.doorHp = Math.min(this.doorMaxHp, this.doorHp + amount);
    }
    this.updateDoorHealthSprite();
  }

  damageDoor(amount) {
    if (this.isDoorBroken) return;
    const effectiveDamage = Math.max(3, amount - this.doorArmor);
    this.doorHp = Math.max(0, this.doorHp - effectiveDamage);
    this.doorShaking = 0.35;
    this.updateDoorHealthSprite();

    if (this.doorHp <= 0) {
      this.breakDoor();
    }
  }

  breakDoor() {
    this.isDoorBroken = true;
    this.doorHp = 0;
    this.updateDoorHealthSprite();
    if (this.doorMesh) {
      this.doorMesh.rotation.y = Math.PI * 0.9;
      this.doorMesh.position.x = 0.8;
    }
    const idx = this.colliders.indexOf(this.doorCollider);
    if (idx !== -1) {
      this.colliders.splice(idx, 1);
    }
  }

  populateProps() {
    const propsGroup = new THREE.Group();

    // 1. BED in Bedroom (Sanctuary) - Grounded at Y = 0
    if (this.loadedModels.bed) {
      const bed = groundAndScale(this.loadedModels.bed.clone(), 1.3);
      bed.position.copy(this.bedPosition);
      bed.rotation.y = -Math.PI / 2;
      propsGroup.add(bed);
      this.bedMesh = bed;
    } else {
      const bedGeo = new THREE.BoxGeometry(2.2, 0.7, 3.0);
      const bedMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
      const bed = new THREE.Mesh(bedGeo, bedMat);
      bed.position.set(this.bedPosition.x, 0.35, this.bedPosition.z);
      propsGroup.add(bed);
      this.bedMesh = bed;
    }

    this.interactiveObjects.push({
      name: 'Bed',
      position: this.bedPosition.clone(),
      radius: 3.2,
      prompt: '[E] Sleep in Bed (+XP & Gold)',
      action: 'sleep'
    });

    // 2. CCTV MONITOR DESK in Bedroom - Grounded at Y = 0
    const deskGroup = new THREE.Group();
    deskGroup.position.copy(this.cctvPosition);

    let deskSurfaceY = 0.75;
    if (this.loadedModels.table) {
      const table = groundAndScale(this.loadedModels.table.clone(), 0.8);
      deskGroup.add(table);
      deskSurfaceY = 0.8;
    } else {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 1.0), new THREE.MeshLambertMaterial({ color: 0x332211 }));
      t.position.y = 0.375;
      deskGroup.add(t);
      deskSurfaceY = 0.75;
    }

    // Monitor sitting directly on the desk top facing South (+Z) towards player/chair
    if (this.loadedModels.tv) {
      const tv = groundAndScale(this.loadedModels.tv.clone(), 0.65);
      tv.position.set(0, deskSurfaceY, 0);
      tv.rotation.y = 0; // Screen faces +Z towards chair & player!
      deskGroup.add(tv);
    }

    // Glowing CCTV terminal screen facing +Z towards player
    const screenGeo = new THREE.PlaneGeometry(0.44, 0.3);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, deskSurfaceY + 0.28, 0.12);
    screen.rotation.y = 0;
    deskGroup.add(screen);

    // Chair placed in front of desk facing North (-Z) towards desk & monitor
    if (this.loadedModels.chair) {
      const chair = groundAndScale(this.loadedModels.chair.clone(), 0.88);
      chair.position.set(0, 0, 0.75);
      chair.rotation.y = Math.PI; // Faces desk and monitor!
      deskGroup.add(chair);
    }

    propsGroup.add(deskGroup);
    this.cctvDeskMesh = deskGroup;

    this.interactiveObjects.push({
      name: 'CCTV Console',
      position: this.cctvPosition.clone().add(new THREE.Vector3(0, 0, 0.8)),
      radius: 2.8,
      prompt: '[E] Access CCTV Security Feed',
      action: 'cctv'
    });

    // 3. DEFENSE TURRET PAD
    const padGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 16);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const turretPad = new THREE.Mesh(padGeo, padMat);
    turretPad.position.copy(this.turretPadPosition);
    propsGroup.add(turretPad);

    this.interactiveObjects.push({
      name: 'Defense Pad',
      position: this.turretPadPosition.clone(),
      radius: 2.2,
      prompt: '[E] Build / Upgrade Defense Turret',
      action: 'turret'
    });

    // 4. LIVING ROOM PROPS (Grounded on floor)
    if (this.loadedModels.couch) {
      const couch = groundAndScale(this.loadedModels.couch.clone(), 1.1);
      couch.position.set(7.5, 0, 6.0);
      couch.rotation.y = Math.PI;
      propsGroup.add(couch);
    }
    if (this.loadedModels.table) {
      const coffeeTable = groundAndScale(this.loadedModels.table.clone(), 0.5);
      coffeeTable.position.set(7.5, 0, 4.0);
      propsGroup.add(coffeeTable);
    }
    if (this.loadedModels.plant) {
      const plant = groundAndScale(this.loadedModels.plant.clone(), 1.2);
      plant.position.set(11.0, 0, 7.0);
      propsGroup.add(plant);
    }

    // 5. LIBRARY PROPS (Grounded on floor)
    if (this.loadedModels.bookshelf) {
      for (let z = -9; z <= -3; z += 3) {
        const shelf = groundAndScale(this.loadedModels.bookshelf.clone(), 2.8);
        shelf.position.set(3.5, 0, z);
        shelf.rotation.y = Math.PI / 2;
        propsGroup.add(shelf);
      }
    }

    // 6. KITCHEN PROPS (Grounded on floor)
    if (this.loadedModels.fridge) {
      const fridge = groundAndScale(this.loadedModels.fridge.clone(), 2.0);
      fridge.position.set(-10.2, 0, 6.2);
      propsGroup.add(fridge);
    }
    if (this.loadedModels.cabinet) {
      const cab = groundAndScale(this.loadedModels.cabinet.clone(), 1.0);
      cab.position.set(-6.5, 0, 6.2);
      propsGroup.add(cab);
    }

    // 7. BASEMENT STAIRS
    const stairsGroup = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const stepGeo = new THREE.BoxGeometry(2.6, 0.25, 0.8);
      const stepMat = new THREE.MeshLambertMaterial({ color: 0x18181b });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, -i * 0.25, 14 + i * 0.8);
      stairsGroup.add(step);
    }
    propsGroup.add(stairsGroup);

    this.scene.add(propsGroup);
  }

  setupHouseLighting() {
    // Ambient moonlight
    const ambientLight = new THREE.AmbientLight(0x232e3d, 0.65);
    this.scene.add(ambientLight);

    // Directional moonbeam (main lighting)
    const moonLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    moonLight.position.set(-10, 20, -10);
    this.scene.add(moonLight);

    // Hallway Light
    const hallLight = new THREE.PointLight(0xffedd5, 0.85, 14, 1.8);
    hallLight.position.set(0, 3.2, 0);
    this.scene.add(hallLight);
    this.hallLight = hallLight;

    // Bedroom Light
    const bedLamp = new THREE.PointLight(0xfef08a, 1.0, 10, 1.6);
    bedLamp.position.set(13, 2.5, -9.5);
    this.scene.add(bedLamp);

    // Basement Crimson Void
    const basementLight = new THREE.PointLight(0xef4444, 1.6, 16, 1.2);
    basementLight.position.set(0, 0.8, 19);
    this.scene.add(basementLight);
    this.basementLight = basementLight;
  }

  createRoom({ group, x, z, width, depth, height, floorMat, wallMat, ceilingMat, openings = [] }) {
    const halfW = width / 2;
    const halfD = depth / 2;
    const halfH = height / 2;
    const wallThick = 0.3;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0, z);
    group.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(width, depth);
    const ceiling = new THREE.Mesh(ceilGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(x, height, z);
    group.add(ceiling);

    const walls = [
      { side: 'north', cx: x, cz: z - halfD, length: width, isX: true },
      { side: 'south', cx: x, cz: z + halfD, length: width, isX: true },
      { side: 'east',  cx: x + halfW, cz: z, length: depth, isX: false },
      { side: 'west',  cx: x - halfW, cz: z, length: depth, isX: false }
    ];

    walls.forEach(w => {
      const wallOpenings = openings.filter(o => o.wall === w.side);
      if (wallOpenings.length === 0) {
        const geo = new THREE.BoxGeometry(w.isX ? width : wallThick, height, w.isX ? wallThick : depth);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(w.cx, halfH, w.cz);
        group.add(mesh);
        this.colliders.push(new THREE.Box3().setFromObject(mesh));
      } else {
        const op = wallOpenings[0];
        const segLen = (w.length - op.width) / 2;

        if (w.isX) {
          const leftLen = segLen + op.offset;
          if (leftLen > 0.2) {
            const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(leftLen, height, wallThick), wallMat);
            leftMesh.position.set(w.cx - width / 2 + leftLen / 2, halfH, w.cz);
            group.add(leftMesh);
            this.colliders.push(new THREE.Box3().setFromObject(leftMesh));
          }
          const rightLen = segLen - op.offset;
          if (rightLen > 0.2) {
            const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(rightLen, height, wallThick), wallMat);
            rightMesh.position.set(w.cx + width / 2 - rightLen / 2, halfH, w.cz);
            group.add(rightMesh);
            this.colliders.push(new THREE.Box3().setFromObject(rightMesh));
          }
          const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(op.width, height - 2.6, wallThick), wallMat);
          headerMesh.position.set(w.cx + op.offset, 2.6 + (height - 2.6) / 2, w.cz);
          group.add(headerMesh);
        } else {
          const topLen = segLen + op.offset;
          if (topLen > 0.2) {
            const topMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, topLen), wallMat);
            topMesh.position.set(w.cx, halfH, w.cz - depth / 2 + topLen / 2);
            group.add(topMesh);
            this.colliders.push(new THREE.Box3().setFromObject(topMesh));
          }
          const botLen = segLen - op.offset;
          if (botLen > 0.2) {
            const botMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, botLen), wallMat);
            botMesh.position.set(w.cx, halfH, w.cz + depth / 2 - botLen / 2);
            group.add(botMesh);
            this.colliders.push(new THREE.Box3().setFromObject(botMesh));
          }
          const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height - 2.6, op.width), wallMat);
          headerMesh.position.set(w.cx, 2.6 + (height - 2.6) / 2, w.cz + op.offset);
          group.add(headerMesh);
        }
      }
    });
  }

  update(delta) {
    if (this.doorShaking > 0 && this.doorMesh && !this.isDoorBroken) {
      this.doorShaking -= delta;
      const shakeAmt = this.doorShaking * 0.08;
      this.doorMesh.position.x = (Math.random() - 0.5) * shakeAmt;
      this.doorMesh.position.z = (Math.random() - 0.5) * shakeAmt;
      if (this.doorShaking <= 0) {
        this.doorMesh.position.set(0, 0, 0);
      }
    }

    if (this.hallLight && Math.random() < 0.04) {
      this.hallLight.intensity = 0.2 + Math.random() * 0.7;
    }

    if (this.basementLight) {
      this.basementLight.intensity = 1.3 + Math.sin(Date.now() * 0.003) * 0.4;
    }
  }
}

// Universal Ground & Center helper:
// Guarantees any 3D model sits EXACTLY at Y = 0 on the floor, horizontally centered, scaled to targetHeight!
export function groundAndScale(object, targetHeight) {
  object.scale.set(1, 1, 1);
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const currentH = size.y || 1;
  const scale = targetHeight / currentH;
  object.scale.set(scale, scale, scale);
  object.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);

  const container = new THREE.Group();
  // Offset so lowest vertex is at y = 0, X and Z are centered
  object.position.set(-center.x, -scaledBox.min.y, -center.z);
  container.add(object);

  return container;
}
