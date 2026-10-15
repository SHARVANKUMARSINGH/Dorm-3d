import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class NetworkManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();

    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.serverName = '';
    this.maxPlayers = 4;
    this.localPlayerId = 'p_' + Math.floor(Math.random() * 8999 + 1000);
    this.localPlayerName = 'Survivor ' + Math.floor(Math.random() * 899 + 100);

    this.connections = []; // For Host: list of client DataConnections
    this.hostConnection = null; // For Client: connection to Host

    // BroadcastChannel fallback for multi-tab local testing
    this.broadcastChannel = null;
    try {
      this.broadcastChannel = new BroadcastChannel('dorm3d_lan_network');
      this.broadcastChannel.onmessage = (e) => this.handleIncomingMessage(e.data, null);
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // Remote players registry
    this.remotePlayers = new Map(); // id -> { id, name, mesh, mixer, actions, targetPos, targetRot, state }

    // Rigged soldier model template
    this.soldierTemplate = null;
    this.soldierAnimations = [];
    this.loadCharacterModel();

    // Callbacks
    this.onStateUpdate = null;
    this.onChatReceived = null;
    this.onPlayerCountChanged = null;

    // Send interval
    this.syncInterval = 0;
  }

  async loadCharacterModel() {
    try {
      const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(base + 'models/Soldier.glb', resolve, undefined, reject);
      });
      this.soldierTemplate = gltf.scene;
      this.soldierAnimations = gltf.animations || [];

      // Scale template to ~1.8m
      const box = new THREE.Box3().setFromObject(this.soldierTemplate);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetHeight = 1.8;
      const scale = targetHeight / (size.y || 1);
      this.soldierTemplate.scale.set(scale, scale, scale);
    } catch (err) {
      console.warn('Failed to load Soldier.glb template:', err);
    }
  }

  async createServer(serverName, maxPlayers, customCode = null) {
    this.isHost = true;
    this.serverName = serverName || 'Dorm Sanctuary';
    this.maxPlayers = parseInt(maxPlayers) || 4;
    this.roomCode = customCode ? customCode.toUpperCase() : 'DORM-' + Math.floor(Math.random() * 8999 + 1000);

    const peerId = 'dorm3d-' + this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
      const peerModule = await import('peerjs');
      const Peer = peerModule.Peer || peerModule.default?.Peer || peerModule.default;

      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('Host Peer open:', id, 'Room:', this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        console.log('Client connected to Host:', conn.peer);
        if (this.connections.length + 1 >= this.maxPlayers) {
          conn.send({ type: 'SERVER_FULL' });
          conn.close();
          return;
        }

        this.connections.push(conn);
        conn.on('data', (data) => this.handleIncomingMessage(data, conn));
        conn.on('close', () => this.handleClientDisconnect(conn));

        // Welcome client
        conn.on('open', () => {
          conn.send({
            type: 'WELCOME',
            serverName: this.serverName,
            maxPlayers: this.maxPlayers,
            hostId: this.localPlayerId
          });
          this.broadcastPlayerList();
        });
      });

      this.peer.on('error', (err) => {
        console.warn('Host Peer warning:', err);
      });
    } catch (e) {
      console.warn('PeerJS init failed, continuing in LAN BroadcastChannel mode:', e);
    }

    return this.roomCode;
  }

  async joinServer(roomCode, playerName) {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    if (playerName) this.localPlayerName = playerName;

    const hostPeerId = 'dorm3d-' + this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
      const peerModule = await import('peerjs');
      const Peer = peerModule.Peer || peerModule.default?.Peer || peerModule.default;

      this.peer = new Peer(null, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // If PeerJS takes too long, fall back to BroadcastChannel for local network
          resolve({ ok: true, roomCode: this.roomCode, mode: 'local' });
        }, 3500);

        this.peer.on('open', () => {
          const conn = this.peer.connect(hostPeerId, { reliable: true });
          this.hostConnection = conn;

          conn.on('open', () => {
            clearTimeout(timeout);
            console.log('Connected to Host!');
            conn.send({
              type: 'PLAYER_JOIN',
              id: this.localPlayerId,
              name: this.localPlayerName
            });
            resolve({ ok: true, roomCode: this.roomCode, mode: 'p2p' });
          });

          conn.on('data', (data) => this.handleIncomingMessage(data, conn));
          conn.on('close', () => {
            console.log('Disconnected from host');
            this.handleHostDisconnect();
          });
        });

        this.peer.on('error', (err) => {
          console.warn('Peer error joining:', err);
          clearTimeout(timeout);
          resolve({ ok: true, roomCode: this.roomCode, mode: 'local' });
        });
      });
    } catch (e) {
      console.warn('PeerJS connection failed, using local BroadcastChannel:', e);
      return { ok: true, roomCode: this.roomCode, mode: 'local' };
    }
  }

  handleIncomingMessage(data, senderConn) {
    if (!data || !data.type) return;

    if (data.type === 'PLAYER_MOVE') {
      if (data.id === this.localPlayerId) return;
      this.updateRemotePlayer(data);

      // If Host, relay to other peers
      if (this.isHost) {
        this.broadcast(data, senderConn);
      }
    } else if (data.type === 'GAME_SYNC') {
      // Sync from host
      if (!this.isHost && this.onStateUpdate) {
        this.onStateUpdate(data);
      }
    } else if (data.type === 'CHAT_MESSAGE') {
      if (this.onChatReceived) {
        this.onChatReceived(data);
      }
      if (this.isHost) {
        this.broadcast(data, senderConn);
      }
    } else if (data.type === 'DOOR_ACTION') {
      if (this.onDoorAction) {
        this.onDoorAction(data);
      }
      if (this.isHost) {
        this.broadcast(data, senderConn);
      }
    } else if (data.type === 'PLAYER_LEAVE') {
      this.removeRemotePlayer(data.id);
      if (this.isHost) {
        this.broadcast(data, senderConn);
      }
    }
  }

  updateRemotePlayer(data) {
    let p = this.remotePlayers.get(data.id);
    if (!p) {
      p = this.createRemotePlayerMesh(data.id, data.name || 'Survivor');
      this.remotePlayers.set(data.id, p);
      this.onPlayerCountChanged?.(this.remotePlayers.size + 1);
    }

    if (p) {
      p.targetPos.set(data.x, data.y, data.z);
      p.targetRot = data.rot;
      p.isSleeping = data.isSleeping;
      p.state = data.state;
    }
  }

  createRemotePlayerMesh(id, name) {
    const group = new THREE.Group();

    let meshInstance;
    let mixer = null;
    let actions = {};

    if (this.soldierTemplate) {
      meshInstance = this.soldierTemplate.clone();
      meshInstance.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      group.add(meshInstance);

      if (this.soldierAnimations.length > 0) {
        mixer = new THREE.AnimationMixer(meshInstance);
        this.soldierAnimations.forEach(clip => {
          actions[clip.name] = mixer.clipAction(clip);
        });
        if (actions['Idle']) actions['Idle'].play();
      }
    } else {
      // Procedural player placeholder
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
      );
      body.position.y = 0.8;
      group.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffedd5 })
      );
      head.position.y = 1.7;
      group.add(head);
    }

    // Floating 3D Nametag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.roundRect ? ctx.roundRect(10, 10, 236, 44, 8) : ctx.fillRect(10, 10, 236, 44);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = 2.1;
    group.add(sprite);

    this.scene.add(group);

    return {
      id,
      name,
      mesh: group,
      mixer,
      actions,
      currentAction: 'Idle',
      targetPos: new THREE.Vector3(14, 0, -7),
      targetRot: 0,
      state: 'idle',
      isSleeping: false
    };
  }

  removeRemotePlayer(id) {
    const p = this.remotePlayers.get(id);
    if (p) {
      this.scene.remove(p.mesh);
      this.remotePlayers.delete(id);
      this.onPlayerCountChanged?.(this.remotePlayers.size + 1);
    }
  }

  handleClientDisconnect(conn) {
    this.connections = this.connections.filter(c => c !== conn);
    this.broadcastPlayerList();
  }

  handleHostDisconnect() {
    this.hostConnection = null;
    alert('Host disconnected from server.');
  }

  broadcastPlayerList() {
    const count = this.connections.length + 1;
    this.onPlayerCountChanged?.(count);
  }

  broadcast(data, excludeConn = null) {
    // Send to peer connections
    this.connections.forEach(conn => {
      if (conn !== excludeConn && conn.open) {
        conn.send(data);
      }
    });

    // Also broadcast to local channel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(data);
      } catch (e) {}
    }
  }

  sendToHost(data) {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(data);
      } catch (e) {}
    }
  }

  sendPlayerMove(player) {
    const data = {
      type: 'PLAYER_MOVE',
      id: this.localPlayerId,
      name: this.localPlayerName,
      x: player.position.x,
      y: player.position.y - 1.7, // Feet level
      z: player.position.z,
      rot: player.yaw,
      state: player.isSleeping ? 'sleeping' : (player.velocity.lengthSq() > 0.1 ? 'walking' : 'idle'),
      isSleeping: player.isSleeping
    };

    if (this.isHost) {
      this.broadcast(data);
    } else {
      this.sendToHost(data);
    }
  }

  sendGameSync(gameState) {
    if (!this.isHost) return;
    const data = {
      type: 'GAME_SYNC',
      ...gameState
    };
    this.broadcast(data);
  }

  sendChatMessage(text) {
    const data = {
      type: 'CHAT_MESSAGE',
      sender: this.localPlayerName,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (this.onChatReceived) {
      this.onChatReceived(data);
    }

    if (this.isHost) {
      this.broadcast(data);
    } else {
      this.sendToHost(data);
    }
  }

  update(delta) {
    // Smoothly interpolate remote player positions, rotations, and animations
    this.remotePlayers.forEach(p => {
      p.mesh.position.lerp(p.targetPos, delta * 12);
      p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRot, delta * 10);

      if (p.mixer) {
        p.mixer.update(delta);

        // Update animation action
        let desiredAction = 'Idle';
        if (p.isSleeping) {
          desiredAction = 'TPose';
        } else if (p.state === 'walking' || p.state === 'running') {
          desiredAction = 'Walk';
        }

        if (desiredAction !== p.currentAction && p.actions[desiredAction]) {
          if (p.actions[p.currentAction]) p.actions[p.currentAction].fadeOut(0.2);
          p.actions[desiredAction].reset().fadeIn(0.2).play();
          p.currentAction = desiredAction;
        }
      }
    });
  }
}
