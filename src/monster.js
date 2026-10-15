import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { audio } from './audio.js';
import { AssetCache } from './assetCache.js';
import { groundAndScale } from './house.js';

export class Monster {
  constructor(scene, house) {
    this.scene = scene;
    this.house = house;
    this.loader = new GLTFLoader();

    this.mesh = null;
    this.eyeGlowMesh = null;
    this.auraLight = null;

    // State: 'INACTIVE', 'SPAWN', 'PATROL', 'ATTACK_DOOR', 'BREACH', 'STUNNED', 'RETREAT'
    this.state = 'INACTIVE';

    this.position = new THREE.Vector3(0, 0, 20); // Basement
    this.velocity = new THREE.Vector3();
    this.speed = 2.4;
    this.waveLevel = 1;

    // Stats
    this.maxHp = 100;
    this.hp = 100;
    this.damage = 18;
    this.attackCooldown = 0;
    this.attackInterval = 1.4;
    this.stunTimer = 0;

    // Animation
    this.floatTime = 0;
    this.lungeOffset = 0;
    this.isLunging = false;

    // Waypoints from Basement to Door
    this.waypoints = [
      new THREE.Vector3(0, 0.2, 18),
      new THREE.Vector3(0, 0.2, 12),
      new THREE.Vector3(0, 0.2, -4.5),
      new THREE.Vector3(5.5, 0.2, -4.5),
      new THREE.Vector3(8.8, 0.2, -4.5)
    ];
    this.currentWaypointIndex = 0;
  }

  async loadModel(onStatus) {
    try {
      const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
      const buffer = await AssetCache.loadArrayBuffer(base + 'models/monster.glb', onStatus);
      const gltf = await new Promise((resolve, reject) => {
        this.loader.parse(buffer, '', resolve, reject);
      });

      // Ground and scale ghost to 2.0m height
      const grounded = groundAndScale(gltf.scene, 2.0);
      this.mesh = grounded;

      // Add Glowing Red Eyes inside the sheet eye sockets
      const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
      
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.12, 1.55, 0.28);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.12, 1.55, 0.28);

      const eyesGroup = new THREE.Group();
      eyesGroup.add(leftEye);
      eyesGroup.add(rightEye);
      this.mesh.add(eyesGroup);
      this.eyeGlowMesh = eyesGroup;

      // Eerie Red Aura Point Light
      this.auraLight = new THREE.PointLight(0xff1133, 1.2, 4.0, 1.5);
      this.auraLight.position.set(0, 1.1, 0);
      this.mesh.add(this.auraLight);

