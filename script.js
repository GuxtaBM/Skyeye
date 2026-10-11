"use strict";

/* =====================================================================
   SkyEye? — olho interativo com botões de voz e legendas digitadas
   ===================================================================== */

/* ---------- Configuração dos botões ---------- */
const BUTTONS = [
  { id: "Botao1", audio: "audios/fala1.mp3", caption: "Meu numero? Eu diria todos... Mas serei modesto, UM! *************" },
  { id: "Botao2", audio: "audios/fala2.mp3", caption: "A árvore diz sobre os outros olhos. E sobre si mesma..." },
  { id: "Botao3", audio: "audios/fala3.mp3", caption: "Onde está? Dentro de si, mas aparentemente longe da verdade..." },
  { id: "Botao4", audio: "audios/fala4.mp3", caption: "Quebre a parede e veja sua capa." },
  { id: "Botao5", audio: "audios/fala5.mp3", caption: "Vocês são a resposta." },
];

const TYPING_DELAY_MS = 45;      // 35–60 ms por caractere
const CAPTION_LIFETIME_MS = 20000; // contado a partir do clique
const FADE_MS = 450;             // deve casar com a transição do CSS

/* =====================================================================
   1. OLHO
   Contorno da esclera (proporções 0..1 da imagem recortada), amostrado
   da própria imagem. Usado para garantir que a pupila nunca saia dela.
   ===================================================================== */
const SCLERA_TOP = [0.5, 0.525, 0.5033, 0.4867, 0.47, 0.4533, 0.4367, 0.42, 0.4033, 0.3883, 0.37, 0.3533, 0.3367, 0.32, 0.3033, 0.2867, 0.27, 0.2567, 0.2417, 0.2267, 0.2133, 0.2017, 0.19, 0.1783, 0.1683, 0.1583, 0.1483, 0.14, 0.13, 0.1217, 0.115, 0.1067, 0.1, 0.0917, 0.0867, 0.08, 0.0733, 0.0683, 0.0633, 0.0583, 0.0533, 0.0483, 0.045, 0.04, 0.0367, 0.0333, 0.03, 0.0267, 0.025, 0.0233, 0.02, 0.02, 0.0167, 0.0167, 0.015, 0.015, 0.015, 0.0133, 0.0133, 0.015, 0.015, 0.0167, 0.0183, 0.02, 0.02, 0.0233, 0.025, 0.0283, 0.0317, 0.0367, 0.0417, 0.0467, 0.0517, 0.0583, 0.065, 0.0733, 0.08, 0.09, 0.1, 0.1117, 0.1233, 0.135, 0.15, 0.165, 0.1817, 0.2, 0.22, 0.2383, 0.2617, 0.2833, 0.3083, 0.3317, 0.3583, 0.38, 0.405, 0.5];
const SCLERA_BOTTOM = [0.5, 0.5617, 0.5833, 0.6017, 0.6217, 0.64, 0.66, 0.6767, 0.695, 0.7117, 0.7283, 0.7433, 0.7583, 0.7717, 0.785, 0.7983, 0.81, 0.8217, 0.8333, 0.845, 0.855, 0.8667, 0.8767, 0.8867, 0.895, 0.9033, 0.9117, 0.92, 0.9267, 0.935, 0.9417, 0.9467, 0.9533, 0.9583, 0.9633, 0.9667, 0.9717, 0.975, 0.9767, 0.98, 0.9817, 0.9833, 0.985, 0.985, 0.985, 0.985, 0.985, 0.985, 0.9833, 0.9817, 0.98, 0.9767, 0.9733, 0.97, 0.9667, 0.9617, 0.9583, 0.9533, 0.95, 0.9433, 0.9383, 0.9333, 0.9267, 0.92, 0.9133, 0.9067, 0.8983, 0.8917, 0.8833, 0.8733, 0.865, 0.855, 0.845, 0.835, 0.825, 0.8133, 0.8017, 0.79, 0.7767, 0.7633, 0.7483, 0.735, 0.7183, 0.7033, 0.685, 0.6683, 0.65, 0.63, 0.61, 0.59, 0.5667, 0.5433, 0.5167, 0.4917, 0.4583, 0.5];
const PUPIL_ASPECT = 0.1677;   // largura / altura da pupila
const PUPIL_HEIGHT_RATIO = 0.60; // deve casar com .eye__pupil { height: 60% }
const EDGE_MARGIN = 0.035;       // folga (fração da altura) entre pupila e borda

