// FORM P0 — stretch-cord resistance logger for XIAO nRF52840 Sense
#ifndef ARDUINO_ARCH_MBED
#include <Adafruit_TinyUSB.h>   // only the non-mbed Seeed core needs this
#endif
#include <Wire.h>
#include "LSM6DS3.h"
LSM6DS3 imu(I2C_MODE, 0x6A);   // onboard IMU
bool imuOk = false;
//
// Wiring (voltage divider):
//   3V3 ──[ conductive rubber cord ]──┬── A0
//                                     │
//                                  [ R_FIXED ]
//                                     │
//                                    GND
//
// Stretch the cord -> its resistance goes up -> voltage at A0 goes DOWN.
// Output: CSV lines "t_ms,raw,volts,ohms,ax,ay,az,gx,gy,gz" at ~20 Hz.
// ax..az = accelerometer in g, gx..gz = gyroscope in degrees/second (onboard LSM6DS3TR-C IMU). Works in Serial Monitor
// and Serial Plotter (Tools > Serial Plotter, 115200 baud).

const float VCC     = 3.3;      // XIAO 3V3 pin
const float R_FIXED = 10000.0;  // ohms — change to 1000.0 if you swap in a 1 kΩ resistor
#ifdef ARDUINO_ARCH_MBED
const float VREF    = 3.3;      // mbed core: ADC full scale = supply (3.3 V)
#else
const float VREF    = 3.6;      // Adafruit-style core: AR_INTERNAL = 3.6 V full scale
#endif
const int   ADC_MAX = 4095;     // 12-bit
const int   OVERSAMPLE = 16;    // average this many reads per sample
const unsigned long PERIOD_MS = 50;  // 20 Hz

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {}   // wait for the monitor, but don't hang forever
#ifndef ARDUINO_ARCH_MBED
  analogReference(AR_INTERNAL);           // 3.6 V full scale — safe for a 3.3 V node
#endif
  analogReadResolution(12);
  pinMode(A0, INPUT);
#ifdef PIN_LSM6DS3TR_C_POWER
  pinMode(PIN_LSM6DS3TR_C_POWER, OUTPUT);
  digitalWrite(PIN_LSM6DS3TR_C_POWER, HIGH);   // the IMU has its own power switch
  delay(50);
#endif
  imuOk = (imu.begin() == 0);
  Serial.println("t_ms,raw,volts,ohms,ax,ay,az,gx,gy,gz");
}

void loop() {
  static unsigned long next = 0;
  unsigned long now = millis();
  if (now < next) return;
  next = now + PERIOD_MS;

  long sum = 0;
  for (int i = 0; i < OVERSAMPLE; i++) sum += analogRead(A0);
  float raw   = (float)sum / OVERSAMPLE;
  float volts = raw * VREF / ADC_MAX;

  // Divider: volts = VCC * R_FIXED / (R_FIXED + R_cord)  =>  R_cord = R_FIXED * (VCC/volts - 1)
  float ohms = -1;
  if (volts > 0.01) ohms = R_FIXED * (VCC / volts - 1.0);

  Serial.print(now);   Serial.print(',');
  Serial.print(raw, 1); Serial.print(',');
  Serial.print(volts, 3); Serial.print(',');
  Serial.print(ohms, 0);
  if (imuOk) {
    Serial.print(','); Serial.print(imu.readFloatAccelX(), 3);
    Serial.print(','); Serial.print(imu.readFloatAccelY(), 3);
    Serial.print(','); Serial.print(imu.readFloatAccelZ(), 3);
    Serial.print(','); Serial.print(imu.readFloatGyroX(), 1);
    Serial.print(','); Serial.print(imu.readFloatGyroY(), 1);
    Serial.print(','); Serial.println(imu.readFloatGyroZ(), 1);
  } else {
    Serial.println(",0,0,0,0,0,0");
  }
}
