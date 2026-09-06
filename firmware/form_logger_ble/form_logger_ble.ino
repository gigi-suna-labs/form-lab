// FORM BLE logger for Seeed Studio XIAO nRF52840 Sense.
//
// Target board package:
//   Seeed nRF52 Boards -> Seeed XIAO nRF52840 Sense
//
// BLE transport:
//   Nordic UART Service (NUS)
//   Service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
//   RX:      6E400002-B5A3-F393-E0A9-E50E24DCCA9E
//   TX:      6E400003-B5A3-F393-E0A9-E50E24DCCA9E (notifications)
//
// Each sample is the same newline-delimited CSV used by the USB firmware:
//   t_ms,raw,volts,ohms,ax,ay,az,gx,gy,gz

#include <Adafruit_TinyUSB.h>
#include <bluefruit.h>
#include <Wire.h>
#include "LSM6DS3.h"

LSM6DS3 imu(I2C_MODE, 0x6A);
BLEDis deviceInfo;
BLEUart bleUart;

const float VCC = 3.3;
const float VREF = 3.6;
const float R_FIXED = 10000.0;  // ohms — installed A0-to-GND resistor
const int ADC_MAX = 4095;
const int OVERSAMPLE = 16;
const uint32_t PERIOD_MS = 50;  // 20 Hz

bool imuOk = false;
bool headerSent = false;

void startAdvertising() {
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleUart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);  // 20 ms fast, 152.5 ms slow
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

void onDisconnect(uint16_t connectionHandle, uint8_t reason) {
  (void)connectionHandle;
  (void)reason;
  headerSent = false;
}

// A CSV line can be larger than the default 20-byte ATT payload. Split it at
// the negotiated MTU; the receiver joins notification chunks until '\n'.
bool sendBleBytes(const char* data, size_t length) {
  if (!Bluefruit.connected() || !bleUart.notifyEnabled()) return false;

  BLEConnection* connection = Bluefruit.Connection(Bluefruit.connHandle());
  if (connection == nullptr) return false;

  const size_t chunkSize = connection->getMtu() - 3;
  size_t offset = 0;
  while (offset < length) {
    const size_t remaining = length - offset;
    const size_t count = remaining < chunkSize ? remaining : chunkSize;

    size_t written = 0;
    for (int attempt = 0; attempt < 5 && written == 0; ++attempt) {
      written = bleUart.write(
        reinterpret_cast<const uint8_t*>(data + offset),
        count
      );
      if (written == 0) delay(1);
    }
    if (written != count) return false;
    offset += written;
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {}

  analogReference(AR_INTERNAL);
  analogReadResolution(12);
  pinMode(A0, INPUT);

#ifdef PIN_LSM6DS3TR_C_POWER
  pinMode(PIN_LSM6DS3TR_C_POWER, OUTPUT);
  digitalWrite(PIN_LSM6DS3TR_C_POWER, HIGH);
  delay(50);
#endif

  imuOk = (imu.begin() == 0);

  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName("FORM Band");
  Bluefruit.Periph.setDisconnectCallback(onDisconnect);

  deviceInfo.setManufacturer("FORM Lab");
  deviceInfo.setModel("XIAO nRF52840 Sense");
  deviceInfo.begin();
  bleUart.begin();
  startAdvertising();

  Serial.println("FORM Band is advertising over BLE");
}

void loop() {
  static uint32_t nextSampleAt = 0;
  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextSampleAt) < 0) return;
  nextSampleAt = now + PERIOD_MS;

  if (Bluefruit.connected() && bleUart.notifyEnabled() && !headerSent) {
    const char header[] = "t_ms,raw,volts,ohms,ax,ay,az,gx,gy,gz\n";
    headerSent = sendBleBytes(header, sizeof(header) - 1);
  }

  long sum = 0;
  for (int i = 0; i < OVERSAMPLE; ++i) sum += analogRead(A0);
  const float raw = static_cast<float>(sum) / OVERSAMPLE;
  const float volts = raw * VREF / ADC_MAX;
  const float ohms = volts > 0.01
    ? R_FIXED * (VCC / volts - 1.0)
    : -1.0;

  float ax = 0;
  float ay = 0;
  float az = 0;
  float gx = 0;
  float gy = 0;
  float gz = 0;
  if (imuOk) {
    ax = imu.readFloatAccelX();
    ay = imu.readFloatAccelY();
    az = imu.readFloatAccelZ();
    gx = imu.readFloatGyroX();
    gy = imu.readFloatGyroY();
    gz = imu.readFloatGyroZ();
  }

  char line[160];
  const int length = snprintf(
    line,
    sizeof(line),
    "%lu,%.1f,%.3f,%.0f,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f\n",
    static_cast<unsigned long>(now),
    raw,
    volts,
    ohms,
    ax,
    ay,
    az,
    gx,
    gy,
    gz
  );

  if (length <= 0 || static_cast<size_t>(length) >= sizeof(line)) return;
  Serial.print(line);
  sendBleBytes(line, static_cast<size_t>(length));
}
