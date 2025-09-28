// ====== Config & état ======
const CANVAS = document.getElementById("gameCanvas");
const CTX = CANVAS.getContext("2d");
const PHASE_LABEL = document.getElementById("current-phase");
const TIMER_EL = document.getElementById("timer");
const ERRORS_EL = document.getElementById("errors");
const ERROR_MSG = document.getElementById("error-msg");

const NODE_RADIUS = 24; // rayon des ronds cliquables
const HIT_RADIUS = 28; // tolérance de clic
const CSV_URL_PRACTICE_A = "tmt_positions_A_entrainement.csv";
const CSV_URL_TEST_A = "tmt_positions_A.csv";
const CSV_URL_PRACTICE_B = "tmt_positions_B_entrainement.csv";
const CSV_URL_TEST_B = "tmt_positions_B.csv"; 
// === Export / Cumulatifs ===
// place ça près du haut du fichier, après tes const/let init
const CUMULATIVE_STORAGE_KEY = "TMT_RESULTS_V1";
let PARTICIPANT_ID = ""; // on le remplit dans startTest()

function msToSec(ms) {
  if (ms == null) return "";
  return (ms / 1000).toFixed(1);
}
function safe(v) {
  return v == null ? "" : v;
}
function nowTuple() {
  const d = new Date();
  const iso = d.toISOString();
  const local = new Intl.DateTimeFormat("fr-BE", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
  return { d, iso, local };
}
function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "participant";
}
function yyyymmdd_HHMMSS(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) + "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

// Crée un objet "ligne" à partir de `results`
function buildRow(participantId, results) {
  const { iso, local } = nowTuple();
  return {
    participant_id: participantId,
    timestamp_iso: iso,
    timestamp_local: local,

    pA_time_s: msToSec(results.practiceA?.durationMs),
    pA_errors: safe(results.practiceA?.errors),
    pA_n: safe(results.practiceA?.n),

    tA_time_s: msToSec(results.testA?.durationMs),
    tA_errors: safe(results.testA?.errors),
    tA_n: safe(results.testA?.n),

    pB_time_s: msToSec(results.practiceB?.durationMs),
    pB_errors: safe(results.practiceB?.errors),
    pB_n: safe(results.practiceB?.n),

    tB_time_s: msToSec(results.testB?.durationMs),
    tB_errors: safe(results.testB?.errors),
    tB_n: safe(results.testB?.n),
  };
}

