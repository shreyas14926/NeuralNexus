/* ============================================================
   NEURAL NEXUS – Mindscape Odyssey
   A complete browser game created for Open Innovation
   ============================================================ */

(() => {
    // ---------- Canvas & Context ----------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // ---------- DOM ----------
    const scoreEl = document.getElementById('score');
    const comboEl = document.getElementById('combo');
    const ideasEl = document.getElementById('ideas');
    const levelEl = document.getElementById('level');
    const bestScoreEl = document.getElementById('best-score');
    const startScreen = document.getElementById('start-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const menuBtn = document.getElementById('menu-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const pauseMenuBtn = document.getElementById('pause-menu-btn');

    // Ability UI
    const abilityExpand = document.getElementById('ability-expand');
    const abilityFocus = document.getElementById('ability-focus');
    const abilityPulse = document.getElementById('ability-pulse');

    // ---------- State ----------
    let W, H;
    let gameState = 'menu'; // menu | playing | paused | gameover
    let lastTime = 0;
    let animId = null;

    // Player
    const player = {
        x: 0, y: 0,
        radius: 14,
        speed: 280,
        vx: 0, vy: 0,
        angle: 0,
        trail: [],
        invuln: 0,
        focusTimer: 0,
        expandTimer: 0
    };

    // Game values
    let score = 0;
    let ideas = 0;
    let combo = 1;
    let comboTimer = 0;
    let level = 1;
    let bestScore = parseInt(localStorage.getItem('neuralNexusBest') || '0');

    // Entities
    let ideasList = [];
    let corruptions = [];
    let neurons = [];
    let particles = [];
    let connections = [];
    let pulses = [];

    // Timers & cooldowns
    let ideaSpawnTimer = 0;
    let corruptionSpawnTimer = 0;
    let neuronSpawnTimer = 0;
    let expandCD = 0;
    let focusCD = 0;
    let pulseCD = 0;

    // Input
    const keys = {};
    let mouseX = 0, mouseY = 0;

    // ---------- Sound System (Web Audio API – no external files) ----------
    let audioCtx = null;
    let masterGain = null;
    let soundEnabled = true;

    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.35;
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            soundEnabled = false;
        }
    }

    function playTone(freq, duration, type = 'sine', volume = 0.3, slideTo = null) {
        if (!soundEnabled || !audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slideTo !== null) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + duration);
        }
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(audioCtx.currentTime + duration + 0.05);
    }

    function playNoise(duration, volume = 0.15) {
        if (!soundEnabled || !audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        noise.connect(gain);
        gain.connect(masterGain);
        noise.start();
    }

    // Sound presets
    const SFX = {
        collect: () => {
            playTone(880, 0.08, 'sine', 0.25);
            playTone(1320, 0.12, 'sine', 0.18, 1760);
        },
        expand: () => {
            playTone(150, 0.25, 'sine', 0.3, 80);
            playNoise(0.2, 0.1);
        },
        focus: () => {
            playTone(600, 0.15, 'triangle', 0.22, 900);
            playTone(900, 0.2, 'sine', 0.15);
        },
        pulse: () => {
            playTone(120, 0.3, 'sawtooth', 0.2, 40);
            playNoise(0.25, 0.12);
        },
        levelUp: () => {
            playTone(523, 0.1, 'square', 0.2);
            setTimeout(() => playTone(659, 0.1, 'square', 0.2), 100);
            setTimeout(() => playTone(784, 0.15, 'square', 0.25), 200);
            setTimeout(() => playTone(1046, 0.25, 'sine', 0.2), 350);
        },
        hit: () => {
            playTone(180, 0.4, 'sawtooth', 0.3, 60);
            playNoise(0.35, 0.2);
        },
        ui: () => playTone(440, 0.06, 'sine', 0.15)
    };

    // ---------- Resize ----------
    function resize() {
        const container = document.getElementById('game-container');
        W = container.clientWidth;
        H = container.clientHeight;
        canvas.width = W;
        canvas.height = H;
    }
    window.addEventListener('resize', resize);
    resize();

    // ---------- Utility ----------
    function rand(min, max) { return Math.random() * (max - min) + min; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createParticle(x, y, color, count = 8, speed = 120) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const sp = rand(speed * 0.3, speed);
            particles.push({
                x, y,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp,
                life: rand(0.4, 1.0),
                maxLife: 1,
                size: rand(2, 5),
                color
            });
        }
    }

    // ---------- Init / Reset ----------
    function resetGame() {
        score = 0;
        ideas = 0;
        combo = 1;
        comboTimer = 0;
        level = 1;

        player.x = W / 2;
        player.y = H / 2;
        player.vx = 0;
        player.vy = 0;
        player.trail = [];
        player.invuln = 1.5;
        player.focusTimer = 0;
        player.expandTimer = 0;

        ideasList = [];
        corruptions = [];
        neurons = [];
        particles = [];
        connections = [];
        pulses = [];

        ideaSpawnTimer = 0.5;
        corruptionSpawnTimer = 3;
        neuronSpawnTimer = 1;
        expandCD = 0;
        focusCD = 0;
        pulseCD = 0;

        // Seed a few neurons
        for (let i = 0; i < 6; i++) {
            spawnNeuron(true);
        }
        updateHUD();
    }

    // ---------- Spawning ----------
    function spawnIdea() {
        const margin = 60;
        ideasList.push({
            x: rand(margin, W - margin),
            y: rand(margin, H - margin),
            radius: 9,
            pulse: rand(0, Math.PI * 2),
            value: 10 + level * 2,
            collected: false
        });
    }

    function spawnCorruption() {
        const side = Math.floor(rand(0, 4));
        let x, y;
        if (side === 0) { x = rand(0, W); y = -30; }
        else if (side === 1) { x = W + 30; y = rand(0, H); }
        else if (side === 2) { x = rand(0, W); y = H + 30; }
        else { x = -30; y = rand(0, H); }

        const speed = 40 + level * 8 + rand(0, 20);
        corruptions.push({
            x, y,
            radius: 12 + rand(0, 6),
            speed,
            angle: Math.atan2(player.y - y, player.x - x),
            wobble: rand(0, Math.PI * 2),
            life: 1
        });
    }

    function spawnNeuron(initial = false) {
        const margin = 80;
        let x, y, attempts = 0;
        do {
            x = rand(margin, W - margin);
            y = rand(margin, H - margin);
            attempts++;
        } while (attempts < 20 && neurons.some(n => dist({x, y}, n) < 70));

        neurons.push({
            x, y,
            radius: initial ? rand(8, 14) : rand(6, 11),
            pulse: rand(0, Math.PI * 2),
            energy: 1,
            connections: []
        });
    }

    // ---------- Abilities ----------
    function activateExpand() {
        if (expandCD > 0 || gameState !== 'playing') return;
        expandCD = 8;
        player.expandTimer = 2.5;
        createParticle(player.x, player.y, '#0ff', 20, 200);
        SFX.expand();
        // Temporarily enlarge collection radius and push enemies
        corruptions.forEach(c => {
            const d = dist(player, c);
            if (d < 220) {
                const ang = Math.atan2(c.y - player.y, c.x - player.x);
                c.x += Math.cos(ang) * 40;
                c.y += Math.sin(ang) * 40;
            }
        });
    }

    function activateFocus() {
        if (focusCD > 0 || gameState !== 'playing') return;
        focusCD = 10;
        player.focusTimer = 3.5;
        createParticle(player.x, player.y, '#f0f', 15, 100);
        SFX.focus();
    }

    function activatePulse() {
        if (pulseCD > 0 || gameState !== 'playing') return;
        pulseCD = 6;
        pulses.push({
            x: player.x,
            y: player.y,
            radius: 10,
            maxRadius: 280,
            life: 1
        });
        createParticle(player.x, player.y, '#ff0', 12, 180);
        SFX.pulse();
    }

    // ---------- Update ----------
    function update(dt) {
        if (gameState !== 'playing') return;

        // Cooldowns
        expandCD = Math.max(0, expandCD - dt);
        focusCD = Math.max(0, focusCD - dt);
        pulseCD = Math.max(0, pulseCD - dt);
        player.invuln = Math.max(0, player.invuln - dt);
        player.focusTimer = Math.max(0, player.focusTimer - dt);
        player.expandTimer = Math.max(0, player.expandTimer - dt);
        comboTimer = Math.max(0, comboTimer - dt);
        if (comboTimer <= 0) combo = 1;

        // Movement
        let dx = 0, dy = 0;
        if (keys['w'] || keys['ArrowUp']) dy -= 1;
        if (keys['s'] || keys['ArrowDown']) dy += 1;
        if (keys['a'] || keys['ArrowLeft']) dx -= 1;
        if (keys['d'] || keys['ArrowRight']) dx += 1;

        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;
            const speedMult = player.focusTimer > 0 ? 1.55 : 1;
            player.vx = dx * player.speed * speedMult;
            player.vy = dy * player.speed * speedMult;
            player.angle = Math.atan2(dy, dx);
        } else {
            player.vx *= 0.88;
            player.vy *= 0.88;
        }

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.x = clamp(player.x, player.radius, W - player.radius);
        player.y = clamp(player.y, player.radius, H - player.radius);

        // Trail
        player.trail.push({ x: player.x, y: player.y, life: 0.35 });
        if (player.trail.length > 18) player.trail.shift();
        player.trail.forEach(t => t.life -= dt);

        // Spawn timers
        ideaSpawnTimer -= dt;
        if (ideaSpawnTimer <= 0) {
            spawnIdea();
            ideaSpawnTimer = Math.max(0.55, 1.4 - level * 0.06);
        }

        corruptionSpawnTimer -= dt;
        if (corruptionSpawnTimer <= 0) {
            spawnCorruption();
            if (level > 3 && Math.random() < 0.4) spawnCorruption();
            corruptionSpawnTimer = Math.max(1.1, 3.2 - level * 0.15);
        }

        neuronSpawnTimer -= dt;
        if (neuronSpawnTimer <= 0 && neurons.length < 18) {
            spawnNeuron();
            neuronSpawnTimer = 4 + rand(0, 3);
        }

        // Ideas
        ideasList.forEach(idea => {
            idea.pulse += dt * 4;
            const collectRadius = player.expandTimer > 0 ? 55 : 28;
            if (!idea.collected && dist(player, idea) < collectRadius) {
                idea.collected = true;
                ideas++;
                const points = Math.floor(idea.value * combo);
                score += points;
                combo = Math.min(combo + 0.25, 8);
                comboTimer = 2.8;
                createParticle(idea.x, idea.y, '#0ff', 10, 150);
                SFX.collect();
                // Level up every 12 ideas
                if (ideas % 12 === 0) {
                    level++;
                    createParticle(player.x, player.y, '#ff0', 25, 220);
                    SFX.levelUp();
                }
            }
        });
        ideasList = ideasList.filter(i => !i.collected);

        // Corruptions AI
        corruptions.forEach(c => {
            c.wobble += dt * 3;
            // Simple pursuit with slight prediction
            const targetX = player.x + player.vx * 0.15;
            const targetY = player.y + player.vy * 0.15;
            const desired = Math.atan2(targetY - c.y, targetX - c.x);
            // Smooth turn
            let diff = desired - c.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            c.angle += clamp(diff, -2.5 * dt, 2.5 * dt);

            const speedMult = player.focusTimer > 0 ? 0.65 : 1;
            c.x += Math.cos(c.angle) * c.speed * speedMult * dt;
            c.y += Math.sin(c.angle) * c.speed * speedMult * dt;

            // Wobble offset
            c.x += Math.cos(c.wobble) * 12 * dt;
            c.y += Math.sin(c.wobble * 1.3) * 12 * dt;
        });

        // Collision with corruptions
        if (player.invuln <= 0) {
            for (const c of corruptions) {
                if (dist(player, c) < player.radius + c.radius - 4) {
                    // Hit!
                    createParticle(player.x, player.y, '#f44', 18, 200);
                    gameOver();
                    return;
                }
            }
        }

        // Pulses damage / push corruptions
        pulses.forEach(p => {
            p.radius += 320 * dt;
            p.life -= dt * 1.2;
            corruptions.forEach(c => {
                const d = dist(p, c);
                if (d < p.radius && d > p.radius - 40) {
                    const ang = Math.atan2(c.y - p.y, c.x - p.x);
                    c.x += Math.cos(ang) * 90 * dt;
                    c.y += Math.sin(ang) * 90 * dt;
                    c.life -= 0.4 * dt;
                }
            });
        });
        pulses = pulses.filter(p => p.life > 0);
        corruptions = corruptions.filter(c => c.life > 0.05 && c.x > -80 && c.x < W + 80 && c.y > -80 && c.y < H + 80);

        // Neurons pulse
        neurons.forEach(n => n.pulse += dt * 2.5);

        // Particles
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.life -= dt;
        });
        particles = particles.filter(p => p.life > 0);

        // Update ability UI
        updateAbilityUI();
        updateHUD();
    }

    function updateHUD() {
        scoreEl.textContent = Math.floor(score);
        comboEl.textContent = 'x' + combo.toFixed(1);
        ideasEl.textContent = ideas;
        levelEl.textContent = level;
    }

    function updateAbilityUI() {
        // Expand
        const expPct = expandCD > 0 ? (expandCD / 8) * 100 : 0;
        abilityExpand.querySelector('.ability-cd').style.height = expPct + '%';
        abilityExpand.classList.toggle('ready', expandCD <= 0);

        // Focus
        const focPct = focusCD > 0 ? (focusCD / 10) * 100 : 0;
        abilityFocus.querySelector('.ability-cd').style.height = focPct + '%';
        abilityFocus.classList.toggle('ready', focusCD <= 0);

        // Pulse
        const pulPct = pulseCD > 0 ? (pulseCD / 6) * 100 : 0;
        abilityPulse.querySelector('.ability-cd').style.height = pulPct + '%';
        abilityPulse.classList.toggle('ready', pulseCD <= 0);
    }

    // ---------- Draw ----------
    function draw() {
        // Background
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);

        // Subtle grid
        ctx.strokeStyle = 'rgba(30, 60, 100, 0.15)';
        ctx.lineWidth = 1;
        const gridSize = 50;
        const offsetX = (player.x * 0.02) % gridSize;
        const offsetY = (player.y * 0.02) % gridSize;
        for (let x = -gridSize + offsetX; x < W + gridSize; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = -gridSize + offsetY; y < H + gridSize; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Connections between nearby neurons
        ctx.lineWidth = 1.5;
        for (let i = 0; i < neurons.length; i++) {
            for (let j = i + 1; j < neurons.length; j++) {
                const a = neurons[i], b = neurons[j];
                const d = dist(a, b);
                if (d < 160) {
                    const alpha = 1 - d / 160;
                    ctx.strokeStyle = `rgba(80, 180, 255, ${alpha * 0.35})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
            // Connect to player if close
            const dPlayer = dist(neurons[i], player);
            if (dPlayer < 140) {
                const alpha = 1 - dPlayer / 140;
                ctx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
                ctx.beginPath();
                ctx.moveTo(neurons[i].x, neurons[i].y);
                ctx.lineTo(player.x, player.y);
                ctx.stroke();
            }
        }

        // Neurons
        neurons.forEach(n => {
            const glow = 0.6 + 0.4 * Math.sin(n.pulse);
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(50, 150, 255, ${0.15 * glow})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 200, 255, ${0.7 * glow})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(150, 230, 255, ${0.9})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // Ideas
        ideasList.forEach(idea => {
            const s = 1 + 0.15 * Math.sin(idea.pulse);
            ctx.beginPath();
            ctx.arc(idea.x, idea.y, idea.radius * s + 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 220, 0.12)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(idea.x, idea.y, idea.radius * s, 0, Math.PI * 2);
            ctx.fillStyle = '#0ff';
            ctx.shadowColor = '#0ff';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Inner core
            ctx.beginPath();
            ctx.arc(idea.x, idea.y, idea.radius * s * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        });

        // Pulses
        pulses.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 100, ${p.life * 0.7})`;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * 0.7, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 200, 50, ${p.life * 0.4})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Corruptions
        corruptions.forEach(c => {
            // Outer glow
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.radius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 40, 60, 0.15)';
            ctx.fill();

            // Body
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#e23';
            ctx.shadowColor = '#f00';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Spikes / detail
            ctx.strokeStyle = '#f66';
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                const a = c.wobble + (i / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(c.x + Math.cos(a) * c.radius * 0.5, c.y + Math.sin(a) * c.radius * 0.5);
                ctx.lineTo(c.x + Math.cos(a) * (c.radius + 4), c.y + Math.sin(a) * (c.radius + 4));
                ctx.stroke();
            }
        });

        // Player trail
        player.trail.forEach((t, i) => {
            if (t.life <= 0) return;
            const alpha = t.life / 0.35;
            ctx.beginPath();
            ctx.arc(t.x, t.y, player.radius * 0.5 * alpha, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.35})`;
            ctx.fill();
        });

        // Player
        const pGlow = player.invuln > 0 ? (Math.sin(Date.now() * 0.02) > 0 ? 0.4 : 0.9) : 1;
        if (player.expandTimer > 0) {
            ctx.beginPath();
            ctx.arc(player.x, player.y, 50, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 * player.expandTimer})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (player.focusTimer > 0) {
            ctx.beginPath();
            ctx.arc(player.x, player.y, 22, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 100, 255, ${0.5 * player.focusTimer})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 255, ${0.2 * pGlow})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 255, ${0.85 * pGlow})`;
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Core
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Particles
        particles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', '');
            // Simple color handling
            if (p.color.startsWith('#')) {
                ctx.fillStyle = hexToRgba(p.color, alpha);
            } else {
                ctx.fillStyle = p.color;
            }
            ctx.fill();
        });
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ---------- Game Loop ----------
    function loop(timestamp) {
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        update(dt);
        draw();

        animId = requestAnimationFrame(loop);
    }

    // ---------- Game Flow ----------
    function startGame() {
        resetGame();
        gameState = 'playing';
        startScreen.classList.add('hidden');
        gameoverScreen.classList.add('hidden');
        pauseScreen.classList.add('hidden');
        lastTime = performance.now();
        if (!animId) animId = requestAnimationFrame(loop);
    }

    function gameOver() {
        gameState = 'gameover';
        SFX.hit();
        if (score > bestScore) {
            bestScore = Math.floor(score);
            localStorage.setItem('neuralNexusBest', bestScore);
        }
        document.getElementById('final-score').textContent = Math.floor(score);
        document.getElementById('final-ideas').textContent = ideas;
        document.getElementById('final-level').textContent = level;
        bestScoreEl.textContent = bestScore;
        gameoverScreen.classList.remove('hidden');
    }

    function returnToMenu() {
        gameState = 'menu';
        startScreen.classList.remove('hidden');
        gameoverScreen.classList.add('hidden');
        pauseScreen.classList.add('hidden');
        bestScoreEl.textContent = bestScore;
    }

    function togglePause() {
        if (gameState === 'playing') {
            gameState = 'paused';
            pauseScreen.classList.remove('hidden');
        } else if (gameState === 'paused') {
            gameState = 'playing';
            pauseScreen.classList.add('hidden');
            lastTime = performance.now();
        }
    }

    // ---------- Input ----------
    window.addEventListener('keydown', e => {
        initAudio();
        keys[e.key.toLowerCase()] = true;
        keys[e.key] = true;

        if (e.key === 'e' || e.key === 'E') activateExpand();
        if (e.key === 'f' || e.key === 'F') activateFocus();
        if (e.key === 'q' || e.key === 'Q') activatePulse();
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
            if (gameState === 'playing' || gameState === 'paused') togglePause();
        }
    });

    window.addEventListener('keyup', e => {
        keys[e.key.toLowerCase()] = false;
        keys[e.key] = false;
    });

    // Ability clicks
    abilityExpand.addEventListener('click', () => { initAudio(); activateExpand(); });
    abilityFocus.addEventListener('click', () => { initAudio(); activateFocus(); });
    abilityPulse.addEventListener('click', () => { initAudio(); activatePulse(); });

    // Buttons
    function withSound(fn) {
        return () => {
            initAudio();
            SFX.ui();
            fn();
        };
    }

    startBtn.addEventListener('click', withSound(startGame));
    restartBtn.addEventListener('click', withSound(startGame));
    menuBtn.addEventListener('click', withSound(returnToMenu));
    resumeBtn.addEventListener('click', withSound(() => {
        gameState = 'playing';
        pauseScreen.classList.add('hidden');
        lastTime = performance.now();
    }));
    pauseMenuBtn.addEventListener('click', withSound(returnToMenu));

    // ---------- Boot ----------
    bestScoreEl.textContent = bestScore;
    // Initial draw of background while in menu
    function menuLoop(ts) {
        if (gameState === 'menu' || gameState === 'gameover') {
            // Soft ambient animation
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, W, H);
            // Floating ambient neurons
            const t = ts * 0.001;
            for (let i = 0; i < 12; i++) {
                const x = W * 0.5 + Math.cos(t * 0.3 + i * 1.7) * (120 + i * 25);
                const y = H * 0.5 + Math.sin(t * 0.25 + i * 1.3) * (80 + i * 18);
                ctx.beginPath();
                ctx.arc(x, y, 4 + (i % 3), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(80, 180, 255, ${0.15 + 0.1 * Math.sin(t + i)})`;
                ctx.fill();
            }
        }
        requestAnimationFrame(menuLoop);
    }
    requestAnimationFrame(menuLoop);

    // Start main loop only when playing, but keep it running
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);

})();