      this.mesh.position.copy(this.position);
      this.mesh.visible = false;
      this.scene.add(this.mesh);
    } catch (err) {
      console.error('Failed to load monster model, creating fallback ghost:', err);
      this.createFallbackGhost();
    }
  }

  createFallbackGhost() {
    const ghostGroup = new THREE.Group();

    const bodyGeo = new THREE.ConeGeometry(0.65, 1.8, 16);
    const bodyMat = new THREE.MeshLambertMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.92
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    ghostGroup.add(body);

    const headGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.6;
    ghostGroup.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.16, 1.62, 0.4);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e2.position.set(0.16, 1.62, 0.4);
    ghostGroup.add(e1);
    ghostGroup.add(e2);

    this.auraLight = new THREE.PointLight(0xff0044, 1.2, 4.0);
    this.auraLight.position.y = 1.2;
    ghostGroup.add(this.auraLight);

    this.mesh = ghostGroup;
    this.mesh.position.copy(this.position);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  spawn(waveLevel = 1) {
    this.waveLevel = waveLevel;
    this.state = 'SPAWN';
    this.currentWaypointIndex = 0;
    this.position.copy(this.waypoints[0]);
    this.hp = 100 + (waveLevel - 1) * 60;
    this.maxHp = this.hp;
    this.damage = 18 + (waveLevel - 1) * 6;
    this.speed = 2.2 + Math.min(1.5, waveLevel * 0.2);

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.visible = true;
    }

    audio.playGhostGroan();
    this.state = 'PATROL';
  }

  stun(duration = 5.0) {
    this.state = 'STUNNED';
    this.stunTimer = duration;
    audio.playStunSound();
  }

  retreat() {
    this.state = 'RETREAT';
    audio.playGhostGroan();
  }

  despawn() {
    this.state = 'INACTIVE';
    if (this.mesh) this.mesh.visible = false;
    audio.stopHeartbeat();
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.retreat();
    }
  }

  update(delta, playerPos) {
    if (this.state === 'INACTIVE' || !this.mesh) return;

    this.floatTime += delta;

    // Natural hovering height (just 20-30cm above floor)
    const hoverY = 0.2 + Math.sin(this.floatTime * 3.0) * 0.1;

    // Proximity to player for heartbeat
    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    if (distToPlayer < 9) {
      const heartRate = Math.max(350, Math.min(900, distToPlayer * 95));
      audio.playHeartbeat(heartRate);
    } else {
      audio.stopHeartbeat();
    }

    if (this.state === 'STUNNED') {
      this.stunTimer -= delta;
      this.mesh.rotation.y += (Math.random() - 0.5) * 0.3;
      this.mesh.position.y = hoverY;
      if (this.stunTimer <= 0) {
        this.state = 'ATTACK_DOOR';
      }
      return;
    }

    if (this.state === 'PATROL') {
      const targetPoint = this.waypoints[this.currentWaypointIndex];
      const dir = new THREE.Vector3().subVectors(targetPoint, this.mesh.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist < 0.4) {
        this.currentWaypointIndex++;
        if (this.currentWaypointIndex >= this.waypoints.length) {
          this.state = 'ATTACK_DOOR';
          this.attackCooldown = 0.5;
        }
      } else {
        dir.normalize();
        this.mesh.position.addScaledVector(dir, this.speed * delta);
        this.mesh.position.y = hoverY;

        const targetRot = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetRot, delta * 6);
      }
    } else if (this.state === 'ATTACK_DOOR') {
      this.mesh.rotation.y = Math.PI / 2;

      if (this.house.isDoorBroken) {
        this.state = 'BREACH';
        audio.playGhostGroan();
        return;
      }

      this.attackCooldown -= delta;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.attackInterval;
        this.performDoorLunge();
      }

      if (this.isLunging) {
        this.lungeOffset = Math.sin(this.lungeTimer * Math.PI * 4) * 0.35;
        this.mesh.position.x = 8.8 + Math.max(0, this.lungeOffset);
        this.lungeTimer -= delta;
        if (this.lungeTimer <= 0) {
          this.isLunging = false;
          this.mesh.position.x = 8.8;
        }
      } else {
        this.mesh.position.x = 8.8;
        this.mesh.position.y = hoverY;
      }
    } else if (this.state === 'BREACH') {
      const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
      dir.y = 0;
      const dist = dir.length();

      dir.normalize();
      this.mesh.position.addScaledVector(dir, this.speed * 1.3 * delta);
      this.mesh.position.y = hoverY;

      const targetRot = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetRot, delta * 8);

      if (dist < 1.4) {
        this.attackCooldown -= delta;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 0.8;
          this.onPlayerHit?.(25 + this.waveLevel * 8);
        }
      }
    } else if (this.state === 'RETREAT') {
      const targetPoint = this.waypoints[0];
      const dir = new THREE.Vector3().subVectors(targetPoint, this.mesh.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist < 1.0) {
        this.despawn();
      } else {
        dir.normalize();
        this.mesh.position.addScaledVector(dir, this.speed * 2.2 * delta);
        this.mesh.position.y = hoverY;
        const targetRot = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = targetRot;
      }
    }
  }

  performDoorLunge() {
    this.isLunging = true;
    this.lungeTimer = 0.35;
    this.house.damageDoor(this.damage);
    audio.playDoorHit(1.0 + Math.min(1.0, this.waveLevel * 0.1));
    this.onDoorImpact?.();
  }
}