// Transforme un tableau d’objets en CSV séparé par ; (compatible Excel FR)
function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    const s = String(val ?? "");
    // Met entre guillemets si ; ou " ou saut de ligne
    if (/[;"\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ];
  // BOM pour Excel
  return "\uFEFF" + lines.join("\r\n");
}

// Télécharge un fichier (Blob)
function downloadFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// Sauvegarde cumulatif dans localStorage (format JSON)
function addToCumulative(row) {
  let arr = [];
  try {
    const raw = localStorage.getItem(CUMULATIVE_STORAGE_KEY);
    if (raw) arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [];
  } catch (e) {
    arr = [];
  }
  arr.push(row);
  localStorage.setItem(CUMULATIVE_STORAGE_KEY, JSON.stringify(arr));
  return arr;
}

// === Remplace le TODO par cette implémentation ===
function downloadResults() {
  // 1) construire la ligne de résultats du participant
  const pidInput = document.getElementById("participant-id");
  const pid = (PARTICIPANT_ID || pidInput?.value || "").trim();
  if (!pid) {
    alert("Code participant manquant.");
    return;
  }
  const row = buildRow(pid, results);

  // 2) CSV individuel
  const { d } = nowTuple();
  const fileTag = yyyymmdd_HHMMSS(d);
  const base = `tmt_${slugify(pid)}_${fileTag}.csv`;
  const singleCSV = toCSV([row]);
  downloadFile(base, singleCSV);

  // 3) Ajouter au cumulatif (localStorage), puis CSV cumulatif
  const cumulativeRows = addToCumulative(row);
  const cumulativeCSV = toCSV(cumulativeRows);
  downloadFile("tmt_cumulatif.csv", cumulativeCSV);

  // (optionnel) affichage rapide à l’écran final
  const finalDiv = document.getElementById("final-results");
  if (finalDiv) {
    finalDiv.innerHTML = `
      <p><strong>Participant:</strong> ${row.participant_id}</p>
      <p><strong>Enregistré le:</strong> ${row.timestamp_local}</p>
      <p>Fichiers téléchargés : <em>${base}</em> et <em>tmt_cumulatif.csv</em></p>
    `;
  }
}

// Résultats globaux du participant
let results = {
  practiceA: null,
  testA: null,
  practiceB: null,
  testB: null,
};


// ====== ÉTAT Practice A (remplace l'ancien objet practiceA) ======
let practiceA = {
  nodes: [], // [{order, label, x, y}, ...] triés par order
  progress: 0, // nb de clics corrects réalisés
  errors: 0,
  startedAt: 0,
  timerId: null,
  clickHandler: null,
};

// ====== ÉTAT Test A ======
let testA = {
  nodes: [],      // [{order, label, x, y}, ...] en pixels
  progress: 0,
  errors: 0,
  startedAt: 0,
  timerId: null,
  clickHandler: null,
};

// ====== ÉTAT Practice B ======
let practiceB = {
  nodes: [],
  progress: 0,
  errors: 0,
  startedAt: 0,
  timerId: null,
  clickHandler: null,
};

// ====== ÉTAT Test B ======
let testB = {
  nodes: [],
  progress: 0,
  errors: 0,
  startedAt: 0,
  timerId: null,
  clickHandler: null,
};

// ====== Utilitaires ======
function setPhase(text) {
  PHASE_LABEL.textContent = `Phase: ${text}`;
}
function setErrors(n) {
  ERRORS_EL.textContent = `Erreurs: ${n}`;
}
function setTime(ms) {
  TIMER_EL.textContent = `Temps: ${(ms / 1000).toFixed(1)}s`;
}

function startTimer(state) {
  state.startedAt = performance.now();
  state.timerId = requestAnimationFrame(function tick() {
    setTime(performance.now() - state.startedAt);
    state.timerId = requestAnimationFrame(tick);
  });
}
function stopTimer(state) {
  if (state.timerId) cancelAnimationFrame(state.timerId);
  state.timerId = null;
}

function flashError(message) {
  const errorDiv = document.getElementById("error-msg");
  errorDiv.textContent = message;
  errorDiv.style.display = "block";

  // masque après 10 secondes
  setTimeout(() => {
    errorDiv.style.display = "none";
  }, 3000);
}

function detachAllCanvasHandlers() {
  [practiceA, testA, practiceB, testB].forEach(state => {
    if (state.clickHandler) {
      CANVAS.removeEventListener("click", state.clickHandler);
      state.clickHandler = null;
    }
  });
}


// // === Transform coordonnées logique (0,0 au centre, +Y vers le haut) -> pixels canvas ===
// function makeTransform(nodes, width, height, padding = NODE_RADIUS) {
//   // étendue logique
//   const maxAbsX = Math.max(...nodes.map((n) => Math.abs(n.x))) || 1;
//   const maxAbsY = Math.max(...nodes.map((n) => Math.abs(n.y))) || 1;

//   // on garde les points à l'intérieur du canvas en respectant le ratio
//   const usableW = width - 2 * padding;
//   const usableH = height - 2 * padding;
//   const sx = usableW / (2 * maxAbsX);
//   const sy = usableH / (2 * maxAbsY);
//   const scale = Math.min(sx, sy); // isotrope pour ne pas déformer

//   const cx = width / 2; // centre pixel X
//   const cy = height / 2; // centre pixel Y

//   return {
//     toPx(x, y) {
//       // x logique vers droite -> + ; y logique vers haut -> -, car canvas a +Y vers le bas
//       const X = cx + x * scale;
//       const Y = cy - y * scale;
//       return { x: X, y: Y };
//     },
//     scale,
//     cx,
//     cy,
//     maxAbsX,
//     maxAbsY,
//   };
// }

// === Transform coords logiques -> pixels canvas, avec étirement X optionnel ===
function makeTransform(nodes, width, height, paddingX = NODE_RADIUS, paddingY = NODE_RADIUS) {
  const maxAbsX = Math.max(...nodes.map(n => Math.abs(n.x))) || 1;
  const maxAbsY = Math.max(...nodes.map(n => Math.abs(n.y))) || 1;

  const usableW = width  - 2 * paddingX;
  const usableH = height - 2 * paddingY;

  const sx = usableW / (2 * maxAbsX);
  const sy = usableH / (2 * maxAbsY);

  const scale = Math.min(sx, sy); // isotrope
  const cx = width / 2;
  const cy = height / 2;

  return {
    toPx(x, y) {
      return { x: cx + x * scale, y: cy - y * scale };
    },
    scale, cx, cy
  };
}


// Parse CSV "order;label;x;y"
async function loadPositionsCSV(url) {
  const txt = await (await fetch(url, { cache: "no-store" })).text();
  const lines = txt.trim().split(/\r?\n/);
  const header = lines.shift();
  // Optionnel : vérifier les entêtes
  // order;label;x;y
  const nodes = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [orderS, label, xS, yS] = line.split(";");
    nodes.push({
      order: Number(orderS),
      label: label,
      x: Number(xS),
      y: Number(yS),
    });
  }
  // On s’assure de l’ordre
  nodes.sort((a, b) => a.order - b.order);
  return nodes;
}

