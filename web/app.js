// App: Live plot of Arduino DHT11 (temp, humidity) using Web Serial API + Chart.js

const connectButton = document.querySelector('#connectBtn');
const disconnectButton = document.querySelector('#disconnectBtn');
const settingsBtn = document.querySelector('#settingsBtn');
const exportCsvBtn = document.querySelector('#exportCsvBtn');

const settingsModal = document.querySelector('#settingsModal');
const closeSettingsBtn = document.querySelector('#closeSettingsBtn');
const closeSettingsBtn2 = document.querySelector('#closeSettingsBtn2');
const clearViewBtn = document.querySelector('#clearViewBtn');
const clearHistoryBtn = document.querySelector('#clearHistoryBtn');
const clearRawInSettings = document.querySelector('#clearRawInSettings');
const settingsSampleMs = document.querySelector('#settingsSampleMs');
const settingsApplySample = document.querySelector('#settingsApplySample');

const baudRateSelect = document.querySelector('#baudRate');
const connBadgeEl = document.querySelector('#connBadge');
const tempEl = document.querySelector('#tempValue');
const humEl = document.querySelector('#humValue');
const updatedLabelEl = document.querySelector('#updatedLabel');
const tempAvgValueEl = document.querySelector('#tempAvgValue');
const humAvgValueEl = document.querySelector('#humAvgValue');
const tempDeltaEl = document.querySelector('#tempDelta');
const humDeltaEl = document.querySelector('#humDelta');
const rawLogEl = document.querySelector('#rawLog');
const autoscrollEl = document.querySelector('#autoscroll');
const copyRawBtn = document.querySelector('#copyRaw');
const clearRawBtn = document.querySelector('#clearRawLog');
const rangeSelect = document.querySelector('#rangeSelect');
const chartPanel = document.querySelector('#chartPanel');
const rawPanel = document.querySelector('#rawPanel');
const toggleGraph = document.querySelector('#toggleGraph');
const toggleRaw = document.querySelector('#toggleRaw');
const liveWindowWrap = document.querySelector('#liveWindowWrap');
const liveWindowSelect = document.querySelector('#liveWindowSelect');

const chartCtx = document.getElementById('chart').getContext('2d');

// 24h time formatting for tooltips/axis via adapter
// We rely on browser locale but enforce 24h by options below

// Visible chart buffers (recent window)
const MAX_POINTS = 300; // visible points cap to keep UI smooth
let labels = [];
let tempData = [];
let humData = [];

// Live ring buffer to allow time windowing
const LIVE_MAX_BUFFER_MS = 15 * 60 * 1000; // keep up to 15 minutes in memory
let liveBuffer = []; // [{ts, t, h}]
let liveWindowMs = 2 * 60 * 1000; // default 2 minutes

// Persistent history (1-min cadence)
const HISTORY_KEY = 'dht_history_v1';
const HISTORY_SAVE_MS = 60_000; // save once per minute
const HISTORY_MAX_POINTS = 10_080; // 7 days @ 1/min
let lastReading = null;
let lastSavedMs = 0;
let fullHistory = []; // [{ts, t, h}]

// UI prefs
const PREFS_KEY = 'dht_prefs_v1';
let prefs = { showGraph: true, showRaw: false, liveWindowMs };

// Current view mode
let currentRange = 'live'; // 'live' | '1h' | '6h' | '24h' | '7d' | 'all'