const stage = document.getElementById("stage");
const eye = document.getElementById("eye");
const pupil = document.getElementById("pupil");

const eyeState = {
  width: 0, height: 0, cx: 0, cy: 0,
  target: { x: 0, y: 0 },
  current: { x: 0, y: 0 },
  hasPointer: false,
  rafId: null,
};

function edgeAt(table, nx) {
  const p = Math.min(Math.max(nx, 0), 1) * (table.length - 1);
  const i = Math.floor(p);
  const j = Math.min(i + 1, table.length - 1);
  return table[i] + (table[j] - table[i]) * (p - i);
}

/* Pontos-chave do contorno da pupila (frações da caixa da pupila, centro = 0) */
const PUPIL_PROBES = [
  [0, -0.5], [0, 0.5],
  [-0.5, 0], [0.5, 0],
  [-0.42, -0.24], [0.42, -0.24],
  [-0.42, 0.24], [0.42, 0.24],
  [-0.3, -0.38], [0.3, -0.38],
  [-0.3, 0.38], [0.3, 0.38],
];

/* A pupila, centrada em (ox, oy) — em px a partir do centro do olho —
   está totalmente dentro da esclera? */
function pupilFits(ox, oy) {
  const w = eyeState.width, h = eyeState.height;
  const ph = h * PUPIL_HEIGHT_RATIO;
  const pw = ph * PUPIL_ASPECT;
  for (const [fx, fy] of PUPIL_PROBES) {
    const nx = (w / 2 + ox + fx * pw) / w;
    const ny = (h / 2 + oy + fy * ph) / h;
    if (nx < 0 || nx > 1) return false;
    if (ny < edgeAt(SCLERA_TOP, nx) + EDGE_MARGIN) return false;
    if (ny > edgeAt(SCLERA_BOTTOM, nx) - EDGE_MARGIN) return false;
  }
  return true;
}

/* Reduz o deslocamento ao longo da mesma direção até caber na esclera */
function clampToSclera(ox, oy) {
  if (pupilFits(ox, oy)) return { x: ox, y: oy };
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (pupilFits(ox * mid, oy * mid)) lo = mid; else hi = mid;
  }
  return { x: ox * lo, y: oy * lo };
}

function measureEye() {
  const r = eye.getBoundingClientRect();
  eyeState.width = r.width;
  eyeState.height = r.height;
  eyeState.cx = r.left + r.width / 2;
  eyeState.cy = r.top + r.height / 2;
}

function aimAt(clientX, clientY) {
  const dx = clientX - eyeState.cx;
  const dy = clientY - eyeState.cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) { eyeState.target = { x: 0, y: 0 }; return; }

  // Intensidade: cresce suavemente com a distância e satura
  const reach = Math.max(eyeState.width * 0.35, 120);
  const strength = Math.min(1, dist / reach);
  const eased = strength * (2 - strength); // ease-out

  const ux = dx / dist, uy = dy / dist;
  const wantX = ux * eased * eyeState.width * 0.30;
  const wantY = uy * eased * eyeState.height * 0.22;

  eyeState.target = clampToSclera(wantX, wantY);
}

function onPointerMove(e) {
  eyeState.hasPointer = true;
  aimAt(e.clientX, e.clientY);
}

function renderEye() {
  const s = eyeState;
  // Interpolação exponencial: suave, contínua e sem tremor
  const k = 0.14;
  s.current.x += (s.target.x - s.current.x) * k;
  s.current.y += (s.target.y - s.current.y) * k;
  if (Math.abs(s.target.x - s.current.x) < 0.01) s.current.x = s.target.x;
  if (Math.abs(s.target.y - s.current.y) < 0.01) s.current.y = s.target.y;
  pupil.style.transform =
    `translate3d(-50%, -50%, 0) translate3d(${s.current.x.toFixed(2)}px, ${s.current.y.toFixed(2)}px, 0)`;
  s.rafId = requestAnimationFrame(renderEye);
}

function recenterTarget() {
  eyeState.target = { x: 0, y: 0 };
}

