import * as THREE from 'three';
import { audio } from './audio.js';

export class CCTVSystem {
  constructor(scene, house, monster) {
    this.scene = scene;
    this.house = house;
    this.monster = monster;

    this.active = false;
    this.currentCamIndex = 0;
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    // Camera viewpoints from house configuration
    this.cameras = house.cctvCameraPositions;

    // Remote stun cooldown
    this.stunCooldown = 0;
    this.stunMaxCooldown = 12.0;

    // Remote door fortify timer
    this.fortifyTimer = 0;

    // Stun light mesh
    this.stunLight = new THREE.PointLight(0xa5f3fc, 0, 15, 1.2);
    this.stunLight.position.set(9.0, 2.9, -4.5); // Hallway outside door
    this.scene.add(this.stunLight);

    this.setupKeyBindings();
  }

  setupKeyBindings() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Digit1') this.switchCamera(0);
      if (e.code === 'Digit2') this.switchCamera(1);
      if (e.code === 'Digit3') this.switchCamera(2);
      if (e.code === 'Digit4') this.switchCamera(3);
      if (e.code === 'Escape') this.exit();
    });
  }

  enter() {
    this.active = true;
    this.currentCamIndex = 0; // Default to CAM 01 (Door)
    this.applyCurrentCamera();
    audio.playCctvSwitch();
    this.onEnter?.();
  }

  exit() {
    this.active = false;
    audio.playCctvSwitch();
    this.onExit?.();
  }

  switchCamera(index) {
    if (index >= 0 && index < this.cameras.length) {
      this.currentCamIndex = index;
      this.applyCurrentCamera();
      audio.playCctvSwitch();
      this.onCameraChanged?.(this.getCurrentCamInfo());
    }
  }

  nextCamera() {
    this.switchCamera((this.currentCamIndex + 1) % this.cameras.length);
  }

  applyCurrentCamera() {
    const camData = this.cameras[this.currentCamIndex];
    this.camera.position.copy(camData.pos);
    this.camera.lookAt(camData.target);
    this.camera.fov = camData.fov;
    this.camera.updateProjectionMatrix();
  }

  getCurrentCamInfo() {
    return this.cameras[this.currentCamIndex];
  }

  triggerRemoteStun() {
    if (this.stunCooldown > 0) return false;
    this.stunCooldown = this.stunMaxCooldown;

    // Flash hallway with high intensity UV light
    this.stunLight.intensity = 8.0;
    setTimeout(() => {
      this.stunLight.intensity = 0;
    }, 400);

    // If monster is near bedroom door (CAM 01), stun it!
    const distToDoor = this.monster.mesh.position.distanceTo(new THREE.Vector3(9.0, 0.5, -4.5));
    if (distToDoor < 6.0) {
      this.monster.stun(5.5);
    } else {
      audio.playStunSound();
    }
    return true;
  }

  triggerRemoteRepair(xpCost = 20, repairAmount = 45) {
    this.house.repairDoor(repairAmount);
    audio.playUpgradeSound();
  }

  update(delta) {
    if (this.stunCooldown > 0) {
      this.stunCooldown -= delta;
    }

    if (this.fortifyTimer > 0) {
      this.fortifyTimer -= delta;
      if (this.fortifyTimer <= 0) {
        this.house.doorArmor -= 5;
      }
    }

    // Slight CCTV camera security pan/sway
    if (this.active) {
      const camData = this.cameras[this.currentCamIndex];
      const time = Date.now() * 0.0008;
      const sway = Math.sin(time) * 0.04;
      const targetWithSway = camData.target.clone();
      targetWithSway.x += sway;
      targetWithSway.z += sway * 0.5;
      this.camera.lookAt(targetWithSway);
    }
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
