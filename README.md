# Dorm-3d: Haunted Dorm Survival Simulator

A web-based 3D first-person survival simulator inspired by the "Haunted Dorm" tower-defense game genre, built with Three.js, Web Audio API, and PeerJS.

## Features
- **Custom Ghost Monster**: Uses the custom 3D ghost model (`monster.glb`), with procedural floating physics, glowing eyes, red smoke particle trails, and door lunging attacks.
- **House Layout**: Realistic low-poly house with central Hallway, Attic, Basement stairs (monster spawn), Kitchen, Pantry, Living Room, Library, and Fortified Bedroom.
- **Sleep to Earn**: Sleep in the bed to passively generate XP and Gold every second.
- **Door Defense & Upgrades**: Fortify your bedroom door through 5 levels (Wooden Door &rarr; Reinforced Wood &rarr; Iron Clad &rarr; Steel Blast Vault &rarr; Titanium Cyber Shield).
- **CCTV Security System**: 4 switchable security cameras outside your door, hallway, living room, and attic with CRT scanlines, live timestamp, remote flash UV stun, and remote door repairs.
- **Defense Turrets**: Build UV Garlic Lanterns, Arc Blasters, and Tesla Coils to shoot projectiles at the ghost.
- **Wave System**: Monster attacks every 60s for 20 to 78 seconds depending on level.
- **Multiplayer P2P (Wi-Fi / LAN / Hotspot)**: Host or join rooms directly in-browser using WebRTC DataChannels with 3D rigged avatars, floating nametags, and in-game survivor chat.

## Controls
- **WASD / Arrow Keys**: Move
- **Mouse / Touch Drag**: Look around
- **Shift**: Sprint
- **Space**: Jump / Wake Up
- **E**: Interact (Sleep in bed, Fortify door, Open CCTV, Build Turret)
- **F**: Flashlight Toggle
- **ESC**: Exit CCTV / Close Modals

## Quick Start
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.
