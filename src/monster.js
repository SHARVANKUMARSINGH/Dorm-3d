import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { audio } from './audio.js';

export class Monster {
  constructor(scene, house) {
    this.scene = scene;
    this.house = house;
    this.loader = new GLTFLoader();

    this.mesh = null;
    this.eyeGlowMesh = null;
    this.auraLight = null;

    // State machine: 'INACTIVE', 'SPAWN', 'PATROL', 'ATTACK_DOOR', 'BREACH', 'STUNNED', 'RETREAT'
    this.state = 'INACTIVE';

    this.position = new THREE.Vector3(0, 0, 20); // Basement
    this.velocity = new THREE.Vector3();
    this.speed = 2.4;
    this.waveLevel = 1;

    // Monster Stats
    this.maxHp = 100;
    this.hp = 100;
    this.damage = 18;
    this.attackCooldown = 0;
    this.attackInterval = 1.4; // Seconds between door strikes
    this.stunTimer = 0;

    // Animation variables
    this.floatTime = 0;
    this.lungeOffset = 0;
    this.isLunging = false;

    // AI Waypoints from Basement to Bedroom Door
    this.waypoints = [
      new THREE.Vector3(0, 0.5, 18),   // Basement spawn
      new THREE.Vector3(0, 0.5, 12),   // Hallway South
      new THREE.Vector3(0, 0.5, -4.5), // Hallway Library entrance
      new THREE.Vector3(5.5, 0.5, -4.5), // Library corridor
      new THREE.Vector3(8.8, 0.5, -4.5)  // Right in front of door!
    ];
    this.currentWaypointIndex = 0;

    // Particle trail
    this.particles = [];
  }

  async loadModel() {
    try {
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load('/models/monster.glb', resolve, undefined, reject);
      });

      this.mesh = gltf.scene;

