/* ═══════════════════════════════════════════════════════════════════════════
   HydroWatch — Complete Frontend Application

   Features:
   ① Open-Meteo API   → Live weather for all 12 TN district cities (free)
   ② data.gov.in      → Real TN water supply stats via backend proxy
   ③ CMWSSB Reservoir → Real Chennai reservoir fill levels
   ④ Backend API      → Calls :8000 every 4s — triggers SMS alerts
   ⑤ Local fallback   → Works without backend (no SMS)
   ⑥ Theme toggle     → Light / Dark mode with localStorage
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_BASE:     "http://127.0.0.1:8000",
  WEATHER_BASE:     "https://api.open-meteo.com/v1/forecast",
  DATA_GOV_API_KEY: "579b464db66ec23bdd000001cdd3946e44ce4aab08512d4a9571e665",
  REFRESH_MS:       4000,
  WEATHER_REFRESH:  300000,
};

// ── Tamil Nadu Pipelines (real GPS coordinates) ───────────────────────────
const TN_PIPELINES = [
  { id:"P-101", zone:"Chennai Zone A",    district:"Chennai",     lat:13.0827, lng:80.2707, age:18, diameter:400 },
  { id:"P-102", zone:"Chennai Zone B",    district:"Chennai",     lat:13.0569, lng:80.2425, age:22, diameter:350 },
  { id:"P-103", zone:"Coimbatore North",  district:"Coimbatore",  lat:11.0168, lng:76.9558, age:12, diameter:300 },
  { id:"P-104", zone:"Madurai Central",   district:"Madurai",     lat:9.9252,  lng:78.1198, age:28, diameter:500 },
  { id:"P-105", zone:"Tiruchirappalli",   district:"Trichy",      lat:10.7905, lng:78.7047, age:15, diameter:350 },
  { id:"P-106", zone:"Salem Main",        district:"Salem",       lat:11.6643, lng:78.1460, age:10, diameter:250 },
  { id:"P-107", zone:"Vellore East",      district:"Vellore",     lat:12.9165, lng:79.1325, age:19, diameter:300 },
  { id:"P-108", zone:"Tirunelveli South", district:"Tirunelveli", lat:8.7139,  lng:77.7567, age:32, diameter:400 },
  { id:"P-109", zone:"Thanjavur Old",     district:"Thanjavur",   lat:10.7870, lng:79.1378, age:35, diameter:300 },
  { id:"P-110", zone:"Erode West",        district:"Erode",       lat:11.3410, lng:77.7172, age:8,  diameter:200 },
  { id:"P-111", zone:"Thoothukudi Port",  district:"Thoothukudi", lat:8.7642,  lng:78.1348, age:20, diameter:350 },
  { id:"P-112", zone:"Dindigul Central",  district:"Dindigul",    lat:10.3673, lng:77.9803, age:14, diameter:250 },
];

// ── App State ─────────────────────────────────────────────────────────────
const State = {
  pipelines:         {},
  incidents:         [],
  weatherByDistrict: {},
  govWaterStats:     [],
  reservoirData:     [],
  charts:            {},
  maps:              {},
  pressureHistory:   [],
  flowHistory:       [],
  timeLabels:        [],
  tempHistory:       [],
  vibHistory:        [],
  lossHistory:       [],
  probHistory:       [],
  sysMetrics:        { cpu:[], mem:[], lat:[], labels:[] },
  activeChart:       "pressure",
  currentPage:       "dashboard",
  backendOnline:     false,
  settings:          { warnThresh:0.40, critThresh:0.75 },
};

// ══════════════════════════════════════════════════════════════════════════
//  REAL API 1 — Open-Meteo: Live weather for all 12 TN cities
// ══════════════════════════════════════════════════════════════════════════
async function fetchWeatherForAll() {
  const lats = TN_PIPELINES.map(p => p.lat).join(",");
  const lngs = TN_PIPELINES.map(p => p.lng).join(",");
  const url  = CONFIG.WEATHER_BASE
             + "?latitude=" + lats + "&longitude=" + lngs
             + "&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,apparent_temperature"
             + "&timezone=Asia%2FKolkata&forecast_days=1";
  try {
    setBadge("badge-weather", "Fetching...", "#f59e0b");
    const res  = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const results = Array.isArray(data) ? data : [data];
    results.forEach((w, i) => {
      const p = TN_PIPELINES[i];
      if (!p || !w.current) return;
      State.weatherByDistrict[p.district] = {
        temperature:   w.current.temperature_2m       || 28,
        feels_like:    w.current.apparent_temperature  || 28,
        precipitation: w.current.precipitation         || 0,
        wind_speed:    w.current.wind_speed_10m        || 12,
        humidity:      w.current.relative_humidity_2m  || 65,
        source:        "Open-Meteo (live)",
        fetched_at:    new Date().toLocaleTimeString("en-IN"),
      };
    });
    setBadge("badge-weather", "Live — Open-Meteo API", "#22c55e");
    updateWeatherPanel();
    console.log("Open-Meteo: weather loaded for", Object.keys(State.weatherByDistrict).length, "districts");
  } catch (err) {
    console.warn("Open-Meteo failed:", err.message, "using seasonal fallback");
    const marchTemps = { Chennai:30, Coimbatore:28, Madurai:33, Trichy:32, Salem:29,
      Tirunelveli:32, Vellore:29, Thanjavur:31, Erode:29, Thoothukudi:31, Dindigul:30 };
    TN_PIPELINES.forEach(p => {
      State.weatherByDistrict[p.district] = {
        temperature:   marchTemps[p.district] || 30,
        feels_like:    (marchTemps[p.district] || 30) + 2,
        precipitation: Math.random() < 0.1 ? +(Math.random() * 3).toFixed(1) : 0,
        wind_speed:    10 + Math.random() * 8,
        humidity:      55 + Math.random() * 25,
        source:        "Seasonal fallback (Mar avg)",
        fetched_at:    new Date().toLocaleTimeString("en-IN"),
      };
    });
    setBadge("badge-weather", "Fallback (seasonal avg)", "#f59e0b");
    updateWeatherPanel();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  REAL API 2 — data.gov.in via backend proxy (avoids CORS)
// ══════════════════════════════════════════════════════════════════════════
async function fetchGovWaterStats() {
  setBadge("badge-govdata", "Loading...", "#f59e0b");
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 3000);
    const res  = await fetch(CONFIG.BACKEND_BASE + "/api/proxy/govdata", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.records && data.records.length > 0) {
      State.govWaterStats = data.records;
      const isLive = data.source && data.source.includes("live");
      setBadge("badge-govdata", isLive ? "Live — data.gov.in API" : "TWAD Board Data", isLive ? "#22c55e" : "#38bdf8");
      updateGovDataPanel();
      console.log("Gov data via backend:", data.records.length, "records");
      return;
    }
  } catch (e) {
    // Backend not running - use reference data silently
  }
  State.govWaterStats = getTWADReferenceData();
  setBadge("badge-govdata", "TWAD Board 2023-24", "#38bdf8");
  updateGovDataPanel();
  console.log("TWAD Board reference data loaded");
}

function getTWADReferenceData() {
  return [
    { district:"Chennai",     hsc_connections:850000, coverage_pct:98, daily_supply_MLD:950, pipeline_km:3840, loss_pct:28, population:7088000 },
    { district:"Coimbatore",  hsc_connections:410000, coverage_pct:94, daily_supply_MLD:380, pipeline_km:1920, loss_pct:21, population:3458045 },
    { district:"Madurai",     hsc_connections:295000, coverage_pct:88, daily_supply_MLD:290, pipeline_km:1650, loss_pct:32, population:3038252 },
    { district:"Trichy",      hsc_connections:248000, coverage_pct:91, daily_supply_MLD:240, pipeline_km:1280, loss_pct:24, population:2713858 },
    { district:"Salem",       hsc_connections:198000, coverage_pct:92, daily_supply_MLD:185, pipeline_km:1100, loss_pct:19, population:3482056 },
    { district:"Tirunelveli", hsc_connections:180000, coverage_pct:85, daily_supply_MLD:168, pipeline_km:980,  loss_pct:35, population:3077716 },
    { district:"Vellore",     hsc_connections:175000, coverage_pct:87, daily_supply_MLD:162, pipeline_km:820,  loss_pct:26, population:3936331 },
    { district:"Thanjavur",   hsc_connections:162000, coverage_pct:83, daily_supply_MLD:150, pipeline_km:720,  loss_pct:38, population:2402781 },
    { district:"Erode",       hsc_connections:155000, coverage_pct:93, daily_supply_MLD:144, pipeline_km:760,  loss_pct:17, population:2251744 },
    { district:"Thoothukudi", hsc_connections:142000, coverage_pct:86, daily_supply_MLD:133, pipeline_km:580,  loss_pct:27, population:1750176 },
    { district:"Dindigul",    hsc_connections:134000, coverage_pct:82, daily_supply_MLD:125, pipeline_km:640,  loss_pct:23, population:2159775 },
  ];
}

// ══════════════════════════════════════════════════════════════════════════
//  REAL DATA 3 — CMWSSB Chennai Reservoir Levels (Mar 2025)
// ══════════════════════════════════════════════════════════════════════════
function loadReservoirData() {
  State.reservoirData = [
    { name:"Poondi Reservoir",        capacity_mcft:3231, current_mcft:1890, fill_pct:58.5, source:"CMWSSB" },
    { name:"Chembarambakkam Lake",     capacity_mcft:3645, current_mcft:2102, fill_pct:57.7, source:"CMWSSB" },
    { name:"Red Hills (Puzhal) Lake",  capacity_mcft:3300, current_mcft:1848, fill_pct:56.0, source:"CMWSSB" },
    { name:"Cholavaram Lake",          capacity_mcft:1081, current_mcft:540,  fill_pct:49.9, source:"CMWSSB" },
  ];
  updateReservoirPanel();
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN SIMULATION LOOP
//  Tries backend first (triggers SMS) then falls back to local simulation
// ══════════════════════════════════════════════════════════════════════════
async function runSimulation() {
  // Try backend — this triggers SMS alerts server-side automatically
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 3000);
    const res  = await fetch(CONFIG.BACKEND_BASE + "/api/pipelines/live/all", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      State.backendOnline = true;
      data.data.forEach(item => {
        const sensor = item.sensor;
        const pred   = item.prediction;
        const pid    = sensor.pipelineId;
        State.pipelines[pid] = { sensor, pred };
        updateMarker(pid, { NORMAL:"normal", WARNING:"warning", CRITICAL:"critical" }[pred.severity]);
        if (pred.severity !== "NORMAL") addIncident(sensor, pred);
      });
      if (data.data.length > 0) {
        pushHistory(data.data[0].sensor, data.data[0].prediction);
        updateCharts(data.data[0].sensor, data.data[0].prediction);
      }
      updateKPIs();
      updateAlertsPanel();
      renderIncidentTable("incidents-body");
      renderIncidentTable("incidents-body2");
      updateRiskList();
      return;
    }
  } catch (e) {
    State.backendOnline = false;
  }

  // Local fallback simulation (no SMS)
  const pipeline = TN_PIPELINES[Math.floor(Math.random() * TN_PIPELINES.length)];
  const sensor   = simulateSensor(pipeline);
  const pred     = predictLeak(sensor);
  State.pipelines[pipeline.id] = { sensor, pred };
  pushHistory(sensor, pred);
  updateKPIs();
  updateCharts(sensor, pred);
  updateAlertsPanel();
  updateMarker(pipeline.id, { NORMAL:"normal", WARNING:"warning", CRITICAL:"critical" }[pred.severity]);
  if (pred.severity !== "NORMAL") addIncident(sensor, pred);
  renderIncidentTable("incidents-body");
  renderIncidentTable("incidents-body2");
  updateRiskList();
}

function pushHistory(sensor, pred) {
  const timeLabel = new Date().toLocaleTimeString("en-IN", { hour12:false });
  const push = (a, v) => { a.push(v); if (a.length > 20) a.shift(); };
  push(State.pressureHistory, sensor.pressure);
  push(State.flowHistory,     sensor.flowRate);
  push(State.timeLabels,      timeLabel);
  push(State.tempHistory,     sensor.temperature);
  push(State.vibHistory,      sensor.vibration);
  push(State.lossHistory,     pred.waterLoss);
  push(State.probHistory,     +(pred.probability * 100).toFixed(1));
}

// ══════════════════════════════════════════════════════════════════════════
//  SENSOR SIMULATION — grounded in real weather data
// ══════════════════════════════════════════════════════════════════════════
function simulateSensor(pipeline) {
  const w         = State.weatherByDistrict[pipeline.district] || {};
  const realTemp  = w.temperature   || 29;
  const rainfall  = w.precipitation || 0;
  const humidity  = w.humidity      || 65;
  const wind      = w.wind_speed    || 12;
  const age       = pipeline.age;
  const ageFactor = Math.min(age / 40.0, 1.0);

  const thermalShift = (realTemp - 25) * 0.5;
  const rainBoost    = rainfall > 2 ? 6 : 0;
  const humidFlow    = humidity > 70 ? 12 : 0;
  const windVib      = wind > 20 ? 0.08 : 0;

  let pressure  = 62 + thermalShift + rainBoost  + Math.random() * 18 + ageFactor * 8;
  let flowRate  = 295 - ageFactor * 38 + humidFlow + Math.random() * 40;
  let vibration = 0.12 + ageFactor * 0.22 + windVib + Math.random() * 0.18;

  const anomalyProb = 0.10 + ageFactor * 0.12 + (rainfall > 3 ? 0.08 : 0) + (realTemp > 35 ? 0.05 : 0);
  const anomaly = Math.random() < anomalyProb;
  if (anomaly) {
    const t = Math.random();
    if      (t < 0.33) { pressure  += 20 + Math.random() * 22; vibration += 0.3; }
    else if (t < 0.66) { flowRate  -= 75 + Math.random() * 85; pressure  += 14; }
    else               { vibration += 0.45 + Math.random() * 0.5; }
  }

  return {
    pipelineId:    pipeline.id,
    zone:          pipeline.zone,
    district:      pipeline.district,
    lat:           pipeline.lat,
    lng:           pipeline.lng,
    age,
    pressure:      +Math.max(20, pressure).toFixed(1),
    flowRate:      +Math.max(0,  flowRate).toFixed(1),
    temperature:   +realTemp.toFixed(1),
    humidity:      +humidity.toFixed(1),
    rainfall:      +rainfall.toFixed(2),
    vibration:     +Math.max(0, vibration).toFixed(3),
    anomaly,
    weatherSource: w.source || "simulated",
    timestamp:     new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  AI LEAK PREDICTION
// ══════════════════════════════════════════════════════════════════════════
function predictLeak(sensor) {
  const { pressure, flowRate, temperature, vibration, age, rainfall = 0 } = sensor;
  let score = 0;
  if (pressure    > 90)   score += 0.35;
  else if (pressure > 75) score += 0.15;
  if (pressure    < 40)   score += 0.20;
  if (flowRate    < 210)  score += 0.30;
  else if (flowRate < 260) score += 0.12;
  if (vibration   > 0.75) score += 0.25;
  else if (vibration > 0.55) score += 0.10;
  if (age         > 28)   score += 0.20;
  else if (age    > 18)   score += 0.08;
  if (temperature > 34)   score += 0.06;
  if (rainfall    > 3)    score += 0.04;
  score += (Math.random() - 0.5) * 0.08;
  score  = Math.max(0, Math.min(1, score));
  const { warnThresh, critThresh } = State.settings;
  let severity, waterLoss, action;
  if (score >= critThresh) {
    severity = "CRITICAL"; waterLoss = Math.round(800 + score * 600); action = "Immediate shutdown required";
  } else if (score >= warnThresh) {
    severity = "WARNING";  waterLoss = Math.round(200 + score * 400); action = "Inspect within 24 hours";
  } else {
    severity = "NORMAL";   waterLoss = Math.round(score * 80);        action = "Continue monitoring";
  }
  return { probability:+score.toFixed(3), severity, waterLoss, action };
}

// ══════════════════════════════════════════════════════════════════════════
//  KPI UPDATER
// ══════════════════════════════════════════════════════════════════════════
function updateKPIs() {
  const all    = Object.values(State.pipelines);
  const set    = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const alerts = all.filter(p => p.pred.severity !== "NORMAL").length;
  set("total-pipelines", TN_PIPELINES.length);
  set("active-alerts",   alerts);
  set("alert-badge",     alerts);
  set("notif-count",     alerts);
  set("alerts-count",    alerts);
  if (all.length) {
    const avgP = (all.reduce((s, p) => s + p.sensor.pressure, 0) / all.length).toFixed(0);
    const loss = all.reduce((s, p) => s + p.pred.waterLoss, 0);
    const ep = document.getElementById("avg-pressure"); if (ep) ep.innerHTML = avgP + " <small>PSI</small>";
    const el = document.getElementById("water-loss");   if (el) el.innerHTML = loss + " <small>L/hr</small>";
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  CHART UPDATER
// ══════════════════════════════════════════════════════════════════════════
function updateCharts(sensor, pred) {
  const c = State.charts;
  if (c.pressure) {
    const active = State.activeChart === "pressure" ? State.pressureHistory : State.flowHistory;
    const col    = State.activeChart === "pressure" ? "#38bdf8" : "#22c55e";
    c.pressure.data.labels                      = [...State.timeLabels];
    c.pressure.data.datasets[0].data            = [...active];
    c.pressure.data.datasets[0].borderColor     = col;
    c.pressure.data.datasets[0].backgroundColor = col + "14";
    c.pressure.update("none");
  }
  const probPct = +(pred.probability * 100).toFixed(1);
  if (c.leakProb) {
    c.leakProb.data.datasets[0].data = [probPct, 100 - probPct];
    c.leakProb.data.datasets[0].backgroundColor[0] =
      pred.severity === "CRITICAL" ? "#ef4444" : pred.severity === "WARNING" ? "#f59e0b" : "#22c55e";
    c.leakProb.update("none");
  }
  const gcol = { NORMAL:"#22c55e", WARNING:"#f59e0b", CRITICAL:"#ef4444" }[pred.severity];
  if (c.gauge) { c.gauge.data.datasets[0].data=[probPct,100-probPct]; c.gauge.data.datasets[0].backgroundColor[0]=gcol; c.gauge.update("none"); }
  const gl = document.getElementById("gauge-label");
  if (gl) { gl.textContent = probPct.toFixed(0) + "%"; gl.style.color = gcol; }
  const sevEl = document.getElementById("ai-severity");
  if (sevEl) { sevEl.textContent = pred.severity; sevEl.className = "ai-stat-value severity-" + pred.severity.toLowerCase(); }
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("ai-pipeline", sensor.pipelineId);
  set("ai-loss",     pred.waterLoss + " L/hr");
  set("ai-action",   pred.action);
  [[c.temp, State.tempHistory],[c.vib, State.vibHistory],[c.loss, State.lossHistory],[c.probTrend, State.probHistory]]
    .forEach(([chart, data]) => {
      if (!chart) return;
      chart.data.labels = [...State.timeLabels];
      chart.data.datasets[0].data = [...data];
      chart.update("none");
    });
}

// ══════════════════════════════════════════════════════════════════════════
//  ALERTS PANEL
// ══════════════════════════════════════════════════════════════════════════
function updateAlertsPanel() {
  const active = Object.values(State.pipelines)
    .filter(p => p.pred.severity !== "NORMAL")
    .sort((a, b) => b.pred.probability - a.pred.probability)
    .slice(0, 8);

  const render = p => {
    const cls = p.pred.severity.toLowerCase();
    const w   = State.weatherByDistrict[p.sensor.district] || {};
    const t   = new Date(p.sensor.timestamp).toLocaleTimeString("en-IN");
    return "<div class='alert-item " + cls + "'>"
      + "<div class='alert-dot'></div>"
      + "<div class='alert-info'>"
      + "<div class='alert-pipeline'>" + p.sensor.pipelineId + " \u2014 " + p.sensor.zone + "</div>"
      + "<div class='alert-meta'>" + p.sensor.district + " \u00b7 " + t + " \u00b7 Loss: " + p.pred.waterLoss + " L/hr</div>"
      + "<div class='alert-meta'>\uD83C\uDF21\uFE0F " + p.sensor.temperature + "\u00b0C"
      + (w.precipitation > 0.5 ? " \u00b7 \uD83C\uDF27\uFE0F " + w.precipitation + "mm rain" : "")
      + " \u00b7 " + p.pred.action + "</div>"
      + "</div>"
      + "<div class='alert-severity'>" + p.pred.severity + "</div>"
      + "</div>";
  };

  const html = active.length ? active.map(render).join("")
    : "<div style='padding:20px;text-align:center;color:#64748b;font-size:12px;'>"
    + "<i class='fa-solid fa-check-circle' style='color:#22c55e;margin-right:6px;'></i>All pipelines normal</div>";

  const list = document.getElementById("alerts-list");
  const full = document.getElementById("alerts-full-list");
  if (list) list.innerHTML = html;
  if (full) full.innerHTML = active.length ? "<div style='padding:12px;'>" + active.map(render).join("") + "</div>" : html;

  if (active.some(p => p.pred.severity === "CRITICAL") && Math.random() < 0.12) {
    const cr = active.find(p => p.pred.severity === "CRITICAL");
    Swal.fire({
      toast: true, position: "top-end", icon: "error",
      title: "Leak: " + cr.sensor.pipelineId,
      text:  cr.sensor.zone + " \u2014 " + cr.pred.waterLoss + " L/hr",
      showConfirmButton: false, timer: 4000,
      background: "rgba(6,13,26,0.95)", color: "#e2e8f0", timerProgressBar: true,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  INCIDENT LOG
// ══════════════════════════════════════════════════════════════════════════
function addIncident(sensor, pred) {
  const statuses = ["Open","Monitoring","Open","Resolved"];
  State.incidents.unshift({
    id:       sensor.pipelineId,
    location: sensor.zone + ", " + sensor.district,
    severity: pred.severity,
    time:     new Date(sensor.timestamp).toLocaleString("en-IN"),
    loss:     pred.waterLoss,
    status:   statuses[Math.floor(Math.random() * statuses.length)],
    temp:     sensor.temperature,
    rainfall: sensor.rainfall || 0,
  });
  if (State.incidents.length > 50) State.incidents.pop();
}

function resolveIncidentRow(btn) {
  const statusCell = btn.closest("tr").cells[5];
  statusCell.innerHTML = "<span class='status-badge status-resolved'>Resolved</span>";
  btn.disabled      = true;
  btn.style.opacity = "0.4";
  btn.textContent   = "Resolved";
}

function renderIncidentTable(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const q = (document.getElementById("incident-search") || document.getElementById("inc-search2") || {value:""}).value.toLowerCase();
  const rows = State.incidents
    .filter(i => i.id.toLowerCase().includes(q) || i.location.toLowerCase().includes(q) || i.severity.toLowerCase().includes(q))
    .slice(0, 20);
  const cls  = { CRITICAL:"severity-critical", WARNING:"severity-warning", NORMAL:"severity-normal" };
  const scls = { Open:"status-open", Monitoring:"status-monitoring", Resolved:"status-resolved" };
  const showAction = tbodyId === "incidents-body2";
  tbody.innerHTML = rows.map(i =>
    "<tr>"
    + "<td style='font-family:var(--font-mono);font-weight:600;'>" + i.id + "</td>"
    + "<td style='color:var(--text2);'>" + i.location + "</td>"
    + "<td><span class='ai-stat-value " + cls[i.severity] + "' style='font-size:11px;'>" + i.severity + "</span></td>"
    + "<td style='color:var(--text2);font-size:11px;'>" + i.time + "</td>"
    + "<td style='font-family:var(--font-mono);'>" + i.loss + "</td>"
    + "<td><span class='status-badge " + scls[i.status] + "'>" + i.status + "</span></td>"
    + (showAction ? "<td><button onclick='resolveIncidentRow(this)' style='background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;'>Resolve</button></td>" : "")
    + "</tr>"
  ).join("");
}

function filterIncidents()  { renderIncidentTable("incidents-body"); }
function filterIncidents2() { renderIncidentTable("incidents-body2"); }

// ══════════════════════════════════════════════════════════════════════════
//  RISK LIST
// ══════════════════════════════════════════════════════════════════════════
function updateRiskList() {
  const el = document.getElementById("risk-list");
  if (!el) return;
  const risks = TN_PIPELINES.map(p => {
    const s     = State.pipelines[p.id];
    const score = s ? s.pred.probability : (p.age / 40) * 0.45 + Math.random() * 0.2;
    return { id:p.id, zone:p.zone, score:+score.toFixed(2), age:p.age };
  }).sort((a, b) => b.score - a.score);
  el.innerHTML = risks.map(r => {
    const color = r.score > 0.7 ? "#ef4444" : r.score > 0.4 ? "#f59e0b" : "#22c55e";
    return "<div class='risk-item'><div>"
      + "<div style='font-family:var(--font-mono);font-weight:600;font-size:12px;'>" + r.id + "</div>"
      + "<div style='font-size:11px;color:var(--text2);'>" + r.zone + " \u00b7 " + r.age + "yr</div>"
      + "</div><div class='risk-score' style='color:" + color + ";'>" + (r.score * 100).toFixed(0) + "%</div></div>";
  }).join("");
}

// ══════════════════════════════════════════════════════════════════════════
//  PANEL RENDERERS
// ══════════════════════════════════════════════════════════════════════════
function updateWeatherPanel() {
  const el = document.getElementById("weather-panel-body");
  if (!el) return;
  el.innerHTML = Object.entries(State.weatherByDistrict).map(function(entry) {
    const dist = entry[0], w = entry[1];
    const tempColor = w.temperature > 35 ? "#ef4444" : w.temperature > 30 ? "#f59e0b" : "#38bdf8";
    const rainText  = w.precipitation > 0.1 ? "Rain " + w.precipitation.toFixed(1) + "mm" : "Dry";
    return "<div class='weather-row'>"
      + "<span class='weather-dist'>" + dist + "</span>"
      + "<span class='weather-temp' style='color:" + tempColor + ";'>" + w.temperature.toFixed(1) + "\u00b0C</span>"
      + "<span class='weather-rain " + (w.precipitation > 1 ? "raining" : "") + "'>" + rainText + "</span>"
      + "<span style='font-size:9px;color:var(--text3);'>" + w.source + "</span>"
      + "</div>";
  }).join("");
}

function updateGovDataPanel() {
  const el   = document.getElementById("govdata-panel-body");
  if (!el) return;
  const data = State.govWaterStats;
  if (!data.length) { el.innerHTML = "<div style='padding:12px;color:var(--text3);'>Loading...</div>"; return; }
  const isGovRaw = data[0].hasOwnProperty("ULB_Name") || data[0].hasOwnProperty("Corporation_Municipality");
  if (isGovRaw) {
    el.innerHTML = data.slice(0, 10).map(function(r) {
      const name = r.ULB_Name || r.Corporation_Municipality || r.city || "";
      const hsc  = r.Total_HSC || r.HSC_Connections || r.hsc || "\u2014";
      return "<div class='govdata-row'><span class='govdata-dist'>" + name + "</span><span class='govdata-val'>" + Number(hsc).toLocaleString() + " HSC</span></div>";
    }).join("");
  } else {
    el.innerHTML = data.map(function(d) {
      return "<div class='govdata-row'>"
        + "<span class='govdata-dist'>" + d.district + "</span>"
        + "<span class='govdata-val'>" + (d.hsc_connections / 1000).toFixed(0) + "K connections</span>"
        + "<span class='govdata-val2'>" + d.coverage_pct + "% coverage \u00b7 " + d.daily_supply_MLD + " MLD</span>"
        + "<span class='govdata-loss loss-badge'>" + d.loss_pct + "% loss</span>"
        + "</div>";
    }).join("");
  }
}

function updateReservoirPanel() {
  const el = document.getElementById("reservoir-panel-body");
  if (!el) return;
  el.innerHTML = State.reservoirData.map(function(r) {
    const color = r.fill_pct > 60 ? "#22c55e" : r.fill_pct > 35 ? "#f59e0b" : "#ef4444";
    return "<div class='reservoir-row'>"
      + "<div><div class='reservoir-name'>" + r.name + "</div>"
      + "<div class='reservoir-meta'>" + r.current_mcft.toLocaleString() + " / " + r.capacity_mcft.toLocaleString() + " MCft \u00a0|\u00a0 " + r.source + "</div></div>"
      + "<div class='reservoir-right'>"
      + "<div class='reservoir-pct' style='color:" + color + ";'>" + r.fill_pct + "%</div>"
      + "<div class='reservoir-bar-wrap'><div class='reservoir-bar-fill' style='width:" + r.fill_pct + "%;background:" + color + ";'></div></div>"
      + "</div></div>";
  }).join("");
}

function setBadge(id, text, color) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.style.color = color; }
}

// ══════════════════════════════════════════════════════════════════════════
//  MAPS
// ══════════════════════════════════════════════════════════════════════════
function initMaps() {
  var tile = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  ["mini-map","full-map"].forEach(function(id) {
    var el = document.getElementById(id); if (!el) return;
    var m = L.map(id, { zoomControl: id !== "mini-map", attributionControl: false }).setView([10.7, 78.5], id === "mini-map" ? 6 : 7);
    L.tileLayer(tile).addTo(m);
    State.maps[id] = m;
  });
  TN_PIPELINES.forEach(function(p) {
    ["mini-map","full-map"].forEach(function(id) {
      if (!State.maps[id]) return;
      var mk = makeMarker(p, "normal");
      mk.addTo(State.maps[id]);
      State.maps[p.id + "_" + id] = mk;
    });
  });
}

function makeMarker(pipeline, status) {
  var colors = { normal:"#22c55e", warning:"#f59e0b", critical:"#ef4444" };
  var c  = colors[status] || colors.normal;
  var sz = status === "critical" ? 16 : 12;
  var icon = L.divIcon({
    className: "",
    html: "<div style='width:" + sz + "px;height:" + sz + "px;background:" + c + ";border:2px solid rgba(255,255,255,0.8);border-radius:50%;box-shadow:0 0 " + sz + "px " + c + ";'></div>",
    iconSize:   [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
  var w     = State.weatherByDistrict[pipeline.district];
  var wInfo = w ? "<br/>\uD83C\uDF21\uFE0F " + w.temperature.toFixed(1) + "\u00b0C &nbsp; \uD83D\uDCA7" + w.precipitation.toFixed(1) + "mm<br/><span style='font-size:9px;color:#64748b;'>" + w.source + "</span>" : "";
  var m = L.marker([pipeline.lat, pipeline.lng], { icon: icon });
  m.bindPopup("<div style='font-family:Inter,sans-serif;font-size:12px;min-width:200px;'>"
    + "<b style='color:#38bdf8;font-size:14px;'>" + pipeline.id + "</b><br/>"
    + "<b>" + pipeline.zone + "</b><br/>"
    + "District: " + pipeline.district + "<br/>"
    + "Age: " + pipeline.age + " yrs | \u2300" + pipeline.diameter + "mm" + wInfo + "</div>");
  return m;
}

function updateMarker(pipelineId, status) {
  var pipeline = TN_PIPELINES.find(function(p) { return p.id === pipelineId; });
  if (!pipeline) return;
  ["mini-map","full-map"].forEach(function(id) {
    var key = pipelineId + "_" + id;
    if (!State.maps[key] || !State.maps[id]) return;
    State.maps[key].remove();
    var m = makeMarker(pipeline, status);
    m.addTo(State.maps[id]);
    State.maps[key] = m;
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  CHARTS INIT
// ══════════════════════════════════════════════════════════════════════════
function initCharts() {
  var tc = "#64748b";
  var lo = {
    responsive: true, animation: { duration:300 },
    plugins: { legend: { display:false } },
    scales: {
      x: { ticks:{ color:tc, font:{ size:10 }}, grid:{ color:"rgba(56,189,248,0.08)" }},
      y: { ticks:{ color:tc, font:{ size:10 }}, grid:{ color:"rgba(56,189,248,0.08)" }},
    },
  };
  var mk = function(id, ds, opts) {
    var ctx = document.getElementById(id); if (!ctx) return null;
    return new Chart(ctx, { type:"line", data:{ labels:[], datasets:[ds] }, options: Object.assign({}, lo, opts || {}) });
  };
  State.charts.pressure  = mk("pressureChart",  { label:"",data:[],borderColor:"#38bdf8",backgroundColor:"rgba(56,189,248,0.08)",borderWidth:2,tension:0.4,pointRadius:0,fill:true });
  State.charts.temp      = mk("tempChart",       { label:"",data:[],borderColor:"#f97316",backgroundColor:"rgba(249,115,22,0.08)", borderWidth:2,tension:0.4,pointRadius:0,fill:true });
  State.charts.vib       = mk("vibChart",        { label:"",data:[],borderColor:"#8b5cf6",backgroundColor:"rgba(139,92,246,0.08)",borderWidth:2,tension:0.4,pointRadius:0,fill:true });
  State.charts.loss      = mk("lossChart",       { label:"",data:[],borderColor:"#ef4444",backgroundColor:"rgba(239,68,68,0.08)", borderWidth:2,tension:0.4,pointRadius:0,fill:true });
  State.charts.probTrend = mk("probTrendChart",  { label:"",data:[],borderColor:"#22c55e",backgroundColor:"rgba(34,197,94,0.08)", borderWidth:2,tension:0.4,pointRadius:0,fill:true });

  var g2 = document.getElementById("leakProbChart");
  if (g2) State.charts.leakProb = new Chart(g2, {
    type:"doughnut",
    data:{ labels:["Risk","Safe"], datasets:[{ data:[0,100], backgroundColor:["#ef4444","rgba(56,189,248,0.15)"], borderColor:["#ef4444","rgba(56,189,248,0.2)"], borderWidth:1 }]},
    options:{ responsive:true, cutout:"75%", plugins:{ legend:{ display:false }}},
  });
  var g3 = document.getElementById("gaugeChart");
  if (g3) State.charts.gauge = new Chart(g3, {
    type:"doughnut",
    data:{ datasets:[{ data:[0,100], backgroundColor:["#38bdf8","rgba(56,189,248,0.1)"], borderWidth:0, circumference:180, rotation:270 }]},
    options:{ responsive:false, plugins:{ legend:{ display:false }}, cutout:"70%" },
  });
  var g4 = document.getElementById("sysChart");
  if (g4) State.charts.sys = new Chart(g4, {
    type:"line",
    data:{ labels:[], datasets:[
      { label:"CPU%",    data:[], borderColor:"#38bdf8", borderWidth:2, tension:0.4, pointRadius:0 },
      { label:"Memory%", data:[], borderColor:"#8b5cf6", borderWidth:2, tension:0.4, pointRadius:0 },
      { label:"Latency", data:[], borderColor:"#f59e0b", borderWidth:2, tension:0.4, pointRadius:0 },
    ]},
    options: Object.assign({}, lo, { plugins:{ legend:{ display:true, labels:{ color:"#94a3b8", font:{ size:11 }}}}}),
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  SYSTEM MONITORING
// ══════════════════════════════════════════════════════════════════════════
function updateSystemMetrics() {
  var cpu = 18 + Math.random()*45, mem = 32 + Math.random()*38, lat = 8 + Math.random()*28, db = 8 + Math.random()*22;
  var set  = function(id,v,u){ var e=document.getElementById(id); if(e) e.textContent=v.toFixed(1)+u; };
  var fill = function(id,p){ var e=document.getElementById(id); if(e) e.style.width=Math.min(p,100)+"%"; };
  set("cpu-val",cpu,"%"); fill("cpu-fill",cpu); set("mem-val",mem,"%"); fill("mem-fill",mem);
  set("api-lat",lat,"ms"); fill("lat-fill",lat*3); set("db-val",db," conn"); fill("db-fill",db*3);
  var tl   = new Date().toLocaleTimeString("en-IN",{hour12:false});
  var push = function(a,v){ a.push(+v.toFixed(1)); if(a.length>20) a.shift(); };
  push(State.sysMetrics.cpu,cpu); push(State.sysMetrics.mem,mem); push(State.sysMetrics.lat,lat);
  State.sysMetrics.labels.push(tl); if(State.sysMetrics.labels.length>20) State.sysMetrics.labels.shift();
  if (State.charts.sys) {
    State.charts.sys.data.labels           = [...State.sysMetrics.labels];
    State.charts.sys.data.datasets[0].data = [...State.sysMetrics.cpu];
    State.charts.sys.data.datasets[1].data = [...State.sysMetrics.mem];
    State.charts.sys.data.datasets[2].data = [...State.sysMetrics.lat];
    State.charts.sys.update("none");
  }
  var containers = [
    {name:"hydrowatch-api",status:"Running",replicas:"3/3"},{name:"hydrowatch-ml",status:"Running",replicas:"2/2"},
    {name:"hydrowatch-simulator",status:"Running",replicas:"1/1"},{name:"hydrowatch-frontend",status:"Running",replicas:"2/2"},
    {name:"postgres-db",status:"Running",replicas:"1/1"},{name:"prometheus",status:"Running",replicas:"1/1"},
    {name:"grafana",status:Math.random()>0.95?"Pending":"Running",replicas:"1/1"},
  ];
  var cl = document.getElementById("containers-list");
  if (cl) cl.innerHTML = containers.map(function(c) {
    return "<div class='container-row'><div><div class='container-name'>" + c.name + "</div><div style='font-size:10px;color:var(--text3);'>" + c.replicas + " replicas</div></div><span class='" + c.status.toLowerCase() + "'>" + c.status + "</span></div>";
  }).join("");
  var pods = ["hydrowatch-api-pod-1","hydrowatch-api-pod-2","hydrowatch-ml-pod-1","simulator-pod-1","db-pod-1","frontend-pod-1"];
  var pl = document.getElementById("pods-list");
  if (pl) pl.innerHTML = pods.map(function(p) {
    return "<div class='pod-row'><span class='container-name'>" + p + "</span><span class='running'>Running</span></div>";
  }).join("");
}

// ══════════════════════════════════════════════════════════════════════════
//  WATER LOSS CALCULATOR
// ══════════════════════════════════════════════════════════════════════════
function calculateLoss() {
  var rate  = parseFloat(document.getElementById("calc-rate").value)  || 1000;
  var cost  = parseFloat(document.getElementById("calc-cost").value)  || 0.5;
  var hours = parseFloat(document.getElementById("calc-hours").value) || 24;
  var el    = document.getElementById("calc-result"); el.style.display="block";
  el.innerHTML = "<div style='color:var(--primary);margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;'>Results</div>"
    + "<div>Volume Lost: <b style='color:#ef4444;'>" + (rate*hours).toLocaleString() + " L</b></div>"
    + "<div>Cost/Hour: <b style='color:#f59e0b;'>\u20b9" + (rate*cost).toFixed(2) + "</b></div>"
    + "<div>Total (" + hours + "h): <b style='color:#ef4444;'>\u20b9" + (rate*hours*cost).toLocaleString("en-IN") + "</b></div>";
}

// ══════════════════════════════════════════════════════════════════════════
//  AI MANUAL PREDICTION
// ══════════════════════════════════════════════════════════════════════════
function runPrediction() {
  var sensor = {
    pressure:    parseFloat(document.getElementById("p-pressure").value) || 72,
    flowRate:    parseFloat(document.getElementById("p-flow").value)     || 340,
    temperature: parseFloat(document.getElementById("p-temp").value)     || 28,
    vibration:   parseFloat(document.getElementById("p-vib").value)      || 0.3,
    age:         parseFloat(document.getElementById("p-age").value)      || 12,
    rainfall:    0,
  };
  var pred    = predictLeak(sensor);
  var probPct = (pred.probability * 100).toFixed(1);
  var color   = { NORMAL:"#22c55e", WARNING:"#f59e0b", CRITICAL:"#ef4444" }[pred.severity];
  document.getElementById("pred-output").innerHTML =
    "<div class='pred-result'>"
    + "<div class='pred-prob' style='color:" + color + ";'>" + probPct + "%</div>"
    + "<div class='pred-label'>Leak Probability</div>"
    + "<div style='margin:16px 0;padding:12px;background:rgba(56,189,248,0.06);border-radius:8px;'>"
    + "<div style='font-size:20px;font-weight:700;color:" + color + ";font-family:var(--font-hud);'>" + pred.severity + "</div>"
    + "<div style='color:var(--text2);font-size:12px;margin-top:4px;'>Severity Level</div></div>"
    + "<div style='font-size:12px;color:var(--text2);margin-bottom:8px;'>Est. Water Loss: <b style='color:#ef4444;'>" + pred.waterLoss + " L/hr</b></div>"
    + "<div style='font-size:12px;padding:10px;background:rgba(56,189,248,0.08);border-radius:8px;color:var(--primary);'><i class='fa-solid fa-lightbulb'></i> " + pred.action + "</div>"
    + "</div>";
  if (pred.severity === "CRITICAL") {
    Swal.fire({ title:"Critical Leak!", html:"Probability: " + probPct + "%<br>Loss: " + pred.waterLoss + " L/hr<br>" + pred.action, icon:"error", background:"#0a1628", color:"#e2e8f0", confirmButtonColor:"#38bdf8" });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
function navigate(page) {
  document.querySelectorAll(".content").forEach(function(el) { el.classList.add("hidden"); });
  document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
  var pageEl = document.getElementById("page-" + page); if (pageEl) pageEl.classList.remove("hidden");
  var navEl  = document.querySelector("[data-page='" + page + "']");
  if (navEl) { navEl.classList.add("active"); var i=document.createElement("div"); i.className="nav-indicator"; navEl.appendChild(i); }
  var titles = { dashboard:"Dashboard Overview", map:"Pipeline Map", alerts:"Alert Management",
    analytics:"Analytics & Trends", incidents:"Incident Log", prediction:"AI Prediction Engine",
    monitoring:"System Monitoring", settings:"Settings" };
  var pt = document.getElementById("page-title"); if (pt) pt.textContent = titles[page] || page;
  State.currentPage = page;
  if (page === "map" && State.maps["full-map"]) setTimeout(function() { State.maps["full-map"].invalidateSize(); }, 100);
  if (page === "monitoring") updateSystemMetrics();
  if (page === "prediction") updateRiskList();
}

// ══════════════════════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════════════════════
function switchChart(type) {
  State.activeChart = type;
  document.querySelectorAll(".chart-btn").forEach(function(b) { b.classList.remove("active"); });
  event.target.classList.add("active");
}

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

function showNotifications() {
  var alerts = Object.values(State.pipelines).filter(function(p) { return p.pred.severity !== "NORMAL"; }).slice(0,5);
  var html = alerts.map(function(p) {
    var color = p.pred.severity === "CRITICAL" ? "#ef4444" : "#f59e0b";
    return "<div style='padding:8px 0;border-bottom:1px solid rgba(56,189,248,0.1);'>"
      + "<b style='color:" + color + "'>" + p.sensor.pipelineId + "</b> \u2014 " + p.sensor.zone + "<br>"
      + "<span style='font-size:12px;color:#94a3b8;'>" + p.pred.severity + " \u00b7 " + p.pred.waterLoss + " L/hr \u00b7 " + p.sensor.temperature + "\u00b0C</span></div>";
  }).join("") || "<p style='color:#94a3b8;'>No active alerts</p>";
  Swal.fire({ title:"Active Notifications", html:"<div style='font-family:Inter,sans-serif;text-align:left;'>" + html + "</div>", background:"#0a1628", color:"#e2e8f0", confirmButtonColor:"#38bdf8", width:440 });
}

function saveSettings() {
  State.settings.warnThresh = document.getElementById("warn-thresh").value / 100;
  State.settings.critThresh = document.getElementById("crit-thresh").value / 100;
  Swal.fire({ toast:true, position:"top-end", icon:"success", title:"Settings saved!", showConfirmButton:false, timer:2000, background:"rgba(6,13,26,0.95)", color:"#e2e8f0" });
}

function updateClock() {
  var el = document.getElementById("live-time");
  if (el) el.textContent = new Date().toLocaleTimeString("en-IN", { hour12:false });
}

// ══════════════════════════════════════════════════════════════════════════
//  THEME TOGGLE — Light / Dark mode
// ══════════════════════════════════════════════════════════════════════════
function toggleTheme() {
  var body    = document.body;
  var icon    = document.getElementById("themeIcon");
  var isLight = body.classList.toggle("light-theme");
  if (icon) icon.className = isLight ? "fa-solid fa-sun" : "fa-solid fa-moon";
  localStorage.setItem("hw-theme", isLight ? "light" : "dark");
}

// Restore saved theme on page load
(function applySavedTheme() {
  if (localStorage.getItem("hw-theme") === "light") {
    document.body.classList.add("light-theme");
    var icon = document.getElementById("themeIcon");
    if (icon) icon.className = "fa-solid fa-sun";
  }
})();

// ══════════════════════════════════════════════════════════════════════════
//  NAV CLICK HANDLERS
// ══════════════════════════════════════════════════════════════════════════
document.querySelectorAll(".nav-item").forEach(function(item) {
  item.addEventListener("click", function(e) {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async function() {
  initCharts();
  initMaps();
  updateClock();
  setInterval(updateClock, 1000);

  console.log("HydroWatch starting — fetching real Tamil Nadu data...");

  // 1. Real weather first (grounds sensor simulation)
  await fetchWeatherForAll();

  // 2. Government water stats (non-blocking)
  fetchGovWaterStats();

  // 3. Reservoir data
  loadReservoirData();

  // 4. Initial scan of all 12 pipelines
  TN_PIPELINES.forEach(function(p) {
    var sensor = simulateSensor(p);
    var pred   = predictLeak(sensor);
    State.pipelines[p.id] = { sensor:sensor, pred:pred };
    if (pred.severity !== "NORMAL") addIncident(sensor, pred);
    var statusMap = { NORMAL:"normal", WARNING:"warning", CRITICAL:"critical" };
    updateMarker(p.id, statusMap[pred.severity]);
  });

  // 5. First render
  updateKPIs();
  updateAlertsPanel();
  renderIncidentTable("incidents-body");
  renderIncidentTable("incidents-body2");
  updateRiskList();

  // 6. Start loops
  //    Backend running  → calls API every 4s → SMS sent automatically
  //    Backend offline  → local simulation   → no SMS
  await runSimulation();

  setInterval(runSimulation,       CONFIG.REFRESH_MS);
  setInterval(updateSystemMetrics, 5000);
  setInterval(fetchWeatherForAll,  CONFIG.WEATHER_REFRESH);
  setInterval(fetchGovWaterStats,  3600000);
});
