import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { audio } from './audio.js';
import { House } from './house.js';
import { Monster } from './monster.js';
import { Player } from './player.js';
import { CCTVSystem } from './cctv.js';
import { DefenseManager } from './defenses.js';
import { NetworkManager } from './network.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');

    // Detect mobile device for optimal FPS
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.innerWidth < 900);
    const pixelRatio = isMobile ? 1.0 : Math.min(window.devicePixelRatio, 1.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobile, // Disable MSAA on mobile for max frame rate
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(pixelRatio);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090e);
    this.scene.fog = new THREE.FogExp2(0x06090e, 0.035);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    // Systems
    this.house = new House(this.scene);
    this.player = new Player(this.camera, this.canvas, this.house);
    this.monster = new Monster(this.scene, this.house);
    this.cctv = new CCTVSystem(this.scene, this.house, this.monster);
    this.defenses = new DefenseManager(this.scene, this.house, this.monster);
    this.network = new NetworkManager(this.scene);

    // Economy & Waves
    this.xp = 0;
    this.gold = 50;
    this.waveLevel = 1;

    this.phase = 'PREP';
    this.prepTimer = 60;
    this.prepDuration = 60;
    this.waveTimer = 25;
    this.waveDuration = 25;

    this.bedUpgrades = [
      { name: 'Creaky Cot', xpRate: 2, goldRate: 5, costGold: 0 },
      { name: 'Cozy Spring Bed', xpRate: 6, goldRate: 14, costGold: 120 },
      { name: 'Deluxe Memory Foam', xpRate: 15, goldRate: 32, costGold: 350 },
      { name: 'Royal Canopy Bed', xpRate: 35, goldRate: 75, costGold: 900 },
      { name: 'Cyber Sanctuary Bed', xpRate: 80, goldRate: 180, costGold: 2200 }
    ];

    this.sleepTickTimer = 0;
    this.minimapThrottle = 0;
    this.clock = new THREE.Clock();

    this.setupCallbacks();
    this.setupUI();
    this.setupWindowEvents();
  }

  async init() {
    this.updateLoadingStatus('Checking device storage for pre-downloaded 3D assets...');
    await this.house.loadAssets((msg) => this.updateLoadingStatus(msg));
    this.house.buildHouse();

    this.updateLoadingStatus('Loading ghost monster model...');
    await this.monster.loadModel((msg) => this.updateLoadingStatus(msg));

    this.updateLoadingStatus('⚡ Ready! Stored on device for instant future play.');
    setTimeout(() => {
      document.getElementById('loading-overlay').classList.add('hidden');
      document.getElementById('main-menu').classList.remove('hidden');
    }, 400);

    this.animate();
  }

  updateLoadingStatus(msg) {
    const el = document.getElementById('loading-status');
    if (el) el.innerText = msg;
  }

  setupCallbacks() {
    this.player.onInteract = (action) => {
      if (action === 'sleep') {
        this.player.sleep();
        this.updateSleepOverlay(true);
      } else if (action === 'door') {
        this.openDoorModal();
      } else if (action === 'cctv') {
        this.enterCctv();
      } else if (action === 'turret') {
        this.openTurretModal();
      }
    };

    this.monster.onDoorImpact = () => {
      this.player.addScreenShake(0.35);
      this.updateHud();
    };

    this.monster.onPlayerHit = (damage) => {
      this.player.hp -= damage;
      this.player.addScreenShake(0.7);
      audio.playDoorBreach();
      this.triggerDamageFlash();
      if (this.player.hp <= 0) {
        this.triggerGameOver();
      }
      this.updateHud();
    };

    this.cctv.onEnter = () => {
      this.player.isUsingCctv = true;
      document.getElementById('cctv-overlay').classList.remove('hidden');
      document.getElementById('hud').classList.add('hidden');
      this.updateCctvUi();
    };

    this.cctv.onExit = () => {
      this.player.isUsingCctv = false;
      document.getElementById('cctv-overlay').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
    };

    this.cctv.onCameraChanged = () => {
      this.updateCctvUi();
    };

    this.network.onPlayerCountChanged = (count) => {
      const el = document.getElementById('mp-player-count');
      if (el) el.innerText = `Players in Dorm: ${count}`;
    };

    this.network.onChatReceived = (data) => {
      this.appendChatMessage(data);
    };

    this.network.onStateUpdate = (state) => {
      this.waveLevel = state.waveLevel;
      this.phase = state.phase;
      this.prepTimer = state.prepTimer;
      this.waveTimer = state.waveTimer;
      this.house.doorHp = state.doorHp;
      this.house.doorLevel = state.doorLevel;
      this.house.updateDoorHealthSprite();
      this.updateHud();
    };
  }

  startSoloGame() {
    audio.init();
    audio.resume();
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.phase = 'PREP';
    this.prepTimer = 60;
    this.updateHud();
  }

  openMultiplayerModal() {
    audio.init();
    document.getElementById('mp-modal').classList.remove('hidden');
  }

  closeMultiplayerModal() {
    document.getElementById('mp-modal').classList.add('hidden');
  }

  async handleCreateServer() {
    const sName = document.getElementById('mp-server-name').value || 'Dorm Alpha';
    const pSize = parseInt(document.getElementById('mp-player-size').value) || 4;
    const roomCode = await this.network.createServer(sName, pSize);

    document.getElementById('mp-create-section').classList.add('hidden');
    document.getElementById('mp-lobby-section').classList.remove('hidden');
    document.getElementById('mp-room-code-display').innerText = roomCode;
    document.getElementById('mp-room-title').innerText = sName;
    document.getElementById('mp-start-game-btn').classList.remove('hidden');
  }

  async handleJoinServer() {
    const code = document.getElementById('mp-join-code').value.trim();
    const name = document.getElementById('mp-join-name').value.trim() || 'Survivor';
    if (!code) {
      alert('Please enter a Room Code!');
      return;
    }

    const res = await this.network.joinServer(code, name);
    if (res.ok) {
      document.getElementById('mp-join-section').classList.add('hidden');
      document.getElementById('mp-lobby-section').classList.remove('hidden');
      document.getElementById('mp-room-code-display').innerText = code;
      document.getElementById('mp-room-title').innerText = 'Connected Room';
      document.getElementById('mp-status-msg').innerText = 'Ready! Click enter to start exploring.';
      document.getElementById('mp-start-game-btn').innerText = 'Enter Dorm World';
      document.getElementById('mp-start-game-btn').classList.remove('hidden');
    }
  }

  startMultiplayerSession() {
    this.closeMultiplayerModal();
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('chat-panel').classList.remove('hidden');
    this.updateHud();
  }

  calculateWaveDuration(wave) {
    return 20 + Math.min(58, (wave - 1) * 11);
  }

  startMonsterWave() {
    this.phase = 'WAVE';
    this.waveDuration = this.calculateWaveDuration(this.waveLevel);
    this.waveTimer = this.waveDuration;

    audio.playWaveAlarm();
    this.monster.spawn(this.waveLevel);

    this.showFloatingAlert(`⚠️ WAVE ${this.waveLevel} STARTED! GHOST ATTACK!`, 'red');
    this.updateHud();
  }

  endMonsterWave() {
    this.phase = 'PREP';
    this.prepTimer = this.prepDuration;
    this.monster.retreat();

    const waveXp = 50 + this.waveLevel * 45;
    const waveGold = 100 + this.waveLevel * 85;
    this.xp += waveXp;
    this.gold += waveGold;

    audio.playVictoryFanfare();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    this.showWaveClearedModal(this.waveLevel, waveXp, waveGold);
    this.waveLevel += 1;
    this.updateHud();
  }

  showWaveClearedModal(wave, waveXp, waveGold) {
    const modal = document.getElementById('wave-cleared-modal');
    document.getElementById('wc-wave-num').innerText = `WAVE ${wave} SURVIVED!`;
    document.getElementById('wc-reward-text').innerText = `+${waveXp} XP  •  +${waveGold} GOLD`;
    modal.classList.remove('hidden');
  }

  closeWaveClearedModal() {
    document.getElementById('wave-cleared-modal').classList.add('hidden');
  }

  triggerDamageFlash() {
    const flash = document.getElementById('damage-flash');
    flash.style.opacity = '0.7';
    setTimeout(() => { flash.style.opacity = '0'; }, 200);
  }

  triggerGameOver() {
    this.player.isDead = true;
    document.getElementById('game-over-modal').classList.remove('hidden');
    document.getElementById('go-stats').innerText = `You survived up to Wave ${this.waveLevel} with ${this.xp} XP!`;
    audio.playDoorBreach();
  }

  restartGame() {
    location.reload();
  }

  enterCctv() {
    this.cctv.enter();
  }

  exitCctv() {
    this.cctv.exit();
  }

  openDoorModal() {
    const modal = document.getElementById('door-modal');
    modal.classList.remove('hidden');
    this.updateDoorModalUI();
  }

  updateDoorModalUI() {
    const upCostGold = this.house.doorLevel * 150;
    const upCostXp = this.house.doorLevel * 40;
    const repairCostGold = 30;

    document.getElementById('dm-door-lvl').innerText = `Level ${this.house.doorLevel}`;
    document.getElementById('dm-door-hp').innerText = `${Math.ceil(this.house.doorHp)} / ${this.house.doorMaxHp}`;
    document.getElementById('dm-door-armor').innerText = `Armor: ${this.house.doorArmor} DEF`;
    document.getElementById('dm-upgrade-cost').innerText = `${upCostGold} Gold + ${upCostXp} XP`;
    document.getElementById('dm-repair-cost').innerText = `${repairCostGold} Gold`;

    const canUp = this.gold >= upCostGold && this.xp >= upCostXp && this.house.doorLevel < 5;
    const btnUp = document.getElementById('dm-upgrade-btn');
    btnUp.disabled = !canUp;
    btnUp.style.opacity = canUp ? '1' : '0.5';

    const canRep = this.gold >= repairCostGold && this.house.doorHp < this.house.doorMaxHp;
    const btnRep = document.getElementById('dm-repair-btn');
    btnRep.disabled = !canRep;
    btnRep.style.opacity = canRep ? '1' : '0.5';
  }

  handleUpgradeDoor() {
    const upCostGold = this.house.doorLevel * 150;
    const upCostXp = this.house.doorLevel * 40;

    if (this.gold >= upCostGold && this.xp >= upCostXp && this.house.doorLevel < 5) {
      this.gold -= upCostGold;
      this.xp -= upCostXp;
      this.house.upgradeDoor();
      audio.playUpgradeSound();
      this.updateDoorModalUI();
      this.updateHud();
      this.showFloatingAlert(`Door upgraded to Level ${this.house.doorLevel}!`, 'blue');

      if (this.network) {
        this.network.broadcast({
          type: 'DOOR_ACTION',
          action: 'upgrade',
          level: this.house.doorLevel,
          hp: this.house.doorHp
        });
      }
    }
  }

  handleRepairDoor() {
    const repairCostGold = 30;
    if (this.gold >= repairCostGold && this.house.doorHp < this.house.doorMaxHp) {
      this.gold -= repairCostGold;
      this.house.repairDoor(60);
      audio.playUpgradeSound();
      this.updateDoorModalUI();
      this.updateHud();
      this.showFloatingAlert('Door repaired +60 HP!', 'green');

      if (this.network) {
        this.network.broadcast({
          type: 'DOOR_ACTION',
          action: 'repair',
          hp: this.house.doorHp
        });
      }
    }
  }

  openBedModal() {
    const modal = document.getElementById('bed-modal');
    modal.classList.remove('hidden');
    this.updateBedModalUI();
  }

  updateBedModalUI() {
    const curr = this.bedUpgrades[this.house.bedLevel - 1];
    const next = this.bedUpgrades[this.house.bedLevel];

    document.getElementById('bm-bed-name').innerText = curr.name;
    document.getElementById('bm-bed-rates').innerText = `+${curr.xpRate} XP/s  •  +${curr.goldRate} Gold/s`;

    const upBtn = document.getElementById('bm-upgrade-btn');
    if (next) {
      document.getElementById('bm-next-name').innerText = next.name;
      document.getElementById('bm-next-rates').innerText = `+${next.xpRate} XP/s  •  +${next.goldRate} Gold/s`;
      document.getElementById('bm-upgrade-cost').innerText = `${next.costGold} Gold`;

      const canUp = this.gold >= next.costGold;
      upBtn.disabled = !canUp;
      upBtn.style.opacity = canUp ? '1' : '0.5';
    } else {
      document.getElementById('bm-next-name').innerText = 'MAX LEVEL REACHED';
      document.getElementById('bm-next-rates').innerText = '';
      document.getElementById('bm-upgrade-cost').innerText = '—';
      upBtn.disabled = true;
      upBtn.style.opacity = '0.5';
    }
  }

  handleUpgradeBed() {
    const next = this.bedUpgrades[this.house.bedLevel];
    if (next && this.gold >= next.costGold) {
      this.gold -= next.costGold;
      this.house.bedLevel++;
      audio.playUpgradeSound();
      this.updateBedModalUI();
      this.updateHud();
      this.showFloatingAlert(`Bed upgraded to ${next.name}!`, 'green');
    }
  }

  openTurretModal() {
    const modal = document.getElementById('turret-modal');
    modal.classList.remove('hidden');
    this.updateTurretModalUI();
  }

  updateTurretModalUI() {
    const lvl = this.defenses.turretLevel;
    const names = ['No Turret Installed', 'UV Garlic Lantern', 'Arc Light Blaster', 'Cyber Tesla Coil'];
    const costs = [150, 400, 950];

    document.getElementById('tm-curr-name').innerText = names[lvl];
    const btn = document.getElementById('tm-upgrade-btn');

    if (lvl < 3) {
      const nextCost = costs[lvl];
      document.getElementById('tm-next-name').innerText = names[lvl + 1];
      document.getElementById('tm-cost').innerText = `${nextCost} Gold`;
      const canUp = this.gold >= nextCost;
      btn.disabled = !canUp;
      btn.style.opacity = canUp ? '1' : '0.5';
    } else {
      document.getElementById('tm-next-name').innerText = 'MAX UPGRADE';
      document.getElementById('tm-cost').innerText = '—';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  }

  handleUpgradeTurret() {
    const costs = [150, 400, 950];
    const lvl = this.defenses.turretLevel;
    if (lvl < 3 && this.gold >= costs[lvl]) {
      this.gold -= costs[lvl];
      this.defenses.buildOrUpgrade();
      this.updateTurretModalUI();
      this.updateHud();
      this.showFloatingAlert(`Defense Turret upgraded!`, 'blue');
    }
  }

  updateSleepOverlay(show) {
    const ov = document.getElementById('sleep-overlay');
    if (show) {
      ov.classList.remove('hidden');
    } else {
      ov.classList.add('hidden');
    }
  }

  showFloatingAlert(text, color = 'white') {
    const banner = document.getElementById('floating-alert');
    banner.innerText = text;
    banner.style.color = color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : color === 'blue' ? '#38bdf8' : '#ffffff';
    banner.classList.add('visible');
    setTimeout(() => {
      banner.classList.remove('visible');
    }, 3200);
  }

  updateHud() {
    document.getElementById('hud-xp').innerText = `${this.xp} XP`;
    document.getElementById('hud-gold').innerText = `${this.gold} G`;
    document.getElementById('hud-player-hp').innerText = `${Math.ceil(this.player.hp)} HP`;

    const banner = document.getElementById('wave-banner');
    if (this.phase === 'PREP') {
      banner.className = 'wave-banner prep';
      banner.innerHTML = `<span>PREPARATION PHASE</span> <strong class="time">${Math.ceil(this.prepTimer)}s</strong> <button id="btn-skip-prep" class="skip-btn">⚡ SUMMON EARLY (+25% BONUS)</button>`;
      document.getElementById('btn-skip-prep')?.addEventListener('click', () => {
        this.gold += Math.floor(this.prepTimer * 0.5);
        this.startMonsterWave();
      });
    } else {
      banner.className = 'wave-banner alert';
      banner.innerHTML = `<span class="pulse-text">⚠️ GHOST ATTACKING!</span> <strong class="time">${Math.ceil(this.waveTimer)}s</strong>`;
    }

    const doorPct = Math.max(0, Math.min(100, (this.house.doorHp / this.house.doorMaxHp) * 100));
    const fill = document.getElementById('door-hud-fill');
    fill.style.width = `${doorPct}%`;
    fill.style.backgroundColor = doorPct > 50 ? '#22c55e' : doorPct > 25 ? '#eab308' : '#ef4444';
    document.getElementById('door-hud-text').innerText = `Lvl ${this.house.doorLevel} Door: ${Math.ceil(this.house.doorHp)}/${this.house.doorMaxHp} HP`;

    const promptEl = document.getElementById('interaction-prompt');
    if (this.player.isSleeping) {
      promptEl.innerText = '[E] or [Space] to Wake Up';
      promptEl.style.display = 'block';
    } else if (this.player.currentInteractive) {
      promptEl.innerText = this.player.currentInteractive.prompt;
      promptEl.style.display = 'block';
    } else {
      promptEl.style.display = 'none';
    }
  }

  updateCctvUi() {
    const cam = this.cctv.getCurrentCamInfo();
    document.getElementById('cctv-cam-title').innerText = cam.name;
    document.getElementById('cctv-door-hp').innerText = `DOOR HP: ${Math.ceil(this.house.doorHp)} / ${this.house.doorMaxHp}`;

    const stunBtn = document.getElementById('cctv-stun-btn');
    if (this.cctv.stunCooldown > 0) {
      stunBtn.disabled = true;
      stunBtn.innerText = `FLASH STUN (${Math.ceil(this.cctv.stunCooldown)}s)`;
      stunBtn.style.opacity = '0.5';
    } else {
      stunBtn.disabled = false;
      stunBtn.innerText = '⚡ TRIGGER FLASH STUN';
      stunBtn.style.opacity = '1';
    }
  }

  // Throttled minimap update (runs at 8-10 FPS instead of 60 FPS to prevent canvas lag)
  updateMinimap() {
    const map = document.getElementById('minimap-canvas');
    if (!map) return;
    const ctx = map.getContext('2d');
    const w = map.width;
    const h = map.height;

    ctx.clearRect(0, 0, w, h);

    const toMapX = (wx) => ((wx + 22) / 44) * w;
    const toMapY = (wz) => ((wz + 24) / 48) * h;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;

    // Hallway
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(toMapX(-3), toMapY(-12), toMapX(3) - toMapX(-3), toMapY(12) - toMapY(-12));
    ctx.strokeRect(toMapX(-3), toMapY(-12), toMapX(3) - toMapX(-3), toMapY(12) - toMapY(-12));

    // Bedroom
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(toMapX(10), toMapY(-11), toMapX(22) - toMapX(10), toMapY(0) - toMapY(-11));
    ctx.strokeRect(toMapX(10), toMapY(-11), toMapX(22) - toMapX(10), toMapY(0) - toMapY(-11));

    // Library
    ctx.fillRect(toMapX(3), toMapY(-10), toMapX(10) - toMapX(3), toMapY(0) - toMapY(-10));
    ctx.strokeRect(toMapX(3), toMapY(-10), toMapX(10) - toMapX(3), toMapY(0) - toMapY(-10));

    // Living Room
    ctx.fillRect(toMapX(3), toMapY(0), toMapX(12) - toMapX(3), toMapY(8) - toMapY(0));
    ctx.strokeRect(toMapX(3), toMapY(0), toMapX(12) - toMapX(3), toMapY(8) - toMapY(0));

    // Kitchen & Pantry
    ctx.fillRect(toMapX(-18), toMapY(-1), toMapX(-3) - toMapX(-18), toMapY(7) - toMapY(-1));
    ctx.strokeRect(toMapX(-18), toMapY(-1), toMapX(-3) - toMapX(-18), toMapY(7) - toMapY(-1));

    // Basement & Attic
    ctx.fillRect(toMapX(-4), toMapY(12), toMapX(4) - toMapX(-4), toMapY(22) - toMapY(12));
    ctx.fillRect(toMapX(-4), toMapY(-22), toMapX(4) - toMapX(-4), toMapY(-12) - toMapY(-22));

    // Door position line
    ctx.strokeStyle = this.house.isDoorBroken ? '#ef4444' : '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(toMapX(10), toMapY(-5.6));
    ctx.lineTo(toMapX(10), toMapY(-3.4));
    ctx.stroke();

    // Player position dot (Blue)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(toMapX(this.player.position.x), toMapY(this.player.position.z), 4, 0, Math.PI * 2);
    ctx.fill();

    // Monster position dot (Red)
    if (this.monster.mesh && this.monster.mesh.visible) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(toMapX(this.monster.mesh.position.x), toMapY(this.monster.mesh.position.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  appendChatMessage(data) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span class="time">[${data.time}]</span> <span class="sender">${data.sender}:</span> <span class="text">${data.text}</span>`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
  }

  setupUI() {
    document.getElementById('btn-solo').addEventListener('click', () => this.startSoloGame());
    document.getElementById('btn-mp').addEventListener('click', () => this.openMultiplayerModal());
    document.getElementById('btn-close-mp').addEventListener('click', () => this.closeMultiplayerModal());
    document.getElementById('btn-create-server').addEventListener('click', () => this.handleCreateServer());
    document.getElementById('btn-join-server').addEventListener('click', () => this.handleJoinServer());
    document.getElementById('mp-start-game-btn').addEventListener('click', () => this.startMultiplayerSession());

    document.getElementById('dm-close-btn').addEventListener('click', () => document.getElementById('door-modal').classList.add('hidden'));
    document.getElementById('dm-upgrade-btn').addEventListener('click', () => this.handleUpgradeDoor());
    document.getElementById('dm-repair-btn').addEventListener('click', () => this.handleRepairDoor());

    document.getElementById('bm-close-btn').addEventListener('click', () => document.getElementById('bed-modal').classList.add('hidden'));
    document.getElementById('bm-upgrade-btn').addEventListener('click', () => this.handleUpgradeBed());
    document.getElementById('btn-open-bed-modal').addEventListener('click', () => this.openBedModal());

    document.getElementById('tm-close-btn').addEventListener('click', () => document.getElementById('turret-modal').classList.add('hidden'));
    document.getElementById('tm-upgrade-btn').addEventListener('click', () => this.handleUpgradeTurret());

    document.getElementById('wc-continue-btn').addEventListener('click', () => this.closeWaveClearedModal());
    document.getElementById('go-restart-btn').addEventListener('click', () => this.restartGame());

    document.getElementById('cctv-cam1').addEventListener('click', () => this.cctv.switchCamera(0));
    document.getElementById('cctv-cam2').addEventListener('click', () => this.cctv.switchCamera(1));
    document.getElementById('cctv-cam3').addEventListener('click', () => this.cctv.switchCamera(2));
    document.getElementById('cctv-cam4').addEventListener('click', () => this.cctv.switchCamera(3));
    document.getElementById('cctv-exit-btn').addEventListener('click', () => this.exitCctv());
    document.getElementById('cctv-stun-btn').addEventListener('click', () => {
      this.cctv.triggerRemoteStun();
      this.updateCctvUi();
    });
    document.getElementById('cctv-repair-btn').addEventListener('click', () => {
      if (this.gold >= 30) {
        this.gold -= 30;
        this.cctv.triggerRemoteRepair(20, 50);
        this.updateCctvUi();
        this.updateHud();
      }
    });

    const chatInput = document.getElementById('chat-input');
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        this.network.sendChatMessage(chatInput.value.trim());
        chatInput.value = '';
      }
    });

    document.querySelectorAll('.quick-ping').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-msg');
        this.network.sendChatMessage(text);
      });
    });

    this.setupMobileControls();
  }

  setupMobileControls() {
    const joyContainer = document.getElementById('touch-joystick-zone');
    const stick = document.getElementById('touch-joystick-knob');
    if (!joyContainer || !stick) return;

    let touchId = null;
    let startX = 0, startY = 0;
    const maxRadius = 40;

    joyContainer.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      const rect = joyContainer.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      this.player.touchJoystick.active = true;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchId) {
          const dx = touch.clientX - startX;
          const dy = touch.clientY - startY;
          const dist = Math.min(maxRadius, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);

          const clampedX = Math.cos(angle) * dist;
          const clampedY = Math.sin(angle) * dist;

          stick.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

          this.player.touchJoystick.x = clampedX / maxRadius;
          this.player.touchJoystick.y = -clampedY / maxRadius;
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          touchId = null;
          stick.style.transform = `translate(0px, 0px)`;
          this.player.touchJoystick.active = false;
          this.player.touchJoystick.x = 0;
          this.player.touchJoystick.y = 0;
        }
      }
    };

    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    document.getElementById('m-btn-interact')?.addEventListener('click', () => {
      if (this.player.isSleeping) {
        this.player.wakeUp();
      } else if (this.player.currentInteractive) {
        this.player.onInteract?.(this.player.currentInteractive.action);
      }
    });

    document.getElementById('m-btn-flashlight')?.addEventListener('click', () => {
      this.player.toggleFlashlight();
    });

    document.getElementById('m-btn-sleep')?.addEventListener('click', () => {
      if (this.player.isSleeping) {
        this.player.wakeUp();
      } else {
        this.player.sleep();
        this.updateSleepOverlay(true);
      }
    });
  }

  setupWindowEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.cctv.onResize(w, h);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updateGameLogic(delta);

    this.house.update(delta);
    this.player.update(delta);
    this.monster.update(delta, this.player.position);
    this.cctv.update(delta);
    this.defenses.update(delta);
    this.network.update(delta);

    this.network.syncInterval += delta;
    if (this.network.syncInterval > 0.06) {
      this.network.syncInterval = 0;
      this.network.sendPlayerMove(this.player);

      if (this.network.isHost) {
        this.network.sendGameSync({
          waveLevel: this.waveLevel,
          phase: this.phase,
          prepTimer: this.prepTimer,
          waveTimer: this.waveTimer,
          doorHp: this.house.doorHp,
          doorLevel: this.house.doorLevel
        });
      }
    }

    // Render active camera
    const activeCamera = this.cctv.active ? this.cctv.camera : this.camera;
    this.renderer.render(this.scene, activeCamera);
  }

  updateGameLogic(delta) {
    if (this.player.isSleeping) {
      this.sleepTickTimer += delta;
      if (this.sleepTickTimer >= 1.0) {
        this.sleepTickTimer = 0;
        const currentBed = this.bedUpgrades[this.house.bedLevel - 1];
        this.xp += currentBed.xpRate;
        this.gold += currentBed.goldRate;
        audio.playCoinChime();
        this.updateHud();
      }
    }

    if (this.phase === 'PREP') {
      this.prepTimer -= delta;
      if (this.prepTimer <= 0) {
        this.startMonsterWave();
      }
    } else if (this.phase === 'WAVE') {
      this.waveTimer -= delta;
      if (this.waveTimer <= 0) {
        this.endMonsterWave();
      }
    }

    // Throttle minimap canvas redraws to ~8 FPS to prevent mobile GPU lag
    this.minimapThrottle += delta;
    if (this.minimapThrottle > 0.12) {
      this.minimapThrottle = 0;
      this.updateMinimap();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.init();
});