function initEye() {
  measureEye();

  // Pointer Events cobrem mouse, toque e caneta
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerMove, { passive: true });
  // Reforço para navegadores de toque mais antigos
  window.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; if (t) onPointerMove(t);
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0]; if (t) onPointerMove(t);
  }, { passive: true });

  // Mouse saiu da janela: o olhar volta suavemente ao centro
  document.documentElement.addEventListener("mouseleave", recenterTarget);

  window.addEventListener("resize", () => {
    measureEye();
    if (eyeState.hasPointer) return;
    recenterTarget();
  });
  if ("ResizeObserver" in window) new ResizeObserver(measureEye).observe(eye);
  // A animação de entrada altera a escala; remedimos ao terminar
  eye.addEventListener("animationend", measureEye);
  window.addEventListener("load", measureEye);

  eyeState.rafId = requestAnimationFrame(renderEye);
}

/* =====================================================================
   2. ÁUDIO
   ===================================================================== */
const audioPlayer = {
  elements: new Map(),
  current: null,

  load(config) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = config.audio;
    audio.addEventListener("error", () => {
      console.warn(`[SkyEye] Não foi possível carregar o áudio: ${config.audio}`);
    });
    this.elements.set(config.id, audio);
  },

  stopCurrent() {
    if (!this.current) return;
    try {
      this.current.pause();
      this.current.currentTime = 0;
    } catch (_) { /* ignora */ }
    this.current = null;
  },

  play(id) {
    this.stopCurrent();
    const audio = this.elements.get(id);
    if (!audio) return;
    try { audio.currentTime = 0; } catch (_) { /* ainda sem metadados */ }
    this.current = audio;
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((err) => {
        console.warn(`[SkyEye] Falha ao reproduzir ${id}:`, err && err.message ? err.message : err);
        if (this.current === audio) this.current = null;
      });
    }
  },
};

/* =====================================================================
   3. LEGENDAS (digitação + expiração em 20 s a partir do clique)
   ===================================================================== */
const captionEl = document.getElementById("caption");
const captionText = document.getElementById("captionText");
const captionCursor = document.getElementById("captionCursor");

const captionController = {
  typingTimer: null,
  lifetimeTimer: null,
  clearTimer: null,
  runId: 0, // invalida qualquer callback de uma execução anterior

  cancelAll() {
    clearTimeout(this.typingTimer);
    clearTimeout(this.lifetimeTimer);
    clearTimeout(this.clearTimer);
    this.typingTimer = this.lifetimeTimer = this.clearTimer = null;
    this.runId++;
  },

  show(message) {
    this.cancelAll();
    const run = this.runId;

    // Substitui imediatamente a mensagem anterior
    captionText.textContent = "";
    captionEl.classList.remove("is-hidden");
    captionCursor.classList.add("is-active");

    // Os 20 s contam a partir do clique, não do fim da digitação
    this.lifetimeTimer = setTimeout(() => {
      if (run !== this.runId) return;
      this.hide(run);
    }, CAPTION_LIFETIME_MS);

    let index = 0;
    const typeNext = () => {
      if (run !== this.runId) return;
      index++;
      captionText.textContent = message.slice(0, index);
      if (index < message.length) {
        this.typingTimer = setTimeout(typeNext, TYPING_DELAY_MS);
      } else {
        this.typingTimer = null;
        captionCursor.classList.remove("is-active");
      }
    };
    this.typingTimer = setTimeout(typeNext, TYPING_DELAY_MS);
  },

  hide(run) {
    clearTimeout(this.typingTimer);
    this.typingTimer = null;
    captionCursor.classList.remove("is-active");
    captionEl.classList.add("is-hidden");
    // Remove o texto depois do fade; nunca reaparece sozinho
    this.clearTimer = setTimeout(() => {
      if (run !== this.runId) return;
      captionText.textContent = "";
    }, FADE_MS + 50);
  },
};

/* =====================================================================
   4. BOTÕES
   ===================================================================== */
function handleButtonPress(config) {
  audioPlayer.play(config.id);
  captionController.show(config.caption);
}

function initButtons() {
  BUTTONS.forEach((config) => {
    audioPlayer.load(config);
    const button = document.getElementById(config.id);
    if (!button) return;

    button.addEventListener("click", () => handleButtonPress(config));

    // Feedback visual de pressionamento também para toque/teclado
    const press = () => button.classList.add("is-pressed");
    const release = () => button.classList.remove("is-pressed");
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("blur", release);
  });
}

/* ---------- Início ---------- */
initEye();
initButtons();