// Dessin
function clearCanvas() {
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
}

function drawNodes(state) {
  clearCanvas();

  // 1) Tracer lignes seulement entre clics corrects consécutifs
  // -> si progress >= 2, on trace (1->2, 2->3, ... progress-1 -> progress)
  if (state.progress >= 2) {
    CTX.lineWidth = 3;
    CTX.beginPath();
    // On part du point 1 cliqué
    const first = state.nodes[0]; // order=1
    CTX.moveTo(first.x, first.y);
    for (let i = 2; i <= state.progress; i++) {
      const b = state.nodes[i - 1]; // order=i
      CTX.lineTo(b.x, b.y);
    }
    CTX.stroke();
  }

  // Ronds
  state.nodes.forEach((n) => {
    const done = n.order <= state.progress; // allumer uniquement si déjà cliqué

    CTX.beginPath();
    CTX.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    CTX.fillStyle = done ? "#d4edda" : "#ffffff"; // vert pâle si validé, sinon blanc
    CTX.fill();
    CTX.lineWidth = 2;
    CTX.strokeStyle = done ? "#28a745" : "#333";
    CTX.stroke();

    // Label
    CTX.font = "18px sans-serif";
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    CTX.fillStyle = "#000";
    CTX.fillText(n.label, n.x, n.y);
  });
}

function dist2(a, b, x, y) {
  const dx = a - x,
    dy = b - y;
  return dx * dx + dy * dy;
}

function nodeAt(state, x, y) {
  let best = null,
    bestD = Infinity;
  for (const n of state.nodes) {
    const d2 = dist2(n.x, n.y, x, y);
    if (d2 < bestD) {
      best = n;
      bestD = d2;
    }
  }
  if (best && Math.sqrt(bestD) <= HIT_RADIUS) return best;
  return null;
}

function canvasToLocal(evt) {
  const rect = CANVAS.getBoundingClientRect();
  const x = (evt.clientX - rect.left) * (CANVAS.width / rect.width);
  const y = (evt.clientY - rect.top) * (CANVAS.height / rect.height);
  return { x, y };
}

function finishPracticeA(state) {
  stopTimer(state);
  const duration = performance.now() - state.startedAt;

  // Sauvegarde dans results
  results.practiceA = {
    durationMs: duration,
    errors: state.errors,
    n: state.nodes.length
  };

  console.log("✅ Practice A terminé:", results.practiceA);

  showScreen("test-a-screen");
}

function finishTestA(state) {
  stopTimer(state);
  const duration = performance.now() - state.startedAt;

  results.testA = {
    durationMs: duration,
    errors: state.errors,
    n: state.nodes.length
  };

  console.log("✅ Test A terminé:", results.testA);

  // Ici tu peux enchaîner vers practice B
  showScreen("practice-b-screen");
}

function finishPracticeB(state) {
  stopTimer(state);
  const duration = performance.now() - state.startedAt; 

  results.practiceB = {
    durationMs: duration,
    errors: state.errors,
    n: state.nodes.length
  };

  console.log("✅ Practice B terminé:", results.practiceB);
  showScreen("test-b-screen");
} 

function finishTestB(state) {
  stopTimer(state);
  const duration = performance.now() - state.startedAt; 
  results.testB = { durationMs: duration, errors: state.errors, n: state.nodes.length };
  console.log("✅ Test B terminé:", results.testB);
  showScreen("final-screen"); // <-- au lieu de "end-screen"
}