      // Normalize scale to ~2.0m height
      const box = new THREE.Box3().setFromObject(this.mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetHeight = 2.0;
      const scale = targetHeight / (size.y || 1);
      this.mesh.scale.set(scale, scale, scale);

      // Materials and eerie lighting
      this.mesh.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          // Make ghost cloth slightly translucent & eerie
          if (child.material) {
            child.material = child.material.clone();
            child.material.roughness = 0.8;
            child.material.metalness = 0.1;
          }
        }
      });

      // Add Glowing Red Eyes inside the sheet eye sockets
      const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
      
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.12, 1.62, 0.28);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.12, 1.62, 0.28);

      const eyesGroup = new THREE.Group();
      eyesGroup.add(leftEye);
      eyesGroup.add(rightEye);
      this.mesh.add(eyesGroup);
      this.eyeGlowMesh = eyesGroup;

      // Eerie Red Aura Point Light
      this.auraLight = new THREE.PointLight(0xff1133, 1.2, 5.0, 1.5);
      this.auraLight.position.set(0, 1.2, 0);
      this.mesh.add(this.auraLight);

      this.mesh.position.copy(this.position);
      this.mesh.visible = false;
      this.scene.add(this.mesh);

      // Create ghost particle trail system
      this.createParticleTrail();
    } catch (err) {
      console.error('Failed to load monster model, creating fallback ghost:', err);
      this.createFallbackGhost();
    }
  }

  createFallbackGhost() {
    const ghostGroup = new THREE.Group();

    // Sheet body
    const bodyGeo = new THREE.ConeGeometry(0.65, 1.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.9,
      transparent: true,
      opacity: 0.92
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    ghostGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.6;
    ghostGroup.add(head);

    // Dark Hollow Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.16, 1.62, 0.4);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e2.position.set(0.16, 1.62, 0.4);
    ghostGroup.add(e1);
    ghostGroup.add(e2);

    this.auraLight = new THREE.PointLight(0xff0044, 1.2, 5.0);
    this.auraLight.position.y = 1.2;
    ghostGroup.add(this.auraLight);

    this.mesh = ghostGroup;
    this.mesh.position.copy(this.position);
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    this.createParticleTrail();
  }

  createParticleTrail() {
    const pGeo = new THREE.BufferGeometry();
    const count = 30;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = 0;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pMat = new THREE.PointsMaterial({
      color: 0xff2244,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.particlePoints = new THREE.Points(pGeo, pMat);
    this.particlePoints.visible = false;
    this.scene.add(this.particlePoints);

    this.particleData = [];
    for (let i = 0; i < count; i++) {
      this.particleData.push({
        pos: new THREE.Vector3(),
        life: Math.random(),
        speed: 0.3 + Math.random() * 0.4
      });
    }
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
    if (this.particlePoints) {
      this.particlePoints.visible = true;
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
    if (this.particlePoints) this.particlePoints.visible = false;
    audio.stopHeartbeat();
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    // Flash white when hit
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.emissive = new THREE.Color(0xffffff);
          child.material.emissiveIntensity = 0.8;
          setTimeout(() => {
            if (child.material) {
              child.material.emissive = new THREE.Color(0x000000);
              child.material.emissiveIntensity = 0;
            }
          }, 80);
        }
      });
    }

    if (this.hp <= 0) {
      this.retreat();
    }
  }

  update(delta, playerPos) {
    if (this.state === 'INACTIVE' || !this.mesh) return;

    this.floatTime += delta;

    // Procedural hovering sine wave
    const hoverY = 0.6 + Math.sin(this.floatTime * 3.2) * 0.18;

    // Check proximity to player for heartbeat sound effect
    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    if (distToPlayer < 10) {
      const heartRate = Math.max(350, Math.min(900, distToPlayer * 90));
      audio.playHeartbeat(heartRate);
    } else {
      audio.stopHeartbeat();
    }

    // STATE MACHINE UPDATE
    if (this.state === 'STUNNED') {
      this.stunTimer -= delta;
      // Stun twitching animation
      this.mesh.rotation.y += (Math.random() - 0.5) * 0.4;
      this.mesh.position.y = hoverY + (Math.random() - 0.5) * 0.1;
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
          // Reached Bedroom Door!
          this.state = 'ATTACK_DOOR';
          this.attackCooldown = 0.5;
        }
      } else {
        dir.normalize();
        this.mesh.position.addScaledVector(dir, this.speed * delta);
        this.mesh.position.y = hoverY;

        // Smooth rotation towards travel direction
        const targetRot = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetRot, delta * 6);
        // Tilt forward slightly when moving
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0.15, delta * 4);
      }
    } else if (this.state === 'ATTACK_DOOR') {
      // Look directly at door (towards +X)
      this.mesh.rotation.y = Math.PI / 2;
      this.mesh.rotation.x = 0;

      // If door is broken, rush inside!
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

      // Handle lunging forward and back
      if (this.isLunging) {
        this.lungeOffset = Math.sin(this.lungeTimer * Math.PI * 4) * 0.4;
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
      // Chase player into the bedroom!
      const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
      dir.y = 0;
      const dist = dir.length();

      dir.normalize();
      this.mesh.position.addScaledVector(dir, this.speed * 1.3 * delta);
      this.mesh.position.y = hoverY;

      const targetRot = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetRot, delta * 8);

      // Attack player when close
      if (dist < 1.4) {
        this.attackCooldown -= delta;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 0.8;
          // Player hit event will be handled by game controller
          this.onPlayerHit?.(25 + this.waveLevel * 8);
        }
      }
    } else if (this.state === 'RETREAT') {
      // Flee back towards basement spawn
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

    // Update particle trail
    this.updateParticles(delta);
  }

  performDoorLunge() {
    this.isLunging = true;
    this.lungeTimer = 0.35;
    this.house.damageDoor(this.damage);
    audio.playDoorHit(1.0 + Math.min(1.0, this.waveLevel * 0.1));

    // Screen shake callback
    this.onDoorImpact?.();
  }

  updateParticles(delta) {
    if (!this.particlePoints || !this.mesh) return;
    const positions = this.particlePoints.geometry.attributes.position.array;
    const count = this.particleData.length;

    for (let i = 0; i < count; i++) {
      const p = this.particleData[i];
      p.life -= delta * p.speed;
      if (p.life <= 0) {
        p.life = 1.0;
        p.pos.copy(this.mesh.position);
        p.pos.x += (Math.random() - 0.5) * 0.6;
        p.pos.y += 0.4 + Math.random() * 0.8;
        p.pos.z += (Math.random() - 0.5) * 0.6;
      } else {
        p.pos.y += delta * 0.2;
      }

      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
    }

    this.particlePoints.geometry.attributes.position.needsUpdate = true;
  }
}
