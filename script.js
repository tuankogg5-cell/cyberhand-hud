// --- Canvas Heart Engine ---
const canvas = document.getElementById('heartCanvas');
const ctx = canvas.getContext('2d');

let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

// Listen for window resize
window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
});

// Particle configuration
const backgroundHearts = [];
const explosiveHearts = [];
const colors = [
    '#ff5e7e', // Rose
    '#ff8da1', // Light Pink
    '#ff3b64', // Deep Rose
    '#ffd700', // Gold
    '#ffb7b2', // Coral Pink
    '#e85d04'  // Rose Orange
];

class HeartParticle {
    constructor(x, y, isExplosion = false) {
        this.x = x;
        this.y = y;
        this.size = isExplosion ? Math.random() * 12 + 6 : Math.random() * 16 + 6;
        this.speedX = isExplosion ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 1.5;
        this.speedY = isExplosion ? (Math.random() - 0.5) * 8 - 3 : -Math.random() * 1.5 - 0.5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.opacity = isExplosion ? 1 : Math.random() * 0.4 + 0.15;
        this.fade = isExplosion ? Math.random() * 0.02 + 0.01 : 0;
        this.wiggle = Math.random() * 0.05;
        this.wiggleSpeed = Math.random() * 0.02 + 0.005;
        this.isExplosion = isExplosion;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.05;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;

        if (this.isExplosion) {
            this.opacity -= this.fade;
        } else {
            // Background particles float up and wiggle side to side
            this.x += Math.sin(this.wiggle) * 0.4;
            this.wiggle += this.wiggleSpeed;
            // Recycle background particles when they go off screen
            if (this.y < -30) {
                this.y = height + 30;
                this.x = Math.random() * width;
                this.opacity = Math.random() * 0.4 + 0.15;
            }
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = Math.max(0, this.opacity);
        
        ctx.beginPath();
        // Drawing heart path using curves
        const d = this.size;
        ctx.moveTo(0, -d / 4);
        ctx.bezierCurveTo(-d / 2, -d * 0.75, -d, -d / 3, 0, d);
        ctx.bezierCurveTo(d, -d / 3, d / 2, -d * 0.75, 0, -d / 4);
        ctx.closePath();
        
        ctx.fillStyle = this.color;
        // Subtle glow for glowing effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = this.isExplosion ? 8 : 3;
        ctx.fill();
        
        ctx.restore();
    }
}

// Initialize background hearts
const initialCount = Math.min(60, Math.floor((width * height) / 18000));
for (let i = 0; i < initialCount; i++) {
    backgroundHearts.push(new HeartParticle(Math.random() * width, Math.random() * height));
}

// Generate explosion burst
function createExplosion(x, y) {
    const count = 30;
    for (let i = 0; i < count; i++) {
        explosiveHearts.push(new HeartParticle(x, y, true));
    }
}

// Main Animation Loop
function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw & update background drifting hearts
    backgroundHearts.forEach(heart => {
        heart.update();
        heart.draw();
    });

    // Draw & update explosion hearts
    for (let i = explosiveHearts.length - 1; i >= 0; i--) {
        const heart = explosiveHearts[i];
        heart.update();
        heart.draw();
        if (heart.opacity <= 0) {
            explosiveHearts.splice(i, 1);
        }
    }

    requestAnimationFrame(animate);
}
animate();

// Trigger explosion on manual clicks on the page
window.addEventListener('click', (e) => {
    // Avoid double explosion triggers from buttons
    if (e.target.closest('#envelopeBtn')) return;
    createExplosion(e.clientX, e.clientY);
});

// --- Envelope Transition and Reveal Logic ---
const envelopeBtn = document.getElementById('envelopeBtn');
const lockScreen = document.getElementById('lockScreen');
const mainContainer = document.getElementById('mainContainer');
let hasOpened = false;

function openEnvelope() {
    if (hasOpened) return;
    hasOpened = true;
    
    // Get envelope position for burst effect
    const rect = envelopeBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    // Massive explosion burst
    createExplosion(x, y);
    setTimeout(() => createExplosion(x, y), 200);
    setTimeout(() => createExplosion(x, y), 400);

    // Smooth transition
    lockScreen.classList.add('fade-out');
    mainContainer.classList.remove('hidden');
    
    // Trigger entrance animation for main glass container
    setTimeout(() => {
        mainContainer.classList.add('show');
        revealLoveLetter();
    }, 400);
}

envelopeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid duplicate triggering from window click
    openEnvelope();
});

// Auto-open after 2.5 seconds if the user hasn't clicked it yet
setTimeout(() => {
    openEnvelope();
}, 2500);


// Reveal love letter paragraphs sequentially
function revealLoveLetter() {
    const paragraphs = [
        document.getElementById('paragraph1'),
        document.getElementById('paragraph2'),
        document.getElementById('paragraph3')
    ];
    const declaration = document.querySelector('.love-declaration');

    paragraphs.forEach((p, idx) => {
        setTimeout(() => {
            p.classList.add('revealed');
        }, 600 + idx * 1600); // 1.6s delay between paragraphs
    });

    // Animate declaration text at the end
    setTimeout(() => {
        declaration.classList.add('revealed');
        // Spawn constant tiny celebration explosions behind card
        const cardRect = document.querySelector('.love-card').getBoundingClientRect();
        const startX = cardRect.left + cardRect.width / 2;
        const startY = cardRect.top + cardRect.height / 2;
        createExplosion(startX - 100, startY);
        createExplosion(startX + 100, startY);
    }, 600 + paragraphs.length * 1600 + 400);
}

// --- Cursor / Touch Sparkles Effect ---
const sparkleContainer = document.getElementById('sparkleContainer');
let lastSparkleTime = 0;
const sparkleInterval = 60; // Throttle to prevent too many elements

function spawnSparkle(x, y) {
    const now = Date.now();
    if (now - lastSparkleTime < sparkleInterval) return;
    lastSparkleTime = now;

    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle-heart';
    // Random heart or flower symbol
    const symbols = ['💖', '❤️', '💕', '🌸', '✨'];
    sparkle.innerText = symbols[Math.floor(Math.random() * symbols.length)];
    
    sparkle.style.left = `${x}px`;
    sparkle.style.top = `${y}px`;
    
    sparkleContainer.appendChild(sparkle);

    // Remove element after animation finishes
    sparkle.addEventListener('animationend', () => {
        sparkle.remove();
    });
}

// Track mouse movements
window.addEventListener('mousemove', (e) => {
    spawnSparkle(e.clientX, e.clientY);
});

// Track touch movements for mobile users
window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 0) {
        spawnSparkle(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: true });
