import * as THREE from 'three';
import { audio } from './audio.js';

export class Player {
  constructor(camera, domElement, house) {
    this.camera = camera;
    this.domElement = domElement;
    this.house = house;

    // Player position
    this.position = new THREE.Vector3(14, 1.7, -7); // In bedroom
    this.velocity = new THREE.Vector3();
    this.camera.position.copy(this.position);

    this.pitch = 0;
    this.yaw = -Math.PI / 2; // Face bedroom door
    this.updateCameraRotation();

    // Stats
    this.hp = 100;
    this.maxHp = 100;
    this.isDead = false;

    // Speeds
    this.walkSpeed = 4.0;
    this.sprintSpeed = 6.0;
    this.jumpForce = 4.8;
    this.gravity = 14.0;
    this.isGrounded = true;

    // State
    this.isSleeping = false;
    this.sleepTargetPos = new THREE.Vector3(16.0, 0.9, -6.0);
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

    // Camera look touch tracking
    this.touchLookId = null;
    this.lastTouchLookX = 0;
    this.lastTouchLookY = 0;

    // Mouse drag tracking (fallback when pointer lock is not engaged)
    this.isMouseDown = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Interaction
    this.currentInteractive = null;
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

    // Pointer Lock for Desktop
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.isUsingCctv && !this.isSleeping) {
        try {
          this.domElement.requestPointerLock?.();
        } catch (e) {}
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    // Mouse Look (with Pointer Lock & Drag Fallback)
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, .modal-content, input, select, .quick-ping')) return;
      this.isMouseDown = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isSleeping || this.isUsingCctv) return;

      if (this.isLocked) {
        const sensitivity = 0.0022;
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
        this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
        this.updateCameraRotation();
      } else if (this.isMouseDown) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        const sensitivity = 0.0035;
        this.yaw -= dx * sensitivity;
        this.pitch -= dy * sensitivity;
        this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
        this.updateCameraRotation();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    // TOUCH CAMERA DRAG LOOK (FOR MOBILE & TABLET!)
    window.addEventListener('touchstart', (e) => {
      if (this.isSleeping || this.isUsingCctv) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        
        // Skip joystick zone and buttons
        if (target && target.closest('#touch-joystick-zone, button, .modal-content, input, select, .m-btn')) {
          continue;
        }

        // If touch is on right 70% or upper screen, use for camera look!
        if (this.touchLookId === null) {
          this.touchLookId = touch.identifier;
          this.lastTouchLookX = touch.clientX;
          this.lastTouchLookY = touch.clientY;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.isSleeping || this.isUsingCctv || this.touchLookId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchLookId) {
          const dx = touch.clientX - this.lastTouchLookX;
          const dy = touch.clientY - this.lastTouchLookY;
          this.lastTouchLookX = touch.clientX;
          this.lastTouchLookY = touch.clientY;

          const touchSensitivity = 0.0045;
          this.yaw -= dx * touchSensitivity;
          this.pitch -= dy * touchSensitivity;
          this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
          this.updateCameraRotation();
        }
      }
    }, { passive: true });

    const endTouchLook = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchLookId) {
          this.touchLookId = null;
        }
      }
    };

    window.addEventListener('touchend', endTouchLook, { passive: true });
    window.addEventListener('touchcancel', endTouchLook, { passive: true });
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

    if (this.isSleeping) {
      this.sleepLerp = THREE.MathUtils.lerp(this.sleepLerp, 1.0, delta * 4);
      this.camera.position.lerpVectors(this.standPos, this.sleepTargetPos, this.sleepLerp);
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

    const isSprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.touchJoystick.active;
    const currentSpeed = isSprinting ? this.sprintSpeed : this.walkSpeed;

    const moveVector = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveVector.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveVector.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveVector.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVector.x += 1;

    if (this.touchJoystick.active) {
      moveVector.x += this.touchJoystick.x;
      moveVector.z -= this.touchJoystick.y;
    }

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

      const targetVel = new THREE.Vector3()
        .addScaledVector(forward, -moveVector.z)
        .addScaledVector(right, moveVector.x)
        .multiplyScalar(currentSpeed);

      this.velocity.x = targetVel.x;
      this.velocity.z = targetVel.z;

      this.footstepTimer += delta * (isSprinting ? 1.6 : 1.0);
      if (this.footstepTimer > 0.45 && this.isGrounded) {
        this.footstepTimer = 0;
        audio.playFootstep('wood');
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.keys['Space'] && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * delta;
    }

    this.moveWithCollision(delta);

    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity -= delta * 1.5;
      const shakeAmt = Math.max(0, this.screenShakeIntensity) * 0.12;
      this.camera.position.x = this.position.x + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y = this.position.y + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.z = this.position.z + (Math.random() - 0.5) * shakeAmt;
    } else {
      this.camera.position.copy(this.position);
    }

    this.checkInteractiveObjects();
  }

  moveWithCollision(delta) {
    const playerRadius = 0.35;
    const playerHeight = 1.7;

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
