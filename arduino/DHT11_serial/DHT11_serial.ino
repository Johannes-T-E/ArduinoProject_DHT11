#include <DHT.h>

// ---------- Hardware configuration ----------
const uint8_t DHT_PIN = 2;       // Data pin
const uint8_t DHT_TYPE = DHT11;  // Sensor type

// ---------- App configuration ----------
const unsigned long DEFAULT_SAMPLE_INTERVAL_MS = 1000; // DHT11 requires ~1000 ms minimum
const unsigned long MIN_SAMPLE_INTERVAL_MS = 1000;
const unsigned long SERIAL_BAUD = 9600;

// ---------- State ----------
unsigned long sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS;

DHT dht(DHT_PIN, DHT_TYPE);

// ---------- Serial helpers ----------
void printHelp() {
  Serial.println("Commands:");
  Serial.println("  GET_INTERVAL");
  Serial.println("  SET_INTERVAL <ms>   (min 1000 for DHT11)");
  Serial.println("  HELP");
}

void printBanner() {
  Serial.println("DHT monitor starting...");
  Serial.print("DHTTYPE="); Serial.print(DHT_TYPE == DHT11 ? "DHT11" : "OTHER");
  Serial.print(" PIN="); Serial.print(DHT_PIN);
  Serial.print(" INTERVAL="); Serial.println(sampleIntervalMs);
}

unsigned long sanitizeInterval(long requestedMs) {
  if (requestedMs < (long)MIN_SAMPLE_INTERVAL_MS) return MIN_SAMPLE_INTERVAL_MS;
  return (unsigned long)requestedMs;
}

void reportInterval() {
  Serial.print("INTERVAL="); Serial.println(sampleIntervalMs);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  dht.begin();
  delay(100);
  printBanner();
  printHelp();
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  if (line == "HELP") {
    printHelp();
    return;
  }

  if (line == "GET_INTERVAL") {
    reportInterval();
    return;
  }

  if (line.startsWith("SET_INTERVAL")) {
    int spaceIndex = line.indexOf(' ');
    if (spaceIndex < 0) {
      Serial.println("ERR INVALID_INTERVAL");
      return;
    }
    long value = line.substring(spaceIndex + 1).toInt();
    if (value <= 0) {
      Serial.println("ERR INVALID_INTERVAL");
      return;
    }
    sampleIntervalMs = sanitizeInterval(value);
    Serial.print("OK INTERVAL="); Serial.println(sampleIntervalMs);
    return;
  }

  Serial.println("ERR UNKNOWN_CMD");
}

bool readDht(float& outHumidity, float& outTempC) {
  outHumidity = dht.readHumidity();
  outTempC = dht.readTemperature(); // Celsius
  return !(isnan(outHumidity) || isnan(outTempC));
}

void printCsvReading(float tempC, float humidity) {
  Serial.print(tempC, 1);
  Serial.print(",");
  Serial.print(humidity, 1);
  Serial.println();
}

void loop() {
  handleSerialCommands();

  float humidity = NAN;
  float tempC = NAN;
  if (readDht(humidity, tempC)) {
    printCsvReading(tempC, humidity);
  }

  delay(sampleIntervalMs);
}