// ====== Gestion des clics Practice A ======
function handleClickPracticeA(evt) { 
  const { x, y } = canvasToLocal(evt);
  const hit = nodeAt(practiceA, x, y);

  if (!hit) {
    // clic hors d’un rond
    return;
  }

  const expected = practiceA.progress + 1; // prochain ordre attendu

  if (hit.order === expected) {
    // clic correct
    practiceA.progress += 1;
    drawNodes(practiceA);

    if (practiceA.progress === practiceA.nodes.length) {
      finishPracticeA(practiceA);
    }
  } else {
    // clic sur un mauvais rond
    flashError("C'est une erreur ! Vous devez cliquer sur le nombre suivant en respectant l'ordre croissant.");
    // ici tu peux ajouter un compteur d’erreurs si besoin
  }
}

// ====== Gestion des clics Test A ======
function handleClickTestA(evt) {
  const { x, y } = canvasToLocal(evt);
  const hit = nodeAt(testA, x, y);

  if (!hit) return;

  const expected = testA.progress + 1;

  if (hit.order === expected) {
    testA.progress += 1;
    drawNodes(testA);

    if (testA.progress === testA.nodes.length) {
      finishTestA(testA);
    }
  } else {
    testA.errors += 1;
    setErrors(testA.errors);
    flashError("C'est une erreur ! Vous devez cliquer sur le nombre suivant en respectant l'ordre croissant.");
  }
}

console.log("Raw nodes count =", testA.nodes.length);
console.log("Raw sample =", testA.nodes.slice(0, 5));
if (
  testA.nodes.some((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y))
) {
  console.error("⚠️ Des x/y non finies (NaN/±Inf) détectées");
}

function handleClickPracticeB(evt) {
  const { x, y } = canvasToLocal(evt);
  const hit = nodeAt(practiceB, x, y);  

  if (!hit) {
    // clic hors d’un rond
    return;
  }

  const expected = practiceB.progress + 1; // prochain ordre attendu

  if (hit.order === expected) {
    // clic correct
    practiceB.progress += 1;
    drawNodes(practiceB);

    if (practiceB.progress === practiceB.nodes.length) {
      finishPracticeB(practiceB);
    }
  } else {
    // clic sur un mauvais rond
    flashError("C'est une erreur ! Vous devez cliquer les cercles en alternant chiffres et lettres et en suivant l'ordre croissant des chiffres et l'ordre alphabétique des lettres.");
    // ici tu peux ajouter un compteur d’erreurs si besoin
  }
}

function handleClickTestB(evt) {
  const { x, y } = canvasToLocal(evt);
  const hit = nodeAt(testB, x, y);
  if (!hit) return;

  const expected = testB.progress + 1;

  if (hit.order === expected) {
    testB.progress += 1;
    drawNodes(testB);
    if (testB.progress === testB.nodes.length) {
      finishTestB(testB);
    }
  } else {
    flashError(
      "C'est une erreur ! Vous devez cliquer les cercles en alternant chiffres et lettres..."
    );
  }
}

// ====== Lancement de la phase Practice A ======
async function startPracticeA() {
  detachAllCanvasHandlers();
  console.log("Practice A");
  setPhase("Entraînement A");

  // reset
  practiceA.progress = 0;
  practiceA.errors = 0;
  practiceA.startedAt = 0;
  if (practiceA.clickHandler) {
    CANVAS.removeEventListener("click", practiceA.clickHandler);
    practiceA.clickHandler = null;
  }
  setErrors(0);
  setTime(0);
  showScreen("game-screen");

  // charge CSV puis dessine
  practiceA.nodes = await loadPositionsCSV(CSV_URL_PRACTICE_A); // (assure-toi que les nodes sont triés par 'order' croissant)
  practiceA.nodes.sort((a, b) => a.order - b.order);

  // 2) construis la transform vers pixels canvas (800×500)
  const T = makeTransform(
    practiceA.nodes,
    CANVAS.width,
    CANVAS.height,
    NODE_RADIUS
  );

  // 3) crée une copie "pixelisée" pour le rendu et les clics
  practiceA.nodes = practiceA.nodes.map((n) => {
    const p = T.toPx(n.x, n.y);
    return { ...n, x: p.x, y: p.y }; // x,y deviennent des coords canvas en pixels
  });

  drawNodes(practiceA);
  startTimer(practiceA);

  // Affiche "départ" à la position du premier nœud (order = 1)
  if (practiceA.nodes.length > 0) {
    const first = practiceA.nodes[0];
    CTX.font = "bold 22px sans-serif";
    CTX.fillStyle = "#007bff";
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    CTX.fillText("départ", first.x, first.y - NODE_RADIUS - 18);
  }

  // branchement clics
  practiceA.clickHandler = handleClickPracticeA;
  CANVAS.addEventListener("click", practiceA.clickHandler, { passive: true });
}

