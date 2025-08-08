// -----------------------------------------------------------------------------
// DHT11: minimal serial logger
// -----------------------------------------------------------------------------
// - Reads a DHT11 sensor and prints one line per second to Serial (9600 baud)
// - Output format:
//     T=23.4C  H=45.0%
// - Dependency: Adafruit DHT library (include <DHT.h>)
// -----------------------------------------------------------------------------

#include <DHT.h>

// ---------- Hardware configuration ----------
#define DHTPIN 2        // DHT11 data pin
#define DHTTYPE DHT11   // Sensor type: DHT11

// ---------- App configuration ----------
const unsigned long SAMPLE_MS = 1000;   // default sample interval (milliseconds)
DHT dht(DHTPIN, DHTTYPE); // Instance bound to chosen pin and type

// ---------- Setup ----------
void setup() {
  Serial.begin(9600);    // Serial console speed
  dht.begin();           // Start the DHT sensor
  delay(1000);           // Sensor warm-up
  Serial.println("DHT11 initialized");
}

// ---------- Main loop ----------
void loop() {
  // 1) Read humidity (%) and temperature (°C)
  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();

  // 2) If both readings are valid, print one line. Otherwise, say so.
  if (!isnan(humidity) && !isnan(tempC)) {
    Serial.print("T="); Serial.print(tempC, 1); Serial.print("C  ");
    Serial.print("H="); Serial.print(humidity, 1); Serial.println("%");
  } else {
    Serial.println("read error");
  }

  // 3) Wait before next sample (DHT11 timing requirement)
  delay(SAMPLE_MS);
}