const chart = new Chart(chartCtx, {
  type: 'line',
  data: { labels, datasets: [
    { label: 'Temp (°C)', data: tempData, borderColor: 'rgb(239, 68, 68)', backgroundColor: 'rgba(239, 68, 68, 0.2)', tension: 0.2, pointRadius: 0, yAxisID: 'yTemp', xAxisID: 'xTime' },
    { label: 'Humidity (%)', data: humData, borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.2)', tension: 0.2, pointRadius: 0, yAxisID: 'yHum', xAxisID: 'xTime' },
  ] },
  options: {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    normalized: true,
    scales: {
      xTime: {
        type: 'time',
        time: {
          tooltipFormat: 'yyyy-MM-dd HH:mm:ss',
          displayFormats: { millisecond: 'HH:mm:ss', second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'MM-dd' }
        },
        ticks: { color: '#9ca3af', maxRotation: 0, autoSkip: true },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      yTemp: { position: 'left', ticks: { color: '#fca5a5' }, grid: { color: 'rgba(239,68,68,0.08)' }, suggestedMin: 0, suggestedMax: 50 },
      yHum: { position: 'right', ticks: { color: '#93c5fd' }, grid: { display: false }, suggestedMin: 0, suggestedMax: 100 },
    },
    plugins: {
      legend: { labels: { color: '#e5e7eb', font: { size: 14 } } },
      tooltip: {
        mode: 'index', intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#e5e7eb', bodyColor: '#e5e7eb',
        callbacks: {
          label(ctx) {
            const v = typeof ctx.parsed.y === 'number' ? ctx.parsed.y.toFixed(1) : ctx.parsed.y;
            return `${ctx.dataset.label}: ${v}`;
          }
        }
      },
      decimation: { enabled: true, algorithm: 'min-max' },
    },
    interaction: { mode: 'index', intersect: false },
  },
});

let port = null;
let reader = null;
let keepReading = false;
let decoder = null;
let inputDone = null;
let writer = null; // string writer via TextEncoderStream

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setStatus(text, kind = 'ok') {
  if (!connBadgeEl) return;
  connBadgeEl.textContent = text;
  connBadgeEl.classList.remove('ok', 'err');
  connBadgeEl.classList.add(kind === 'ok' ? 'ok' : 'err');
}

function appendRaw(line) {
  if (!rawLogEl) return;
  rawLogEl.textContent += (rawLogEl.textContent ? '\n' : '') + line;
  if (autoscrollEl?.checked) rawLogEl.scrollTop = rawLogEl.scrollHeight;
}

function updateAveragesFromArrays(tArr, hArr){
  if (!tArr.length || !hArr.length){
    tempAvgValueEl.textContent = '—'; humAvgValueEl.textContent = '—';
    tempDeltaEl.textContent = ''; humDeltaEl.textContent='';
    return;
  }
  const tAvg = tArr.reduce((a,b)=>a+b,0)/tArr.length;
  const hAvg = hArr.reduce((a,b)=>a+b,0)/hArr.length;
  tempAvgValueEl.textContent = `${tAvg.toFixed(1)} °C`;
  humAvgValueEl.textContent = `${hAvg.toFixed(1)} %`;
  const lastT = tArr[tArr.length-1];
  const lastH = hArr[hArr.length-1];
  const dT = lastT - tAvg; const dH = lastH - hAvg;
  tempDeltaEl.textContent = `${dT>=0?'▲':'▼'} ${Math.abs(dT).toFixed(1)} °C vs avg`;
  humDeltaEl.textContent = `${dH>=0?'▲':'▼'} ${Math.abs(dH).toFixed(1)} % vs avg`;
  tempDeltaEl.classList.toggle('pos', dT>=0); tempDeltaEl.classList.toggle('neg', dT<0);
  humDeltaEl.classList.toggle('pos', dH>=0); humDeltaEl.classList.toggle('neg', dH<0);
}

function refreshLiveView() {
  const cutoff = Date.now() - liveWindowMs;
  const view = liveBuffer.filter(p => p.ts >= cutoff);
  labels = view.map(p => new Date(p.ts));
  tempData = view.map(p => p.t);
  humData = view.map(p => p.h);
  chart.data.labels = labels;
  chart.data.datasets[0].data = tempData;
  chart.data.datasets[1].data = humData;
  chart.update();
  updateAveragesFromArrays(tempData, humData);
}

function appendSample(tempC, humidity) {
  const nowMs = Date.now();
  liveBuffer.push({ ts: nowMs, t: Number(tempC), h: Number(humidity) });
  const minTs = nowMs - LIVE_MAX_BUFFER_MS; while (liveBuffer.length && liveBuffer[0].ts < minTs) liveBuffer.shift();
  tempEl.textContent = Number(tempC).toFixed(1);
  humEl.textContent = Number(humidity).toFixed(1);
  updatedLabelEl.textContent = `Updated ${new Date(nowMs).toLocaleTimeString(undefined,{hour12:false})}`;
  if (currentRange === 'live') refreshLiveView();
  lastReading = { ts: nowMs, t: Number(tempC), h: Number(humidity) };
}

function clearData() {
  labels = []; tempData = []; humData = []; liveBuffer = [];
  chart.data.labels = labels; chart.data.datasets[0].data = tempData; chart.data.datasets[1].data = humData;
  tempEl.textContent = '--'; humEl.textContent = '--'; updatedLabelEl.textContent = 'Updated —';
  chart.update(); updateAveragesFromArrays([], []);
}

function loadPrefs() {
  try { const raw = localStorage.getItem(PREFS_KEY); if (!raw) return; const p = JSON.parse(raw); if (p && typeof p === 'object') { prefs = { ...prefs, ...p }; if (Number.isFinite(prefs.liveWindowMs)) liveWindowMs = prefs.liveWindowMs; } } catch {}
}

function savePrefs() { prefs.liveWindowMs = liveWindowMs; try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }

function applyPrefsToUI() {
  toggleGraph.checked = !!prefs.showGraph; toggleRaw.checked = !!prefs.showRaw; chartPanel.hidden = !prefs.showGraph; rawPanel.hidden = !prefs.showRaw; if (liveWindowSelect) liveWindowSelect.value = String(liveWindowMs);
}

function loadHistory() {
  try { const raw = localStorage.getItem(HISTORY_KEY); if (!raw) { fullHistory = []; return; } const arr = JSON.parse(raw); fullHistory = Array.isArray(arr) ? arr.filter(pt => pt && Number.isFinite(pt.ts) && Number.isFinite(pt.t) && Number.isFinite(pt.h)) : []; if (fullHistory.length > HISTORY_MAX_POINTS) fullHistory = fullHistory.slice(-HISTORY_MAX_POINTS); } catch { fullHistory = []; }
}

function persistHistory(reading) { if (!reading) return; try { fullHistory.push({ ts: reading.ts, t: reading.t, h: reading.h }); if (fullHistory.length > HISTORY_MAX_POINTS) fullHistory.splice(0, fullHistory.length - HISTORY_MAX_POINTS); localStorage.setItem(HISTORY_KEY, JSON.stringify(fullHistory)); } catch {} }

function clearHistory() { fullHistory = []; try { localStorage.removeItem(HISTORY_KEY); } catch {} }

setInterval(() => { const now = Date.now(); if (lastReading && now - lastSavedMs >= HISTORY_SAVE_MS) { persistHistory(lastReading); lastSavedMs = now; } }, 5000);

function applyRangeToChart() {
  if (liveWindowWrap) liveWindowWrap.hidden = currentRange !== 'live';
  if (currentRange === 'live') { refreshLiveView(); return; }
  const now = Date.now(); let view = [];
  switch (currentRange) {
    case '1h': view = fullHistory.filter(p => p.ts >= now - 60*60*1000); break;
    case '6h': view = fullHistory.filter(p => p.ts >= now - 6*60*60*1000); break;
    case '24h': view = fullHistory.filter(p => p.ts >= now - 24*60*60*1000); break;
    case '7d': view = fullHistory.filter(p => p.ts >= now - 7*24*60*60*1000); break;
    case 'all': view = fullHistory.slice(); break;
  }
  const MAX_VIEW = 2000; if (view.length > MAX_VIEW) { const step = Math.ceil(view.length / MAX_VIEW); view = view.filter((_, i) => i % step === 0); }
  labels = view.map(p => new Date(p.ts)); tempData = view.map(p => p.t); humData = view.map(p => p.h);
  chart.data.labels = labels; chart.data.datasets[0].data = tempData; chart.data.datasets[1].data = humData; chart.update();
  updateAveragesFromArrays(tempData, humData);
  if(view.length){ const lastTs=view[view.length-1].ts; updatedLabelEl.textContent=`Updated ${new Date(lastTs).toLocaleTimeString(undefined,{hour12:false})}`; }
}

function exportCsv() {
  let rows = [];
  if (currentRange === 'live') { const cutoff = Date.now() - liveWindowMs; const view = liveBuffer.filter(p => p.ts >= cutoff); rows = view.map(p => ({ time: new Date(p.ts).toISOString(), temp: p.t, hum: p.h })); }
  else { const now = Date.now(); let view = []; switch (currentRange) { case '1h': view = fullHistory.filter(p => p.ts >= now - 60*60*1000); break; case '6h': view = fullHistory.filter(p => p.ts >= now - 6*60*60*1000); break; case '24h': view = fullHistory.filter(p => p.ts >= now - 24*60*60*1000); break; case '7d': view = fullHistory.filter(p => p.ts >= now - 7*24*60*60*1000); break; case 'all': view = fullHistory.slice(); break; default: view = []; break; } rows = view.map(p => ({ time: new Date(p.ts).toISOString(), temp: p.t, hum: p.h })); }
  const header = 'time,temp_c,humidity_pct\n'; const body = rows.map(r => `${r.time},${r.temp},${r.hum}`).join('\n'); const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const ts = new Date().toISOString().replace(/[:]/g, '-'); a.download = `dht_history_${currentRange}_${ts}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

let bootstrapDone = false;
function bootstrapHistoryView() { if (bootstrapDone) return; loadPrefs(); applyPrefsToUI(); loadHistory(); const now = Date.now(); const recent = fullHistory.filter(p => p.ts >= now - 30*60*1000); liveBuffer = recent.slice(-1000); applyRangeToChart(); bootstrapDone = true; }

async function sendCommand(text) { if (!writer) throw new Error('Not connected'); const line = text.endsWith('\n') ? text : text + '\n'; await writer.write(line); }

async function openPort() { if (!('serial' in navigator)) { alert('Web Serial API not supported. Use Chrome/Edge on desktop.'); return; } try { setStatus('Selecting port...','ok'); let p = await navigator.serial.requestPort(); setStatus('Opening port...','ok'); const baudRate = Number(baudRateSelect.value); await p.open({ baudRate }); port = p; setStatus(`Connected @ ${baudRate} baud`,'ok'); connectButton.disabled = true; disconnectButton.disabled = false; const textEncoder = new TextEncoderStream(); textEncoder.readable.pipeTo(port.writable).catch(() => {}); writer = textEncoder.writable.getWriter(); startReading(); await sleep(1200); try { await sendCommand('GET_INTERVAL'); } catch {} } catch (err) { console.error('Connection error:', err); setStatus(`Connection failed: ${err.message}`,'err'); } }

async function closePort() { try { keepReading = false; if (reader) { try { await reader.cancel(); } catch {} try { await reader.releaseLock?.(); } catch {} reader = null; } if (inputDone) { try { await inputDone; } catch {} inputDone = null; } if (writer) { try { await writer.close?.(); } catch {} writer = null; } if (port) { try { await port.close(); } catch {} port = null; } decoder = null; } catch (err) { console.error(err); } finally { setStatus('Disconnected','err'); connectButton.disabled = false; disconnectButton.disabled = true; } }

async function startReading() { keepReading = true; const td = new TextDecoderStream(); decoder = td; inputDone = port.readable.pipeTo(td.writable).catch(() => {}); const inputStream = td.readable; reader = inputStream.getReader(); let buffer = ''; while (keepReading) { try { const { value, done } = await reader.read(); if (done) break; if (value) { buffer += value; let idx; while ((idx = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1); if (line) { appendRaw(line); if (line.startsWith('INTERVAL=') || line.startsWith('OK INTERVAL=')) { const m = line.match(/INTERVAL=(\d+)/); if (m) { settingsSampleMs.value = m[1]; setStatus(`Interval: ${m[1]}ms`,'ok'); } } parseLine(line); } } } } catch (err) { console.error('Read error', err); setStatus('Read error','err'); break; } } try { await reader?.releaseLock?.(); } catch {} try { await inputDone; } catch {} }

function parseLine(line) { let t = null; let h = null; if (line.startsWith('{') && line.endsWith('}')) { try { const obj = JSON.parse(line); t = Number(obj.temp ?? obj.temperature ?? obj.t); h = Number(obj.hum ?? obj.humidity ?? obj.h); } catch {} } if ((t === null || Number.isNaN(t)) && line.includes(',')) { const [a,b] = line.split(','); t = Number(a); h = Number(b); } if ((t === null || Number.isNaN(t)) && /temp/i.test(line)) { const mT = line.match(/temp\s*[:=]\s*([\-\d\.]+)/i); const mH = line.match(/hum(?:idity)?\s*[:=]\s*([\-\d\.]+)/i); if (mT) t = Number(mT[1]); if (mH) h = Number(mH[1]); } if (Number.isFinite(t) && Number.isFinite(h)) appendSample(t, h); }

connectButton.addEventListener('click', openPort);
disconnectButton.addEventListener('click', closePort);

// Settings modal behaviors
settingsBtn?.addEventListener('click', () => { if (settingsSampleMs) settingsSampleMs.value = String(Math.max(1000, Number(settingsSampleMs.value||1000))); settingsModal.hidden = false; });
closeSettingsBtn?.addEventListener('click', () => { settingsModal.hidden = true; });
closeSettingsBtn2?.addEventListener('click', () => { settingsModal.hidden = true; });
settingsApplySample?.addEventListener('click', async () => {
  try {
    const v = Math.max(1000, Number(settingsSampleMs.value)||0);
    settingsSampleMs.value = String(v);
    await sendCommand(`SET_INTERVAL ${v}`);
    setStatus(`Set interval to ${v}ms`, 'ok');
  } catch (e) {
    setStatus(`Failed to set interval: ${e.message}`, 'err');
  }
});

// Clear actions
clearViewBtn?.addEventListener('click', () => {
  labels = []; tempData = []; humData = []; liveBuffer = [];
  const chart = Chart.getChart('chart');
  if (chart) { chart.data.labels = []; chart.data.datasets[0].data = []; chart.data.datasets[1].data = []; chart.update(); }
  updatedLabelEl.textContent = 'Updated —';
  settingsModal.hidden = true;
});

clearHistoryBtn?.addEventListener('click', () => { clearHistory(); applyRangeToChart(); settingsModal.hidden = true; });
clearRawInSettings?.addEventListener('click', () => { if (rawLogEl) rawLogEl.textContent=''; });

// Keep toggleRaw making layout responsive (CSS handles width)
toggleRaw?.addEventListener('change', (e) => { prefs.showRaw = !!e.target.checked; savePrefs(); rawPanel.hidden = !prefs.showRaw; });

copyRawBtn?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(rawLogEl.textContent || ''); setStatus('Raw copied','ok'); setTimeout(() => setStatus('Connected','ok'), 800); } catch {} });

clearRawBtn?.addEventListener('click', () => { rawLogEl.textContent = ''; });

rangeSelect?.addEventListener('change', (e) => { currentRange = e.target.value; applyRangeToChart(); });

liveWindowSelect?.addEventListener('change', (e) => { liveWindowMs = Number(e.target.value); savePrefs(); if (currentRange === 'live') refreshLiveView(); });

exportCsvBtn?.addEventListener('click', exportCsv);

bootstrapHistoryView();

if ('serial' in navigator) {
  navigator.serial.getPorts().then(async ports => {
    console.log('Available ports:', ports.length);
    if (ports.length > 0) {
      try { port = ports[0]; const baudRate = Number(baudRateSelect.value); await port.open({ baudRate }); setStatus(`Connected @ ${baudRate} baud (auto)`,'ok'); connectButton.disabled = true; disconnectButton.disabled = false; const textEncoder = new TextEncoderStream(); textEncoder.readable.pipeTo(port.writable).catch(() => {}); writer = textEncoder.writable.getWriter(); startReading(); await sleep(1200); try { await sendCommand('GET_INTERVAL'); } catch {} } catch (err) { console.error('Auto-connect failed:', err); }
    }
  });
}


