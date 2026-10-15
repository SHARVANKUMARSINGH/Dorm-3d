import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class House {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.colliders = []; // Bounding boxes for player & monster collision
    this.interactiveObjects = []; // Objects with proximity prompts
    this.doors = [];
    this.loadedModels = {};

    // Door data
    this.bedroomDoor = null;
    this.doorMesh = null;
    this.doorFrame = null;
    this.doorHp = 150;
    this.doorMaxHp = 150;
    this.doorLevel = 1;
    this.doorArmor = 0;
    this.isDoorBroken = false;
    this.doorShaking = 0;

    // Bed data
    this.bedMesh = null;
    this.bedLevel = 1;
    this.bedPosition = new THREE.Vector3(16, 0.6, -6);

    // CCTV desk data
    this.cctvDeskMesh = null;
    this.cctvPosition = new THREE.Vector3(13, 0.8, -10);

    // Turret pad data
    this.turretPadPosition = new THREE.Vector3(14.5, 0.05, -3);

    // Cameras positions for CCTV system
    this.cctvCameraPositions = [
      {
        id: 1,
        name: 'CAM 01: OUTSIDE BEDROOM DOOR (HALLWAY)',
        pos: new THREE.Vector3(9.2, 2.7, -4.5),
        target: new THREE.Vector3(10.2, 1.4, -4.5),
        fov: 75
      },
      {
        id: 2,
        name: 'CAM 02: CENTRAL HALLWAY & BASEMENT',
        pos: new THREE.Vector3(0, 3.2, 9),
        target: new THREE.Vector3(0, 0.5, 14),
        fov: 80
      },
      {
        id: 3,
        name: 'CAM 03: LIVING ROOM & LIBRARY',
        pos: new THREE.Vector3(4.5, 3.0, 3.5),
        target: new THREE.Vector3(9.0, 1.0, 5.0),
        fov: 80
      },
      {
        id: 4,
        name: 'CAM 04: ATTIC & ENTRANCE',
        pos: new THREE.Vector3(0, 3.2, -9),
        target: new THREE.Vector3(0, 0.8, -15),
        fov: 80
      }
    ];
  }

  async loadAssets() {
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
        const gltf = await this.loadGLTF(item.url);
        this.loadedModels[item.key] = gltf.scene;
      } catch (err) {
        console.warn(`Could not load ${item.url}, using procedural fallback:`, err);
      }
    }
  }

  loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }

  buildHouse() {
    // Materials
    const floorWoodMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.7,
      metalness: 0.1
    });

    const floorTileMat = new THREE.MeshStandardMaterial({
      color: 0x2e353b,
      roughness: 0.5,
      metalness: 0.2
    });

    const floorStoneMat = new THREE.MeshStandardMaterial({
      color: 0x222225,
      roughness: 0.9,
      metalness: 0.05
    });

    const wallPlasterMat = new THREE.MeshStandardMaterial({
      color: 0x5a544c,
      roughness: 0.85
    });

    const wallBedroomMat = new THREE.MeshStandardMaterial({
      color: 0x3d4745,
      roughness: 0.8
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x2b2927,
      roughness: 0.9
    });

    const houseGroup = new THREE.Group();

    // 1. HALLWAY: Central Corridor (Z: -12 to +12, X: -3 to +3)
    this.createRoom({
      group: houseGroup,
      x: 0, z: 0,
      width: 6, depth: 24, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Hallway',
      openings: [
        { wall: 'north', offset: 0, width: 2.4 }, // to Attic
        { wall: 'south', offset: 0, width: 2.6 }, // to Basement
        { wall: 'west', offset: 2, width: 2.4 },  // to Kitchen
        { wall: 'east', offset: 4, width: 2.8 },  // to Living Room
        { wall: 'east', offset: -6, width: 2.4 }  // to Library
      ]
    });

    // 2. ATTIC: North of Hallway (Z: -12 to -22, X: -4 to +4)
    this.createRoom({
      group: houseGroup,
      x: 0, z: -17,
      width: 8, depth: 10, height: 3.2,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Attic',
      openings: [
        { wall: 'south', offset: 0, width: 2.4 }
      ]
    });

    // 3. BASEMENT: South of Hallway (Z: +12 to +22, X: -4 to +4) - where monster spawns
    this.createRoom({
      group: houseGroup,
      x: 0, z: 17,
      width: 8, depth: 10, height: 3.5,
      floorMat: floorStoneMat,
      wallMat: wallStoneMatProcedural(),
      ceilingMat: ceilingMat,
      name: 'Basement',
      openings: [
        { wall: 'north', offset: 0, width: 2.6 }
      ]
    });

    // 4. KITCHEN: West of Hallway (X: -3 to -11, Z: -1 to +7)
    this.createRoom({
      group: houseGroup,
      x: -7, z: 3,
      width: 8, depth: 8, height: 3.5,
      floorMat: floorTileMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Kitchen',
      openings: [
        { wall: 'east', offset: 0, width: 2.4 },
        { wall: 'west', offset: 0, width: 2.0 } // to Pantry
      ]
    });

    // 5. PANTRY: West of Kitchen (X: -11 to -18, Z: -1 to +7)
    this.createRoom({
      group: houseGroup,
      x: -14.5, z: 3,
      width: 7, depth: 8, height: 3.2,
      floorMat: floorTileMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Pantry',
      openings: [
        { wall: 'east', offset: 0, width: 2.0 }
      ]
    });

    // 6. LIVING ROOM: East of Hallway (X: +3 to +12, Z: 0 to +8)
    this.createRoom({
      group: houseGroup,
      x: 7.5, z: 4,
      width: 9, depth: 8, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Living Room',
      openings: [
        { wall: 'west', offset: 0, width: 2.8 },
        { wall: 'north', offset: 0, width: 2.4 } // to Library
      ]
    });

    // 7. LIBRARY: North of Living Room (X: +3 to +10, Z: -10 to 0)
    this.createRoom({
      group: houseGroup,
      x: 6.5, z: -5,
      width: 7, depth: 10, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallPlasterMat,
      ceilingMat: ceilingMat,
      name: 'Library',
      openings: [
        { wall: 'west', offset: -1, width: 2.4 }, // to Hallway
        { wall: 'south', offset: 1, width: 2.4 }, // to Living Room
        { wall: 'east', offset: 0.5, width: 2.2 } // Doorway into Bedroom!
      ]
    });

    // 8. BEDROOM: East of Library (X: +10 to +22, Z: -11 to 0) - PLAYER FORTIFIED ROOM!
    this.createRoom({
      group: houseGroup,
      x: 16, z: -5.5,
      width: 12, depth: 11, height: 3.5,
      floorMat: floorWoodMat,
      wallMat: wallBedroomMat,
      ceilingMat: ceilingMat,
      name: 'Bedroom',
      openings: [
        { wall: 'west', offset: 1.0, width: 2.2 } // The Main Fortified Door
      ]
    });

    this.scene.add(houseGroup);

    // Setup the Fortified Bedroom Door
    this.setupBedroomDoor();

    // Populate rooms with furniture & props
    this.populateProps();

    // Setup Lights
    this.setupHouseLighting();
  }

  // Setup the Fortified Bedroom Door
  setupBedroomDoor() {
    const doorGroup = new THREE.Group();
    // Doorway is on the west wall of Bedroom at X = 10, Z = -4.5
    doorGroup.position.set(10.0, 0, -4.5);

    // Frame
    const frameGeo = new THREE.BoxGeometry(0.3, 2.7, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x221811, roughness: 0.8 });
    const frameLeft = new THREE.Mesh(frameGeo, frameMat);
    frameLeft.position.set(0, 1.35, -1.05);
    const frameRight = new THREE.Mesh(frameGeo, frameMat);
    frameRight.position.set(0, 1.35, 1.05);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 2.3), frameMat);
    frameTop.position.set(0, 2.7, 0);

    doorGroup.add(frameLeft);
    doorGroup.add(frameRight);
    doorGroup.add(frameTop);

    // Door Slab
    let doorMesh;
    if (this.loadedModels.door) {
      doorMesh = this.loadedModels.door.clone();
      // Fit to door frame dimensions
      const box = new THREE.Box3().setFromObject(doorMesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetHeight = 2.6;
      const scale = targetHeight / (size.y || 1);
      doorMesh.scale.set(scale, scale, scale);
      doorMesh.position.set(0, 0, 0);
      doorMesh.rotation.y = Math.PI / 2;
    } else {
      const doorGeo = new THREE.BoxGeometry(0.12, 2.6, 2.0);
      const woodMat = new THREE.MeshStandardMaterial({
        color: 0x6e4321,
        roughness: 0.6,
        metalness: 0.1
      });
      doorMesh = new THREE.Mesh(doorGeo, woodMat);
      doorMesh.position.set(0, 1.3, 0);
    }

    doorGroup.add(doorMesh);
    this.scene.add(doorGroup);

    this.bedroomDoor = doorGroup;
    this.doorMesh = doorMesh;

    // Add floating 3D health bar canvas sprite over the door
    this.createDoorHealthSprite(doorGroup);

    // Interactive prompt trigger for door
    this.interactiveObjects.push({
      name: 'Door',
      position: new THREE.Vector3(11.2, 1.3, -4.5),
      radius: 2.5,
      prompt: '[E] Inspect & Upgrade Door',
      action: 'door'
    });

    // Add door collider box
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

    // Background pill
    ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    ctx.roundRect ? ctx.roundRect(8, 8, 240, 48, 8) : ctx.fillRect(8, 8, 240, 48);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#445566';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Door Title & Level
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`LVL ${this.doorLevel} DOOR`, 20, 27);

    // Health percentage
    const pct = Math.max(0, Math.min(1, this.doorHp / this.doorMaxHp));
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
    ctx.fillText(`${Math.ceil(this.doorHp)}/${this.doorMaxHp}`, 165, 27);

    // Health bar background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 34, 216, 14);

    // Health bar fill
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

      // Update material color of door
      if (this.doorMesh) {
        this.doorMesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.setHex(up.color);
            if (this.doorLevel >= 3) {
              child.material.metalness = 0.7;
              child.material.roughness = 0.3;
            }
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
    this.doorShaking = 0.35; // Trigger door vibration
    this.updateDoorHealthSprite();

    if (this.doorHp <= 0) {
      this.breakDoor();
    }
  }

  breakDoor() {
    this.isDoorBroken = true;
    this.doorHp = 0;
    this.updateDoorHealthSprite();
    // Rotate door open or push outward
    if (this.doorMesh) {
      this.doorMesh.rotation.y = Math.PI * 0.9;
      this.doorMesh.position.x = 0.8;
    }
    // Remove collider so monster and player can walk through
    const idx = this.colliders.indexOf(this.doorCollider);
    if (idx !== -1) {
      this.colliders.splice(idx, 1);
    }
  }

  // Populate props in rooms
  populateProps() {
    const propsGroup = new THREE.Group();

    // 1. BED in Bedroom (Sanctuary)
    if (this.loadedModels.bed) {
      const bed = this.loadedModels.bed.clone();
      fitModel(bed, 1.4); // Target height ~1.4m
      bed.position.copy(this.bedPosition);
      bed.position.y = 0;
      bed.rotation.y = -Math.PI / 2;
      propsGroup.add(bed);
      this.bedMesh = bed;
    } else {
      // Procedural bed
      const bedGeo = new THREE.BoxGeometry(2.2, 0.7, 3.0);
      const bedMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.7 });
      const bed = new THREE.Mesh(bedGeo, bedMat);
      bed.position.copy(this.bedPosition);
      propsGroup.add(bed);
      this.bedMesh = bed;
    }

    // Add Bed proximity prompt
    this.interactiveObjects.push({
      name: 'Bed',
      position: this.bedPosition.clone(),
      radius: 3.2,
      prompt: '[E] Sleep in Bed (+XP & Gold)',
      action: 'sleep'
    });

    // 2. CCTV MONITOR DESK in Bedroom
    const deskGroup = new THREE.Group();
    deskGroup.position.copy(this.cctvPosition);

    if (this.loadedModels.table) {
      const table = this.loadedModels.table.clone();
      fitModel(table, 0.85);
      deskGroup.add(table);
    } else {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.0), new THREE.MeshStandardMaterial({ color: 0x332211 }));
      t.position.y = 0.4;
      deskGroup.add(t);
    }

    // Computer / Monitor on table
    if (this.loadedModels.tv) {
      const tv = this.loadedModels.tv.clone();
      fitModel(tv, 0.65);
      tv.position.set(0, 0.85, 0);
      tv.rotation.y = Math.PI;
      deskGroup.add(tv);
    }

    // Glowing green CCTV screen mesh
    const screenGeo = new THREE.PlaneGeometry(0.5, 0.35);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.18, 0.22);
    deskGroup.add(screen);

    // Chair
    if (this.loadedModels.chair) {
      const chair = this.loadedModels.chair.clone();
      fitModel(chair, 0.9);
      chair.position.set(0, 0, 0.8);
      deskGroup.add(chair);
    }

    propsGroup.add(deskGroup);
    this.cctvDeskMesh = deskGroup;

    // Add CCTV proximity prompt
    this.interactiveObjects.push({
      name: 'CCTV Console',
      position: this.cctvPosition.clone().add(new THREE.Vector3(0, 0, 0.8)),
      radius: 2.8,
      prompt: '[E] Access CCTV Security Feed',
      action: 'cctv'
    });

    // 3. DEFENSE TURRET PAD in Bedroom
    const padGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 16);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.6,
      roughness: 0.3,
      emissive: 0x0369a1,
      emissiveIntensity: 0.3
    });
    const turretPad = new THREE.Mesh(padGeo, padMat);
    turretPad.position.copy(this.turretPadPosition);
    propsGroup.add(turretPad);

    // Turret Pad prompt
    this.interactiveObjects.push({
      name: 'Defense Pad',
      position: this.turretPadPosition.clone(),
      radius: 2.2,
      prompt: '[E] Build / Upgrade Defense Turret',
      action: 'turret'
    });

    // 4. LIVING ROOM PROPS (Couch, Table, Bookshelf, Plant)
    if (this.loadedModels.couch) {
      const couch = this.loadedModels.couch.clone();
      fitModel(couch, 1.1);
      couch.position.set(7.5, 0, 6.0);
      couch.rotation.y = Math.PI;
      propsGroup.add(couch);
    }
    if (this.loadedModels.table) {
      const coffeeTable = this.loadedModels.table.clone();
      fitModel(coffeeTable, 0.5);
      coffeeTable.position.set(7.5, 0, 4.0);
      propsGroup.add(coffeeTable);
    }
    if (this.loadedModels.plant) {
      const plant = this.loadedModels.plant.clone();
      fitModel(plant, 1.2);
      plant.position.set(11.0, 0, 7.0);
      propsGroup.add(plant);
    }

    // 5. LIBRARY PROPS (Bookshelves, Study Table)
    if (this.loadedModels.bookshelf) {
      for (let z = -9; z <= -3; z += 3) {
        const shelf = this.loadedModels.bookshelf.clone();
        fitModel(shelf, 2.8);
        shelf.position.set(3.5, 0, z);
        shelf.rotation.y = Math.PI / 2;
        propsGroup.add(shelf);
      }
    }

    // 6. KITCHEN PROPS (Fridge, Counter Cabinet)
    if (this.loadedModels.fridge) {
      const fridge = this.loadedModels.fridge.clone();
      fitModel(fridge, 2.0);
      fridge.position.set(-10.2, 0, 6.2);
      propsGroup.add(fridge);
    }
    if (this.loadedModels.cabinet) {
      const cab = this.loadedModels.cabinet.clone();
      fitModel(cab, 1.0);
      cab.position.set(-6.5, 0, 6.2);
      propsGroup.add(cab);
    }

    // 7. BASEMENT OMINOUS PROPS (Stairs leading down, glowing red void)
    const stairsGroup = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const stepGeo = new THREE.BoxGeometry(2.6, 0.25, 0.8);
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, -i * 0.25, 14 + i * 0.8);
      stairsGroup.add(step);
    }
    propsGroup.add(stairsGroup);

    this.scene.add(propsGroup);
  }

  // Setup atmospheric lighting
  setupHouseLighting() {
    // Ambient moonlight
    const ambientLight = new THREE.AmbientLight(0x1a2332, 0.4);
    this.scene.add(ambientLight);

    // Directional moonbeam (through skylights/hallway)
    const moonLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    moonLight.position.set(-10, 20, -10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    this.scene.add(moonLight);

    // Flickering Hallway Lamp (point light)
    const hallLight = new THREE.PointLight(0xffedd5, 0.8, 14, 1.8);
    hallLight.position.set(0, 3.2, 0);
    this.scene.add(hallLight);
    this.hallLight = hallLight;

    // Cozy warm bedroom lamp
    const bedLamp = new THREE.PointLight(0xfef08a, 1.1, 10, 1.6);
    bedLamp.position.set(13, 2.5, -9.5);
    this.scene.add(bedLamp);

    // Living room warm light
    const livingLight = new THREE.PointLight(0xfde68a, 0.7, 12, 1.8);
    livingLight.position.set(7.5, 3.0, 4);
    this.scene.add(livingLight);

    // Basement eerie crimson glow (monster spawn point!)
    const basementLight = new THREE.PointLight(0xef4444, 1.6, 16, 1.2);
    basementLight.position.set(0, 0.8, 19);
    this.scene.add(basementLight);
    this.basementLight = basementLight;

    // Outside Bedroom Door Security Light
    const doorLight = new THREE.PointLight(0x38bdf8, 0.6, 8, 2.0);
    doorLight.position.set(9.0, 2.8, -4.5);
    this.scene.add(doorLight);
    this.doorLight = doorLight;
  }

  // Helper to create a room with 4 walls, floor, ceiling, and doorway openings
  createRoom({ group, x, z, width, depth, height, floorMat, wallMat, ceilingMat, name, openings = [] }) {
    const halfW = width / 2;
    const halfD = depth / 2;
    const halfH = height / 2;
    const wallThick = 0.3;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0, z);
    floor.receiveShadow = true;
    group.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(width, depth);
    const ceiling = new THREE.Mesh(ceilGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(x, height, z);
    group.add(ceiling);

    // Walls with openings
    const walls = [
      { side: 'north', cx: x, cz: z - halfD, length: width, isX: true, rot: 0 },
      { side: 'south', cx: x, cz: z + halfD, length: width, isX: true, rot: 0 },
      { side: 'east',  cx: x + halfW, cz: z, length: depth, isX: false, rot: Math.PI / 2 },
      { side: 'west',  cx: x - halfW, cz: z, length: depth, isX: false, rot: Math.PI / 2 }
    ];

    walls.forEach(w => {
      const wallOpenings = openings.filter(o => o.wall === w.side);
      if (wallOpenings.length === 0) {
        // Solid wall
        const geo = new THREE.BoxGeometry(w.isX ? width : wallThick, height, w.isX ? wallThick : depth);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(w.cx, halfH, w.cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Add collider
        this.colliders.push(new THREE.Box3().setFromObject(mesh));
      } else {
        // Wall with opening/doorway
        const op = wallOpenings[0];
        const segLen = (w.length - op.width) / 2;

        if (w.isX) {
          // Left segment
          const leftLen = segLen + op.offset;
          if (leftLen > 0.2) {
            const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(leftLen, height, wallThick), wallMat);
            leftMesh.position.set(w.cx - width / 2 + leftLen / 2, halfH, w.cz);
            group.add(leftMesh);
            this.colliders.push(new THREE.Box3().setFromObject(leftMesh));
          }
          // Right segment
          const rightLen = segLen - op.offset;
          if (rightLen > 0.2) {
            const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(rightLen, height, wallThick), wallMat);
            rightMesh.position.set(w.cx + width / 2 - rightLen / 2, halfH, w.cz);
            group.add(rightMesh);
            this.colliders.push(new THREE.Box3().setFromObject(rightMesh));
          }
          // Header lintel over opening
          const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(op.width, height - 2.6, wallThick), wallMat);
          headerMesh.position.set(w.cx + op.offset, 2.6 + (height - 2.6) / 2, w.cz);
          group.add(headerMesh);
        } else {
          // Z wall (east/west)
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
    // Door shaking animation during monster attack
    if (this.doorShaking > 0 && this.doorMesh && !this.isDoorBroken) {
      this.doorShaking -= delta;
      const shakeAmt = this.doorShaking * 0.08;
      this.doorMesh.position.x = (Math.random() - 0.5) * shakeAmt;
      this.doorMesh.position.z = (Math.random() - 0.5) * shakeAmt;
      if (this.doorShaking <= 0) {
        this.doorMesh.position.set(0, 0, 0);
      }
    }

    // Atmospheric hallway light flicker
    if (this.hallLight && Math.random() < 0.04) {
      this.hallLight.intensity = 0.2 + Math.random() * 0.7;
    }

    // Basement red pulsing
    if (this.basementLight) {
      this.basementLight.intensity = 1.3 + Math.sin(Date.now() * 0.003) * 0.4;
    }
  }
}

// Helper to scale models automatically to a target height
function fitModel(model, targetHeight) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const currentHeight = size.y || 1;
  const scale = targetHeight / currentHeight;
  model.scale.set(scale, scale, scale);
  model.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function wallStoneMatProcedural() {
  return new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.95,
    metalness: 0.1
  });
}
