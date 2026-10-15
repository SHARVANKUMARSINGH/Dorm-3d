import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { audio } from './audio.js';

export class Player {
  constructor(camera, domElement, house) {
    this.camera = camera;
    this.domElement = domElement;
    this.house = house;
    this.loader = new GLTFLoader();

    // Player position and physics
    this.position = new THREE.Vector3(14, 1.7, -7); // Spawns inside bedroom
    this.velocity = new THREE.Vector3();
    this.camera.position.copy(this.position);

    this.pitch = 0;
    this.yaw = -Math.PI / 2; // Face towards the bedroom door
    this.updateCameraRotation();

    // Stats
    this.hp = 100;
    this.maxHp = 100;
    this.isDead = false;

    // Movement speeds
    this.walkSpeed = 3.8;
    this.sprintSpeed = 5.8;
    this.jumpForce = 4.8;
    this.gravity = 14.0;
    this.isGrounded = true;

    // State
    this.isSleeping = false;
    this.sleepTargetPos = new THREE.Vector3(16.0, 1.0, -6.0);
    this.standPos = new THREE.Vector3(14.5, 1.7, -6.5);
    this.sleepLerp = 0;

    this.isUsingCctv = false;
    this.screenShakeIntensity = 0;

    // Flashlight
    this.flashlightOn = true;
    this.setupFlashlight();

    // Input tracking
    this.keys = {};
    this.isLocked = false;
    this.touchJoystick = { x: 0, y: 0, active: false };

    // Interaction
    this.currentInteractive = null;

    // Footstep timer
    this.footstepTimer = 0;

    this.setupInputs();
  }

  setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xfffaed, 2.8, 16, Math.PI / 6, 0.4, 1.5);
    this.flashlight.position.set(0.2, -0.2, -0.1);
    this.camera.add(this.flashlight);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -5);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 2.8 : 0;
    audio.playFootstep('stone');
  }

  setupInputs() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') {
        this.toggleFlashlight();
      }
      if (e.code === 'KeyE') {
        if (this.isSleeping) {
          this.wakeUp();
        } else if (this.currentInteractive) {
          this.onInteract?.(this.currentInteractive.action);
        }
      }
      if (e.code === 'Space' && this.isSleeping) {
        this.wakeUp();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Pointer Lock
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.isUsingCctv) {
        this.domElement.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || this.isSleeping || this.isUsingCctv) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
      this.updateCameraRotation();
    });
  }

  updateCameraRotation() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  sleep() {
    this.isSleeping = true;
    audio.playCoinChime();
  }

  wakeUp() {
    this.isSleeping = false;
  }

  addScreenShake(amount = 0.4) {
    this.screenShakeIntensity = Math.min(1.0, this.screenShakeIntensity + amount);
  }

  update(delta) {
    if (this.isDead) return;

    // Handle sleeping animation & transition
    if (this.isSleeping) {
      this.sleepLerp = THREE.MathUtils.lerp(this.sleepLerp, 1.0, delta * 4);
      this.camera.position.lerpVectors(this.standPos, this.sleepTargetPos, this.sleepLerp);
      // Face towards ceiling and bedroom door
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.1, delta * 4);
      this.yaw = THREE.MathUtils.lerp(this.yaw, -Math.PI / 2, delta * 4);
      this.updateCameraRotation();
      return;
    } else if (this.sleepLerp > 0.01) {
      this.sleepLerp = THREE.MathUtils.lerp(this.sleepLerp, 0, delta * 5);
      this.camera.position.lerpVectors(this.standPos, this.sleepTargetPos, this.sleepLerp);
      this.position.copy(this.standPos);
    }

    if (this.isUsingCctv) return;

    // Movement calculation
    const isSprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.touchJoystick.active;
    const currentSpeed = isSprinting ? this.sprintSpeed : this.walkSpeed;

    const moveVector = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveVector.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveVector.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveVector.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVector.x += 1;

    // Mobile joystick input
    if (this.touchJoystick.active) {
      moveVector.x += this.touchJoystick.x;
      moveVector.z -= this.touchJoystick.y;
    }

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();

      // Transform by camera yaw
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

      const targetVel = new THREE.Vector3()
        .addScaledVector(forward, -moveVector.z)
        .addScaledVector(right, moveVector.x)
        .multiplyScalar(currentSpeed);

      this.velocity.x = targetVel.x;
      this.velocity.z = targetVel.z;

      // Footstep sound
      this.footstepTimer += delta * (isSprinting ? 1.6 : 1.0);
      if (this.footstepTimer > 0.45 && this.isGrounded) {
        this.footstepTimer = 0;
        audio.playFootstep('wood');
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Jump & Gravity
    if (this.keys['Space'] && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * delta;
    }

    // Apply movement with wall collision detection
    this.moveWithCollision(delta);

    // Apply screen shake
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity -= delta * 1.5;
      const shakeAmt = Math.max(0, this.screenShakeIntensity) * 0.12;
      this.camera.position.x = this.position.x + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y = this.position.y + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.z = this.position.z + (Math.random() - 0.5) * shakeAmt;
    } else {
      this.camera.position.copy(this.position);
    }

    // Check Proximity Prompts
    this.checkInteractiveObjects();
  }

  moveWithCollision(delta) {
    const playerRadius = 0.35;
    const playerHeight = 1.7;

    // Test X movement
    const nextX = this.position.x + this.velocity.x * delta;
    let collideX = false;
    const playerBoxX = new THREE.Box3(
      new THREE.Vector3(nextX - playerRadius, this.position.y - playerHeight, this.position.z - playerRadius),
      new THREE.Vector3(nextX + playerRadius, this.position.y + 0.2, this.position.z + playerRadius)
    );

    for (const box of this.house.colliders) {
      if (box.intersectsBox(playerBoxX)) {
        collideX = true;
        break;
      }
    }
    if (!collideX) this.position.x = nextX;

    // Test Z movement
    const nextZ = this.position.z + this.velocity.z * delta;
    let collideZ = false;
    const playerBoxZ = new THREE.Box3(
      new THREE.Vector3(this.position.x - playerRadius, this.position.y - playerHeight, nextZ - playerRadius),
      new THREE.Vector3(this.position.x + playerRadius, this.position.y + 0.2, nextZ + playerRadius)
    );

    for (const box of this.house.colliders) {
      if (box.intersectsBox(playerBoxZ)) {
        collideZ = true;
        break;
      }
    }
    if (!collideZ) this.position.z = nextZ;

    // Y movement & Floor
    this.position.y += this.velocity.y * delta;
    if (this.position.y <= 1.7) {
      this.position.y = 1.7;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }

  checkInteractiveObjects() {
    let closest = null;
    let minDist = Infinity;

    for (const obj of this.house.interactiveObjects) {
      const dist = this.position.distanceTo(obj.position);
      if (dist <= obj.radius && dist < minDist) {
        minDist = dist;
        closest = obj;
      }
    }

    this.currentInteractive = closest;
  }
}