// ====== (Optionnel) Nettoyage quand on quitte l'écran de jeu ======
function leaveGameScreen() {
  if (practiceA.clickHandler) {
    CANVAS.removeEventListener("click", practiceA.clickHandler);
    practiceA.clickHandler = null;
  }
  stopTimer(practiceA);
}

async function startTestA() {
  detachAllCanvasHandlers();
  console.log("Test A");
  setPhase("Test A");

  // reset (sur testA et pas practiceA)
  testA.progress = 0;
  testA.errors = 0;
  testA.startedAt = 0;
  if (testA.clickHandler) {
    CANVAS.removeEventListener("click", testA.clickHandler);
    testA.clickHandler = null;
  }
  setErrors(0);
  setTime(0);
  showScreen("game-screen");

  // charge CSV puis dessine
  testA.nodes = await loadPositionsCSV(CSV_URL_TEST_A); // (assure-toi que les nodes sont triés par 'order' croissant)
  testA.nodes.sort((a, b) => a.order - b.order);

  // 2) construis la transform vers pixels canvas (800×500)
  const T = makeTransform(
    testA.nodes,
    CANVAS.width,
    CANVAS.height,
    NODE_RADIUS
  );

  // 3) crée une copie "pixelisée" pour le rendu et les clics
  testA.nodes = testA.nodes.map((n) => {
    const p = T.toPx(n.x, n.y);
    return { ...n, x: p.x, y: p.y }; // x,y deviennent des coords canvas en pixels
  });

  drawNodes(testA);
  startTimer(testA);

  // Affiche "départ" à la position du premier nœud (order = 1)
  if (testA.nodes.length > 0) {
    const first = testA.nodes[0];
    CTX.font = "bold 22px sans-serif";
    CTX.fillStyle = "#007bff";
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    CTX.fillText("départ", first.x, first.y - NODE_RADIUS - 18);
  }

  // branchement clics
  testA.clickHandler = handleClickTestA;
  CANVAS.addEventListener("click", testA.clickHandler, { passive: true });
}

async function startPracticeB() {
  detachAllCanvasHandlers();
  console.log("Practice B");
  setPhase("Entraînement B");
  // reset
  practiceB.progress = 0;
  practiceB.errors = 0;
  practiceB.startedAt = 0;
  if (practiceB.clickHandler) {
    CANVAS.removeEventListener("click", practiceB.clickHandler);
    practiceB.clickHandler = null;
  }

  // <-- retire TOUS les anciens handlers
  detachAllCanvasHandlers();

  setErrors(0);
  setTime(0);
  showScreen("game-screen");
  // charge CSV puis dessine
  practiceB.nodes = await loadPositionsCSV(CSV_URL_PRACTICE_B); // (assure-toi que les nodes sont triés par 'order' croissant)
  practiceB.nodes.sort((a, b) => a.order - b.order);
  // 2) construis la transform vers pixels canvas (800×500)
  const T = makeTransform(
    practiceB.nodes,
    CANVAS.width,
    CANVAS.height,
    NODE_RADIUS
  );
  // 3) crée une copie "pixelisée" pour le rendu et les clics
  practiceB.nodes = practiceB.nodes.map((n) => {
    const p = T.toPx(n.x, n.y);
    return { ...n, x: p.x, y: p.y }; // x,y deviennent des coords canvas en pixels
  });
  drawNodes(practiceB);
  startTimer(practiceB);

    // Affiche "départ" à la position du premier nœud (order = 1)
  if (practiceB.nodes.length > 0) {
    const first = practiceB.nodes[0];
    CTX.font = "bold 22px sans-serif";
    CTX.fillStyle = "#007bff";
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    CTX.fillText("départ", first.x, first.y - NODE_RADIUS - 18);
  }

  // branchement clics
  practiceB.clickHandler = handleClickPracticeB;
  CANVAS.addEventListener("click", practiceB.clickHandler, { passive: true });
}

