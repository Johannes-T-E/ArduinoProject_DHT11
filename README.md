## DHT11 Temperature & Humidity on Arduino

Two Arduino sketches for DHT11 acquisition and an optional browser visualizer.

### Requirements
- Arduino IDE (recommended) or Arduino CLI
- Optional (for web visualizer only): Python 3, or any static file server (e.g., Node `http-server`, VS Code Live Server)
  - No pip packages required; uses Python's built-in `http.server`

### 1) Clone
```bash
git clone https://github.com/Johannes-T-E/ArduinoProject_DHT11.git
cd ArduinoProject_DHT11
```

### 2) Wire the sensor
- VCC → 5V, GND → GND, DATA → D2 (default in both sketches)
- If using the bare 3‑pin DHT11 (no PCB), add a 4.7–10 kΩ pull‑up resistor from DATA to 5V

### 3) Upload a sketch
Pick one of the two:

- Minimal logger: `arduino/DHT11_minimal/`
  - Prints once per second: `T=23.4C  H=45.0%`
- Serial + CSV + commands: `arduino/DHT11_serial/`
  - CSV lines: `23.5,45.0`
  - Commands: `GET_INTERVAL`, `SET_INTERVAL <ms>`, `HELP`

#### Arduino IDE (recommended)
1) Open the `.ino` you want
2) Tools → Board → Arduino Uno (or your board)
3) Tools → Port → select the COM port
4) Sketch → Include Library → Manage Libraries…
   - Install “DHT sensor library” by Adafruit
   - Install “Adafruit Unified Sensor”
5) Upload, then open Serial Monitor at 9600 baud

Note: If you prefer Arduino CLI, each sketch folder includes `upload.bat`.

Disclaimer about `upload.bat`
- Windows-only helper that calls Arduino CLI. Edit the path inside `upload.bat` if your CLI is installed elsewhere.
- The script auto-picks the first detected `COM` port; verify it matches your board.
- Close any app using the serial port (Arduino Serial Monitor, web app) before running.
- Review scripts before running; use at your own risk.

### 4) Optional web visualizer (works with the serial/CSV sketch)
No backend is required. The page is static and just needs to be served locally so the browser enables Web Serial.
You can use Python 3 or any static server. No pip packages are needed.

Windows (Python):
```bat
cd web
py -m http.server 8000
```
macOS/Linux:
```bash
cd web
python3 -m http.server 8000
```
Open http://localhost:8000, click Connect, pick your Arduino port, and keep baud at 9600.

### Advanced details
- Sensor fundamentals (DHT11)
  - Supply: 3.3–5.0 V; typical: 5 V on Arduino Uno
  - Ranges/accuracy (typical): 0–50 °C (±2 °C), 20–90 %RH (±5 %RH)
  - Bare 3‑pin sensors need a 4.7–10 kΩ pull‑up from DATA to VCC
- Timing
  - Warm‑up ~1 s after `dht.begin()`
  - Minimum interval between reads: 1000 ms (sketches honor this)
  - Invalid frames return NaN; code skips output if invalid
- Serial protocol (for `arduino/DHT11_serial/`)
  - Telemetry: CSV per sample → `temperature_c,humidity_percent` (e.g., `23.5,45.0`)
  - Commands (end with `\n`):
    - `GET_INTERVAL` → `INTERVAL=<ms>`
    - `SET_INTERVAL <ms>` (clamped ≥1000) → `OK INTERVAL=<ms>`
    - `HELP` → prints supported commands
- Troubleshooting
  - NaN/No data: check wiring, wait 1–2 s after reset, keep 1 s interval
  - Port busy: close Serial Monitor and any app using the COM port
  - Noisy readings: shorten jumpers; add 0.1 µF decoupling near the sensor
  - DHT22 instead of DHT11: change sensor type constant and keep pin consistent
- Repo layout
  - `arduino/DHT11_minimal/` — minimalist terminal logger (+ `upload.bat`)
  - `arduino/DHT11_serial/` — CSV + simple serial commands (+ `upload.bat`)
  - `web/` — optional browser visualizer (Chart.js + Web Serial)


