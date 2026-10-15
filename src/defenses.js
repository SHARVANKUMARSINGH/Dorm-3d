import * as THREE from 'three';
import { audio } from './audio.js';

export class DefenseManager {
  constructor(scene, house, monster) {
    this.scene = scene;
    this.house = house;
    this.monster = monster;

    this.turretLevel = 0; // 0 = None, 1 = UV Lantern, 2 = Arc Blaster, 3 = Tesla Coil
    this.turretMesh = null;
    this.fireTimer = 0;
    this.fireInterval = 1.4;

    this.projectiles = [];
    this.targetDoorPos = new THREE.Vector3(9.2, 1.3, -4.5); // Where monster stands
  }

  buildOrUpgrade() {
    this.turretLevel += 1;
    this.rebuildTurretMesh();
    audio.playUpgradeSound();
  }

  rebuildTurretMesh() {
    if (this.turretMesh) {
      this.scene.remove(this.turretMesh);
      this.turretMesh = null;
    }

    const padPos = this.house.turretPadPosition;
    const group = new THREE.Group();
    group.position.copy(padPos);

    if (this.turretLevel === 1) {
      // UV Garlic Lantern
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 0.7, 8),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 })
      );
      base.position.y = 0.35;
      group.add(base);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.8
        })
      );
      orb.position.y = 0.85;
      group.add(orb);

      const light = new THREE.PointLight(0x38bdf8, 1.5, 4);
      light.position.y = 0.85;
      group.add(light);

      this.fireInterval = 1.6;
      this.turretDamage = 20;
    } else if (this.turretLevel === 2) {
      // Arc Blaster
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
      );
      base.position.y = 0.45;
      group.add(base);

      // Dual gun barrels
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 });
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7), barrelMat);
      b1.rotation.x = Math.PI / 2;
      b1.position.set(-0.15, 0.95, -0.3);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7), barrelMat);
      b2.rotation.x = Math.PI / 2;
      b2.position.set(0.15, 0.95, -0.3);
      group.add(b1);
      group.add(b2);

      const light = new THREE.PointLight(0xfacc15, 2.0, 5);
      light.position.y = 1.0;
      group.add(light);

      this.fireInterval = 1.1;
      this.turretDamage = 45;
    } else if (this.turretLevel >= 3) {
      // Cyber Tesla Coil
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 1.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 })
      );
      base.position.y = 0.6;
      group.add(base);

      const coilRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.08, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.9 })
      );
      coilRing.rotation.x = Math.PI / 2;
      coilRing.position.y = 1.25;
      group.add(coilRing);

      const light = new THREE.PointLight(0xc084fc, 2.5, 6);
      light.position.y = 1.3;
      group.add(light);

      this.fireInterval = 0.75;
      this.turretDamage = 80;
    }

    this.turretMesh = group;
    this.scene.add(group);
  }

  update(delta) {
    if (this.turretLevel === 0 || !this.turretMesh) return;

    // Check if monster is at or near the door or inside room
    const monsterActive = this.monster.state === 'ATTACK_DOOR' || this.monster.state === 'BREACH';
    if (monsterActive && this.monster.mesh && this.monster.mesh.visible) {
      const monsterPos = this.monster.mesh.position;
      
      // Aim turret towards monster
      const padPos = this.house.turretPadPosition;
      const angle = Math.atan2(monsterPos.x - padPos.x, monsterPos.z - padPos.z);
      this.turretMesh.rotation.y = angle;

      this.fireTimer -= delta;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        this.fireProjectile(padPos, monsterPos);
      }
    }

    // Update active projectiles
    this.updateProjectiles(delta);
  }

  fireProjectile(fromPos, toPos) {
    audio.playTurretFire();

    const pGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const pMat = new THREE.MeshBasicMaterial({
      color: this.turretLevel >= 3 ? 0xc084fc : this.turretLevel === 2 ? 0xfacc15 : 0x38bdf8
    });
    const proj = new THREE.Mesh(pGeo, pMat);
    proj.position.copy(fromPos);
    proj.position.y += 0.9;
    this.scene.add(proj);

    const dir = new THREE.Vector3().subVectors(toPos, proj.position).normalize();

    this.projectiles.push({
      mesh: proj,
      dir: dir,
      speed: 16.0,
      target: toPos.clone(),
      life: 1.5,
      damage: this.turretDamage
    });
  }

  updateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;
      p.mesh.position.addScaledVector(p.dir, p.speed * delta);

      // Hit test with monster
      if (this.monster.mesh && p.mesh.position.distanceTo(this.monster.mesh.position) < 0.9) {
        this.monster.takeDamage(p.damage);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