async function startTestB() {
  detachAllCanvasHandlers();
  console.log("Test B");
  setPhase("Test B");
  // reset (sur testB et pas practiceB)
  testB.progress = 0;
  testB.errors = 0;
  testB.startedAt = 0;
  if (testB.clickHandler) {
    CANVAS.removeEventListener("click", testB.clickHandler);
    testB.clickHandler = null;
  }
  setErrors(0);
  setTime(0);
  showScreen("game-screen");

  // <-- retire TOUS les anciens handlers
  detachAllCanvasHandlers();

  // charge CSV puis dessine
  testB.nodes = await loadPositionsCSV(CSV_URL_TEST_B); // (assure-toi que les nodes sont triés par 'order' croissant)
  testB.nodes.sort((a, b) => a.order - b.order);
  // 2) construis la transform vers pixels canvas (800×500)
  const T = makeTransform(
    testB.nodes,
    CANVAS.width,
    CANVAS.height,
    NODE_RADIUS
  );
  // 3) crée une copie "pixelisée" pour le rendu et les clics
  testB.nodes = testB.nodes.map((n) => {
    const p = T.toPx(n.x, n.y);
    return { ...n, x: p.x, y: p.y }; // x,y deviennent des coords canvas en pixels
  });
  drawNodes(testB);
  startTimer(testB);

    // Affiche "départ" à la position du premier nœud (order = 1)
  if (testB.nodes.length > 0) {
    const first = testB.nodes[0];
    CTX.font = "bold 22px sans-serif";
    CTX.fillStyle = "#007bff";
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    CTX.fillText("départ", first.x, first.y - NODE_RADIUS - 18);
  }

  // branchement clics
  testB.clickHandler = handleClickTestB;
  CANVAS.addEventListener("click", testB.clickHandler, { passive: true });
}


// ---- UI helpers ----
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((el) => el.classList.remove("active"));
  const next = document.getElementById(id);
  if (next) next.classList.add("active");
}

// ---- Start Test (GARDER CETTE SEULE DÉFINITION) ----
// function startTest() {
//   const pid = document.getElementById("participant-id").value.trim();
//   if (!pid) {
//     alert("Merci d’entrer le code participant.");
//     return;
//   }

//   console.log("Start test pour:", pid);
//   // TODO: init logique du test ici (reset erreurs, timer, etc.)
//   showScreen("practice-a-screen");
// }

function startTest() {
  const pid = document.getElementById("participant-id").value.trim();
  if (!pid) {
    alert("Merci d’entrer le code participant.");
    return;
  }
  PARTICIPANT_ID = pid; // <-- mémorise le code
  console.log("Start test pour:", pid);
  showScreen("practice-a-screen");
}

function skipToNext() {
  console.log("Skip");
  // TODO: logique de skip
}

function restartTest() {
  console.log("Restart");
  // TODO: reset de tout l’état
  showScreen("welcome-screen");
}

// ---- Branchement des boutons (ne pas redéclarer les fonctions ci-dessus) ----
document.getElementById("start-test-btn")?.addEventListener("click", startTest);
document
  .getElementById("start-practice-a-btn")
  ?.addEventListener("click", startPracticeA);
document
  .getElementById("start-test-a-btn")
  ?.addEventListener("click", startTestA);
document
  .getElementById("start-practice-b-btn")
  ?.addEventListener("click", startPracticeB);
document
  .getElementById("start-test-b-btn")
  ?.addEventListener("click", startTestB);
document.getElementById("skip-btn")?.addEventListener("click", skipToNext);
document
  .getElementById("download-results-btn")
  ?.addEventListener("click", downloadResults);
document.getElementById("restart-btn")?.addEventListener("click", restartTest);

// Optionnel : s’assurer que l’écran d’accueil est visible au chargement
showScreen("welcome-screen");

const testFiles = [
  "tmt_positions_A_entrainement.csv",
  "tmt_positions_A.csv",
  "tmt_positions_B_entrainement.csv",
  "tmt_positions_B.csv",
];

for (const file of testFiles) {
  try {
    const res = await fetch(file);
    if (!res.ok) {
      console.error(`❌ Impossible de charger ${file}`);
      continue;
    }
    const text = await res.text();
    console.log(
      `✅ ${file} chargé (${text.split(/\r?\n/).length - 1} lignes détectées)`
    );
  } catch (err) {
    console.error(`⚠️ Erreur pour ${file}:`, err);
  }
}


