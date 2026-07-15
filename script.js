/* ==========================================================================
   CYBERHAND HUD - CORE SCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('output-canvas');
    const ctx = canvas.getContext('2d');
    const cameraLoading = document.getElementById('camera-loading');
    const onboardingModal = document.getElementById('onboarding-modal');
    const closeOnboardingBtn = document.getElementById('close-onboarding-btn');
    
    // Controls & Settings
    const cameraSelect = document.getElementById('camera-select');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const toggleMirrorBtn = document.getElementById('toggle-mirror-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    
    // Stats Panel
    const fpsVal = document.getElementById('fps-val');
    const handsVal = document.getElementById('hands-val');
    const gestureVal = document.getElementById('gesture-val');
    
    // Toast Notification
    const gestureToast = document.getElementById('gesture-toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastText = document.getElementById('toast-text');
    
    // Mode Settings Groups
    const settingsDrawing = document.getElementById('settings-drawing');
    const settingsSynth = document.getElementById('settings-synth');
    const settingsBubble = document.getElementById('settings-bubble');
    
    // Drawing Mode Controls
    const colorBtns = document.querySelectorAll('.color-btn');
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeVal = document.getElementById('brush-size-val');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    
    // Synth Mode Controls
    const synthWaveformSelect = document.getElementById('synth-waveform');
    
    // Bubble Game Controls & HUD
    const gameHudOverlay = document.getElementById('game-hud-overlay');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const gameScoreVal = document.getElementById('game-score');
    const gameTimerVal = document.getElementById('game-timer');
    const gameComboVal = document.getElementById('game-combo');
    const startGameBtn = document.getElementById('start-game-btn');
    const restartGameBtn = document.getElementById('restart-game-btn');
    const finalScoreVal = document.getElementById('final-score');

    // --- State Variables ---
    let activeMode = 'visualizer'; // visualizer, drawing, synth, bubble
    let cameraActive = false;
    let isMirrored = true;
    let localStream = null;
    let handsModel = null;
    let isHandsLoaded = false;
    let videoPlaying = false;
    
    // Performance Variables
    let fps = 0;
    let frameCount = 0;
    let lastFpsUpdateTime = 0;
    let lastFrameTime = 0;

    // Gesture Tracking State
    let lastToastGesture = '';
    let toastTimeout = null;
    let fistHoldStartTime = null; // To clear canvas on fist hold

    // Drawing Mode States
    let currentColor = '#ff007f';
    let brushSize = 8;
    let drawingLines = []; // Array of { color, size, points: [{x, y}] }
    let isPinching = false;
    
    // Synth Mode States
    let audioCtx = null;
    let synthKeys = [];
    const notes = [
        { name: 'ĐỒ', freq: 261.63, color: '#ff007f' },
        { name: 'RÊ', freq: 293.66, color: '#ff5500' },
        { name: 'MI', freq: 329.63, color: '#ffaa00' },
        { name: 'FA', freq: 349.23, color: '#39ff14' },
        { name: 'SON', freq: 392.00, color: '#00f3ff' },
        { name: 'LA', freq: 440.00, color: '#0055ff' },
        { name: 'SI', freq: 493.88, color: '#aa00ff' },
        { name: 'ĐỐ', freq: 523.25, color: '#ff00f0' }
    ];
    let keyCooldowns = Array(notes.length).fill(0); // cooldown timestamp for each key

    // Bubble Pop Game States
    let gameActive = false;
    let gameScore = 0;
    let gameTimeRemaining = 60;
    let gameTimerInterval = null;
    let gameCombo = 1;
    let gameComboTimeout = null;
    let bubbles = [];
    let popSoundCooldown = 0;
    
    // Particle Systems
    let particles = []; // for general visuals
    let popParticles = []; // for bubble explosions
    let fingertipTrails = {}; // id -> array of trailing points

    // Hand Connections Mapping for skeleton drawing
    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // Index
        [5, 9], [9, 10], [10, 11], [11, 12], // Middle
        [9, 13], [13, 14], [14, 15], [15, 16], // Ring
        [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
        [0, 17] // Palm bottom
    ];

    // --- Onboarding Modal ---
    setTimeout(() => {
        onboardingModal.classList.add('show');
    }, 300);

    closeOnboardingBtn.addEventListener('click', () => {
        onboardingModal.classList.remove('show');
        initWebcam().then(() => {
            if (!isHandsLoaded) {
                initMediaPipe();
            }
        });
    });

    // --- MediaPipe Hands Initializer ---
    function initMediaPipe() {
        showToast('⚙️', 'Đang tải mô hình AI...');
        
        handsModel = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        handsModel.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        handsModel.onResults(onHandResults);
        isHandsLoaded = true;
        showToast('🚀', 'AI sẵn sàng! Đang khởi động camera...');
        
        // Start processing loop
        requestAnimationFrame(processVideoFrame);
    }

    // --- Web Audio Synthesizer Engine ---
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSynthNote(freq) {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = synthWaveformSelect.value;
        osc.frequency.setValueAtTime(freq, now);
        
        // Anti-click volume envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6); // decay/release
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + 0.6);
    }

    function playPopSound() {
        // Prevent sound spamming in the same frame
        const now = Date.now();
        if (now - popSoundCooldown < 80) return;
        popSoundCooldown = now;

        initAudio();
        const audioNow = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        // Short pitch sweep (from 350Hz up to 900Hz)
        osc.frequency.setValueAtTime(350, audioNow);
        osc.frequency.exponentialRampToValueAtTime(900, audioNow + 0.08);

        gainNode.gain.setValueAtTime(0.15, audioNow);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioNow + 0.08);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(audioNow);
        osc.stop(audioNow + 0.08);
    }

    // --- Sound Effects and Tone Generator (UI alerts) ---
    function playUIAudio(type) {
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            if (type === 'success') {
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.setValueAtTime(0.1, now + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'gameover') {
                osc.frequency.setValueAtTime(392.00, now); // G4
                osc.frequency.setValueAtTime(293.66, now + 0.15); // D4
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.setValueAtTime(0.15, now + 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            }
        } catch (e) {
            console.warn("Audio context not enabled yet");
        }
    }

    // --- Webcam Handler ---
    async function initWebcam() {
        cameraLoading.classList.remove('hidden');
        cameraLoading.querySelector('p').textContent = 'Đang khởi động Camera...';
        cameraLoading.querySelector('.spinner').style.display = 'block';

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        const deviceId = cameraSelect.value;
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = localStream;
            
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    videoPlaying = true;
                    cameraActive = true;
                    
                    // Adjust canvas matching the actual video aspect ratio
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    
                    // Show mirrored if enabled
                    if (isMirrored) {
                        canvas.classList.add('mirrored');
                    } else {
                        canvas.classList.remove('mirrored');
                    }
                    
                    cameraLoading.classList.add('hidden');
                    toggleCameraBtn.textContent = 'Tắt Camera';
                    toggleCameraBtn.className = 'action-btn btn-danger';
                    
                    populateCameraList();
                    resolve();
                };
            });
        } catch (err) {
            console.error('Error starting camera:', err);
            cameraLoading.querySelector('.spinner').style.display = 'none';
            cameraLoading.querySelector('p').innerHTML = `
                <span style="color: var(--cyber-pink)">Không thể truy cập camera!</span><br>
                Hãy chắc chắn đã cấp quyền camera cho trang web và không có ứng dụng nào khác đang sử dụng nó.
            `;
            toggleCameraBtn.textContent = 'Bật Camera';
            toggleCameraBtn.className = 'action-btn btn-success';
            cameraActive = false;
        }
    }

    async function populateCameraList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            const currentSelection = cameraSelect.value;
            cameraSelect.innerHTML = '';
            
            if (videoDevices.length === 0) {
                cameraSelect.innerHTML = '<option value="">Không tìm thấy camera</option>';
                return;
            }
            
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${index + 1}`;
                if (device.deviceId === currentSelection) {
                    option.selected = true;
                }
                cameraSelect.appendChild(option);
            });
        } catch (e) {
            console.error("Could not populate camera list", e);
        }
    }

    // Camera Control Actions
    toggleCameraBtn.addEventListener('click', () => {
        if (cameraActive) {
            // Stop
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            videoPlaying = false;
            cameraActive = false;
            toggleCameraBtn.textContent = 'Bật Camera';
            toggleCameraBtn.className = 'action-btn btn-success';
            cameraLoading.classList.remove('hidden');
            cameraLoading.querySelector('p').textContent = 'Camera đã tắt.';
            cameraLoading.querySelector('.spinner').style.display = 'none';
            
            // Clear screen
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            initWebcam();
        }
    });

    toggleMirrorBtn.addEventListener('click', () => {
        isMirrored = !isMirrored;
        if (isMirrored) {
            canvas.classList.add('mirrored');
        } else {
            canvas.classList.remove('mirrored');
        }
        showToast('🔄', isMirrored ? 'Đã bật chế độ lật gương' : 'Đã tắt chế độ lật gương');
    });

    cameraSelect.addEventListener('change', () => {
        if (cameraActive) {
            initWebcam();
        }
    });

    // --- On-frame Processing Loop ---
    let lastDetectionTime = 0;
    async function processVideoFrame() {
        if (!cameraActive || !videoPlaying) {
            requestAnimationFrame(processVideoFrame);
            return;
        }

        const now = performance.now();
        // Control model input rate to avoid CPU overload, run at maximum video rate (~30fps)
        if (now - lastDetectionTime >= 30) {
            lastDetectionTime = now;
            try {
                // Send raw video element to MediaPipe
                await handsModel.send({ image: video });
            } catch (err) {
                console.error("MediaPipe detection error:", err);
            }
        }
        
        // Compute FPS
        frameCount++;
        if (now - lastFpsUpdateTime >= 1000) {
            fps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
            fpsVal.textContent = fps;
            frameCount = 0;
            lastFpsUpdateTime = now;
        }

        requestAnimationFrame(processVideoFrame);
    }

    // --- Helper Math Functions ---
    function getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    function getHandScreenCoords(landmark) {
        let x = landmark.x;
        // If canvas is mirrored via CSS, we map coordinates to correct sides
        // If mirrored: X=0 on sensor goes to right side of screen, i.e., 1-X
        if (isMirrored) {
            x = 1 - x;
        }
        return {
            x: x * canvas.width,
            y: landmark.y * canvas.height
        };
    }

    // --- Rule-Based Gesture Detection ---
    function detectHandGesture(landmarks) {
        // Finger TIP, PIP and MCP joints indices for local distance measurements
        // Index: 8 (Tip), 6 (PIP), 5 (MCP)
        // Middle: 12 (Tip), 10 (PIP), 9 (MCP)
        // Ring: 16 (Tip), 14 (PIP), 13 (MCP)
        // Pinky: 20 (Tip), 18 (PIP), 17 (MCP)
        // Thumb: 4 (Tip), 3 (IP), 2 (MCP)
        
        // Calculate finger extension status using distance relative to finger bases (MCP)
        // A finger is extended if the tip is far from the base compared to the PIP joint.
        const f1 = getDistance(landmarks[8], landmarks[5]) > getDistance(landmarks[6], landmarks[5]) * 1.3; // Index
        const f2 = getDistance(landmarks[12], landmarks[9]) > getDistance(landmarks[10], landmarks[9]) * 1.3; // Middle
        const f3 = getDistance(landmarks[16], landmarks[13]) > getDistance(landmarks[14], landmarks[13]) * 1.3; // Ring
        const f4 = getDistance(landmarks[20], landmarks[17]) > getDistance(landmarks[18], landmarks[17]) * 1.3; // Pinky

        // For Thumb: extended if it's far from the index MCP (5) and pinky MCP (17)
        const f0 = getDistance(landmarks[4], landmarks[5]) > getDistance(landmarks[3], landmarks[5]) * 1.1 && 
                   getDistance(landmarks[4], landmarks[17]) > getDistance(landmarks[2], landmarks[17]) * 1.1;

        // Gestures classification (Ordering is important to prevent overlaps)
        
        // 1. FIST (All folded)
        if (!f1 && !f2 && !f3 && !f4) {
            return 'Nắm Tay (Fist)';
        }

        const thumbIndexDist = getDistance(landmarks[4], landmarks[8]);

        // 2. OK SIGN (Thumb and Index tips close, and others extended)
        if (thumbIndexDist < 0.045 && f2 && f3 && f4) {
            return 'Cử Chỉ OK';
        }

        // 3. PINCH / MOUSE CLICK (Thumb and Index tips very close)
        if (thumbIndexDist < 0.045) {
            return 'Chụm Tay (Pinch)';
        }

        // 4. POINTING (Index extended, others folded)
        if (f1 && !f2 && !f3 && !f4) {
            return 'Chỉ Tay (Pointing)';
        }

        // 5. VICTORY / PEACE (Index & Middle extended, others folded)
        if (f1 && f2 && !f3 && !f4) {
            return 'Chiến Thắng (Victory)';
        }

        // 6. DEVIL HORNS / ROCK ON (Index & Pinky extended, middle & ring folded)
        if (f1 && !f2 && !f3 && f4) {
            return 'Mạnh Mẽ (Rock On)';
        }

        // 7. THUMBS UP / THUMBS DOWN (Thumb extended, others folded)
        if (f0 && !f1 && !f2 && !f3 && !f4) {
            if (landmarks[4].y < landmarks[2].y) {
                return 'Thích (Thumbs Up)';
            } else {
                return 'Không Thích (Thumbs Down)';
            }
        }

        // 8. OPEN HAND / PAPER (All extended)
        if (f1 && f2 && f3 && f4) {
            return 'Bàn Tay Mở (Open Hand)';
        }

        return 'Đang Di Chuyển';
    }

    // Toast alerts helper
    function showToast(icon, text) {
        toastIcon.textContent = icon;
        toastText.textContent = text;
        gestureToast.classList.add('show');
        
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            gestureToast.classList.remove('show');
        }, 2000);
    }

    // --- Synth mode virtual keys layout ---
    function updateSynthKeys() {
        const keyWidth = canvas.width / notes.length;
        synthKeys = notes.map((note, index) => {
            return {
                name: note.name,
                freq: note.freq,
                color: note.color,
                x: index * keyWidth,
                y: 0,
                width: keyWidth,
                height: 160,
                isActive: false,
                rippleRadius: 0,
                rippleOpacity: 0
            };
        });
    }

    // --- Particles & Confetti System ---
    function spawnParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                radius: Math.random() * 6 + 2,
                color: color,
                opacity: 1,
                decay: Math.random() * 0.03 + 0.015
            });
        }
    }

    function spawnGamePopParticles(x, y, color) {
        spawnParticles(x, y, color, 15);
        // Spawn floating score indicator
        particles.push({
            x,
            y: y - 20,
            vx: 0,
            vy: -1.5,
            text: `+${10 * gameCombo}`,
            color: '#39ff14',
            opacity: 1,
            decay: 0.02,
            isText: true
        });
    }

    function updateAndDrawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.opacity -= p.decay;

            if (p.opacity <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = p.opacity;
            if (p.isText) {
                ctx.font = 'bold 20px Space Grotesk';
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
                ctx.fillText(p.text, p.x - 15, p.y);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // --- Bubble Game Mechanics ---
    function spawnBubble() {
        if (!gameActive) return;
        
        const radius = Math.random() * 25 + 15; // size 15 to 40
        const x = Math.random() * (canvas.width - radius * 2) + radius;
        const y = canvas.height + radius;
        
        const speedY = Math.random() * 2 + 1.5; // speed 1.5 to 3.5
        const speedX = Math.random() * 0.8 + 0.2; // wobble frequency
        
        // Cyber Colors
        const colors = ['#ff007f', '#00f3ff', '#39ff14', '#ffaa00', '#ff00f0'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        bubbles.push({
            x, y, radius, speedX, speedY, color,
            wobbleOffset: Math.random() * 100,
            pulseScale: 1
        });
        
        // Schedule next spawn with minor randomized interval
        const nextSpawn = Math.random() * 600 + 400; // 400ms - 1000ms
        setTimeout(spawnBubble, nextSpawn);
    }

    function updateAndDrawBubbles(handTips) {
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            
            // Move up and wobble sideways
            b.y -= b.speedY;
            b.wobbleOffset += 0.05;
            b.x += Math.sin(b.wobbleOffset) * b.speedX;
            
            // Check popped by any fingertip
            let popped = false;
            
            for (let tip of handTips) {
                const dist = Math.hypot(tip.x - b.x, tip.y - b.y);
                if (dist < b.radius + 15) { // 15px extra detection offset for easy play
                    popped = true;
                    break;
                }
            }
            
            // Handle pop
            if (popped) {
                playPopSound();
                spawnGamePopParticles(b.x, b.y, b.color);
                
                // Increase combo and score
                gameScore += 10 * gameCombo;
                gameScoreVal.textContent = gameScore;
                
                // Refresh combo
                gameCombo++;
                gameComboVal.textContent = `x${gameCombo}`;
                gameComboVal.parentElement.classList.add('combo-pulse');
                setTimeout(() => gameComboVal.parentElement.classList.remove('combo-pulse'), 300);
                
                if (gameComboTimeout) clearTimeout(gameComboTimeout);
                gameComboTimeout = setTimeout(() => {
                    gameCombo = 1;
                    gameComboVal.textContent = `x${gameCombo}`;
                }, 2500); // Reset combo after 2.5s of no pops
                
                bubbles.splice(i, 1);
                continue;
            }
            
            // Out of bounds
            if (b.y < -b.radius) {
                bubbles.splice(i, 1);
                continue;
            }
            
            // Draw beautiful glass bubble
            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            
            // Neon Glow Border
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 12;
            
            // Radial glass fill
            const grad = ctx.createRadialGradient(
                b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.1,
                b.x, b.y, b.radius
            );
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
            grad.addColorStop(0.9, 'rgba(0,0,0,0)');
            grad.addColorStop(1, b.color.replace(')', ', 0.15)')); // semi-transparent rim
            
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.stroke();
            
            // Draw glossy highlight
            ctx.beginPath();
            ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
            ctx.restore();
        }
    }

    function startGame() {
        if (gameActive) return;
        
        initAudio();
        gameActive = true;
        gameScore = 0;
        gameCombo = 1;
        gameTimeRemaining = 60;
        bubbles = [];
        particles = [];
        
        gameScoreVal.textContent = '0';
        gameTimerVal.textContent = '60s';
        gameComboVal.textContent = 'x1';
        
        gameOverOverlay.classList.add('hidden');
        gameHudOverlay.classList.remove('hidden');
        showToast('🎮', 'Trò chơi bắt đầu! Hãy đập bóng!');
        playUIAudio('success');
        
        // Spawn loop
        spawnBubble();
        
        // Game Timer Countdown
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameTimerInterval = setInterval(() => {
            gameTimeRemaining--;
            gameTimerVal.textContent = `${gameTimeRemaining}s`;
            
            if (gameTimeRemaining <= 0) {
                endGame();
            }
        }, 1000);
    }

    function endGame() {
        gameActive = false;
        clearInterval(gameTimerInterval);
        if (gameComboTimeout) clearTimeout(gameComboTimeout);
        
        finalScoreVal.textContent = gameScore;
        gameOverOverlay.classList.remove('hidden');
        gameHudOverlay.classList.add('hidden');
        showToast('🏁', 'Trò chơi kết thúc!');
        playUIAudio('gameover');
    }

    startGameBtn.addEventListener('click', startGame);
    restartGameBtn.addEventListener('click', startGame);

    // --- Mode Management ---
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            setAppMode(mode);
        });
    });

    function setAppMode(mode) {
        if (activeMode === mode) return;
        
        playUIAudio('success');
        activeMode = mode;
        
        // UI Button classes
        modeBtns.forEach(b => b.classList.remove('active'));
        document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');
        
        // Hide all configurations
        settingsDrawing.classList.add('hidden');
        settingsSynth.classList.add('hidden');
        settingsBubble.classList.add('hidden');
        
        // Hide Game Over overlays if switching modes
        gameOverOverlay.classList.add('hidden');
        gameHudOverlay.classList.add('hidden');
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameActive = false;
        
        // Show specific mode config
        if (mode === 'drawing') {
            settingsDrawing.classList.remove('hidden');
            showToast('🎨', 'Chế độ Vẽ: Chụm ngón cái và ngón trỏ để vẽ');
        } else if (mode === 'synth') {
            settingsSynth.classList.remove('hidden');
            updateSynthKeys();
            showToast('🎹', 'Chế độ Nhạc cụ: Chạm nốt bằng ngón trỏ');
        } else if (mode === 'bubble') {
            settingsBubble.classList.remove('hidden');
            showToast('🫧', 'Chế độ Trò chơi: Chạm bóng để ghi điểm');
        } else {
            showToast('👁️', 'Chế độ Khung Xương: Xem nhận diện tay AI');
        }
    }

    // Color Pickers
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color;
            showToast('🎨', `Màu vẽ đổi thành ${currentColor}`);
        });
    });

    // Brush Size
    brushSizeSlider.addEventListener('input', () => {
        brushSize = brushSizeSlider.value;
        brushSizeVal.textContent = `${brushSize}px`;
    });

    // Clear Canvas Action
    clearCanvasBtn.addEventListener('click', () => {
        drawingLines = [];
        particles = [];
        showToast('🧹', 'Đã xóa toàn bộ nét vẽ!');
    });

    // Resize Event
    window.addEventListener('resize', () => {
        if (cameraActive) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            if (activeMode === 'synth') {
                updateSynthKeys();
            }
        }
    });

    // --- MediaPipe Hands Results Callback ---
    function onHandResults(results) {
        // Clear viewport canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Number of hands detected
        const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        handsVal.textContent = numHands;
        
        // Collect index/finger tip positions for interactive modes
        const fingertipPositions = [];
        let isAnyHandPinching = false;
        let isAnyHandFist = false;

        // Draw camera image inside mirrored viewport (only if camera is active)
        ctx.save();
        if (isMirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (numHands > 0) {
            // Process gestures for first detected hand
            const primaryHandLandmarks = results.multiHandLandmarks[0];
            const activeGesture = detectHandGesture(primaryHandLandmarks);
            gestureVal.textContent = activeGesture;

            // Trigger toast alert for gesture changes
            if (activeGesture !== lastToastGesture && activeGesture !== 'Đang Di Chuyển') {
                lastToastGesture = activeGesture;
                
                let icon = '✨';
                if (activeGesture.includes('Fist')) icon = '✊';
                else if (activeGesture.includes('Pinch')) icon = '🤏';
                else if (activeGesture.includes('OK')) icon = '👌';
                else if (activeGesture.includes('Pointing')) icon = '☝️';
                else if (activeGesture.includes('Victory')) icon = '✌️';
                else if (activeGesture.includes('Rock')) icon = '🤘';
                else if (activeGesture.includes('Thumbs Up')) icon = '👍';
                else if (activeGesture.includes('Thumbs Down')) icon = '👎';
                else if (activeGesture.includes('Open')) icon = '🖐️';
                
                showToast(icon, `Cử chỉ: ${activeGesture}`);
            }

            // Check drawing shortcuts (Fist hold for 2s clears canvas)
            if (activeMode === 'drawing') {
                // Check if any detected hand is Fist
                results.multiHandLandmarks.forEach(landmarks => {
                    const gest = detectHandGesture(landmarks);
                    if (gest.includes('Fist')) {
                        isAnyHandFist = true;
                    }
                });

                if (isAnyHandFist) {
                    if (fistHoldStartTime === null) {
                        fistHoldStartTime = Date.now();
                    } else if (Date.now() - fistHoldStartTime > 1800) {
                        drawingLines = [];
                        particles = [];
                        showToast('🧹', 'Nắm tay để xóa nét vẽ thành công!');
                        fistHoldStartTime = null;
                        playUIAudio('success');
                    }
                } else {
                    fistHoldStartTime = null;
                }
            }

            // Loop through each hand and draw landmarks/skeletons
            results.multiHandLandmarks.forEach((landmarks, handIndex) => {
                const gesture = detectHandGesture(landmarks);
                const isRightHand = results.multiHandedness[handIndex].label === 'Right';
                
                // Get screen coordinates for all 21 points
                const screenPoints = landmarks.map(landmark => getHandScreenCoords(landmark));
                
                // Push fingertips coords to list
                // tips: Thumb(4), Index(8), Middle(12), Ring(16), Pinky(20)
                fingertipPositions.push(screenPoints[8]); // Index Tip
                fingertipPositions.push(screenPoints[4]); // Thumb Tip
                fingertipPositions.push(screenPoints[12]); // Middle Tip
                fingertipPositions.push(screenPoints[16]); // Ring Tip
                fingertipPositions.push(screenPoints[20]); // Pinky Tip

                // --- 1. Draw Custom Sci-Fi Skeleton ---
                // Choose neon theme based on hand index (Cyan for Hand 1, Pink for Hand 2)
                const skeletonColor = handIndex === 0 ? 'var(--cyber-blue)' : 'var(--cyber-pink)';
                const jointColor = '#ffffff';

                // Draw Connections
                ctx.save();
                ctx.shadowColor = skeletonColor;
                ctx.shadowBlur = 12;
                ctx.strokeStyle = skeletonColor;
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                HAND_CONNECTIONS.forEach(([start, end]) => {
                    ctx.beginPath();
                    ctx.moveTo(screenPoints[start].x, screenPoints[start].y);
                    ctx.lineTo(screenPoints[end].x, screenPoints[end].y);
                    ctx.stroke();
                });
                ctx.restore();

                // Draw Joint Knuckles
                screenPoints.forEach((pt, idx) => {
                    ctx.save();
                    const isTip = [4, 8, 12, 16, 20].includes(idx);
                    const size = isTip ? 6.5 : 4.5;
                    
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = jointColor;
                    ctx.shadowColor = skeletonColor;
                    ctx.shadowBlur = 8;
                    ctx.fill();
                    
                    // Draw outer ring around tips
                    if (isTip) {
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, size + 4, 0, Math.PI * 2);
                        ctx.strokeStyle = skeletonColor;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                    ctx.restore();
                });

                // Display Hand Label (Left/Right) near Wrist
                ctx.save();
                ctx.font = 'bold 12px Space Grotesk';
                ctx.fillStyle = skeletonColor;
                ctx.shadowColor = skeletonColor;
                ctx.shadowBlur = 5;
                const handSideText = `${isRightHand ? 'Tay Phải' : 'Tay Trái'}`;
                ctx.fillText(handSideText, screenPoints[0].x - 30, screenPoints[0].y + 25);
                ctx.restore();

                // --- 2. Interactive Hand Modes Execution ---
                // Drawing Mode
                if (activeMode === 'drawing') {
                    if (gesture.includes('Pinch')) {
                        isAnyHandPinching = true;
                        
                        // Pinch Center point
                        const indexTipPt = screenPoints[8];
                        const thumbTipPt = screenPoints[4];
                        const pinchX = (indexTipPt.x + thumbTipPt.x) / 2;
                        const pinchY = (indexTipPt.y + thumbTipPt.y) / 2;
                        
                        // Emit brush paint particles
                        if (Math.random() > 0.4) {
                            particles.push({
                                x: pinchX,
                                y: pinchY,
                                vx: (Math.random() - 0.5) * 3,
                                vy: (Math.random() - 0.5) * 3,
                                radius: Math.random() * 4 + 1.5,
                                color: currentColor,
                                opacity: 0.9,
                                decay: 0.03
                            });
                        }

                        // Add point to lines
                        if (!isPinching) {
                            // New line started
                            drawingLines.push({
                                color: currentColor,
                                size: brushSize,
                                points: [{ x: pinchX, y: pinchY }]
                            });
                            isPinching = true;
                        } else {
                            // Continue painting line
                            const activeLine = drawingLines[drawingLines.length - 1];
                            if (activeLine) {
                                activeLine.points.push({ x: pinchX, y: pinchY });
                            }
                        }
                    }
                }

                // Synth mode
                if (activeMode === 'synth') {
                    // Check Index Fingertip (8) collision with keys
                    const indexTipPt = screenPoints[8];
                    
                    synthKeys.forEach((key, index) => {
                        const insideX = indexTipPt.x >= key.x && indexTipPt.x <= (key.x + key.width);
                        const insideY = indexTipPt.y >= key.y && indexTipPt.y <= (key.y + key.height);
                        
                        if (insideX && insideY) {
                            const nowMs = Date.now();
                            // Trigger note with a debounce cooldown of 300ms
                            if (nowMs - keyCooldowns[index] > 320) {
                                keyCooldowns[index] = nowMs;
                                playSynthNote(key.freq);
                                key.rippleRadius = 15;
                                key.rippleOpacity = 1;
                                spawnParticles(indexTipPt.x, indexTipPt.y, key.color, 12);
                            }
                            key.isActive = true;
                        } else {
                            key.isActive = false;
                        }
                    });
                }
            });
        }

        // Reset pinching state if no hand is pinching
        if (activeMode === 'drawing' && !isAnyHandPinching) {
            isPinching = false;
        }

        // --- Render Background drawing elements & game overlays ---

        // 1. Drawing Mode: Render all Neon Lines
        if (activeMode === 'drawing') {
            drawingLines.forEach(line => {
                if (line.points.length < 2) return;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(line.points[0].x, line.points[0].y);
                
                for (let j = 1; j < line.points.length; j++) {
                    ctx.lineTo(line.points[j].x, line.points[j].y);
                }
                
                ctx.strokeStyle = line.color;
                ctx.lineWidth = line.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = line.color;
                ctx.shadowBlur = line.size * 1.5;
                
                ctx.stroke();
                ctx.restore();
            });

            // If user is holding fist to erase, draw visual wipe loading indicator
            if (fistHoldStartTime !== null) {
                const elapsed = Date.now() - fistHoldStartTime;
                const percent = Math.min(elapsed / 1800, 1);
                
                ctx.save();
                ctx.beginPath();
                ctx.arc(canvas.width / 2, canvas.height / 2, 50, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * percent));
                ctx.strokeStyle = 'var(--cyber-pink)';
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
                ctx.shadowColor = 'var(--cyber-pink)';
                ctx.shadowBlur = 15;
                ctx.stroke();
                
                ctx.font = 'bold 15px Space Grotesk';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('Đang Xóa...', canvas.width / 2 - 35, canvas.height / 2 + 5);
                ctx.restore();
            }
        }

        // 2. Synth Mode: Render synth keyboard overlay
        if (activeMode === 'synth') {
            // Lazy load keys
            if (synthKeys.length === 0) updateSynthKeys();
            
            synthKeys.forEach((key) => {
                ctx.save();
                
                // Base Glass Card
                ctx.beginPath();
                ctx.roundRect(key.x + 5, key.y + 10, key.width - 10, key.height, 12);
                
                if (key.isActive) {
                    ctx.fillStyle = key.color.replace(')', ', 0.25)'); // glowing fill
                    ctx.strokeStyle = key.color;
                    ctx.shadowColor = key.color;
                    ctx.shadowBlur = 20;
                } else {
                    ctx.fillStyle = 'rgba(16, 16, 36, 0.5)';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                }
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
                
                // Key text labels
                ctx.font = 'bold 20px Space Grotesk';
                ctx.fillStyle = key.isActive ? '#ffffff' : key.color;
                ctx.shadowColor = key.color;
                ctx.shadowBlur = key.isActive ? 12 : 3;
                ctx.fillText(key.name, key.x + (key.width / 2) - 15, key.y + 100);
                
                ctx.font = '500 12px Outfit';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.shadowBlur = 0;
                ctx.fillText(`${Math.round(key.freq)} Hz`, key.x + (key.width / 2) - 18, key.y + 130);

                // Draw ripple effects on hit
                if (key.rippleOpacity > 0) {
                    key.rippleRadius += 4;
                    key.rippleOpacity -= 0.04;
                    
                    ctx.beginPath();
                    ctx.arc(key.x + (key.width / 2), key.y + 100, key.rippleRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = key.color;
                    ctx.globalAlpha = key.rippleOpacity;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }
                
                ctx.restore();
            });
        }

        // 3. Bubble Mode: Render & updates game loop
        if (activeMode === 'bubble' && gameActive) {
            updateAndDrawBubbles(fingertipPositions);
        }

        // Draw general particles
        updateAndDrawParticles();
    }
});
