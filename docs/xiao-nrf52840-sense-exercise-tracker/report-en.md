# Wrist-Worn Exercise Recognition with the Seeed Studio XIAO nRF52840 Sense

**Engineering feasibility and development report**<br>
**Date:** September 5, 2026<br>
**Status:** Proposed architecture and validation plan

## Executive summary

The Seeed Studio XIAO nRF52840 Sense is suitable for a first wrist-worn exercise-tracking prototype. Its six-axis inertial measurement unit (IMU), Bluetooth Low Energy radio, small form factor, and Cortex-M4F processor can support motion recording, set segmentation, repetition counting, and classification of a deliberately limited exercise catalog.

The intended experience is achievable within a defined scope:

1. The user enters a gym and starts a workout session, manually or through a reliable motion-based prompt.
2. The user performs supported exercises without selecting each exercise in advance.
3. The band records wrist motion and either streams data to a phone or retains short batches locally.
4. The processing pipeline identifies exercise periods, exercise type, sets, and repetitions.
5. The app presents a workout summary and allows corrections.

The board cannot directly measure lifted load, applied force, heart rate, muscle activation, muscle oxygenation, or muscle growth. “Muscle use” may only be presented as an estimated training-stimulus score derived from the recognized exercise and user-entered load. “Muscle growth” must not be represented as a measurement from this sensor.

The recommended MVP supports five to eight wrist-visible exercises, performs primary inference on the phone, and uses the board for reliable timestamped IMU acquisition and BLE transfer. Edge inference should be introduced only after the phone-side model has passed user-independent validation.

## 1. Product objective

### 1.1 Target user journey

```text
Enter gym
  -> start or confirm workout session
  -> perform exercises freely
  -> leave gym / end session
  -> review exercise, set, and repetition summary
  -> correct any mistakes
  -> receive muscle-group stimulus and progress trends
```

The correction step is a product feature, not merely an error fallback. Corrected records provide high-quality feedback labels for future personalized and global model improvement, subject to user consent.

### 1.2 Measurement contract

| Output | Status | Meaning |
|---|---|---|
| Linear acceleration | Directly measured | Three-axis IMU signal, including gravity and motion |
| Angular velocity | Directly measured | Three-axis gyroscope signal |
| Exercise type | Model inference | Probability among explicitly supported classes |
| Set boundaries | Model inference | Start and end times derived from motion and rest patterns |
| Repetitions | Model inference | Count derived from repeated motion cycles |
| Tempo / range consistency | Model inference | Relative motion features; not anatomical joint angles |
| Lifted weight | Unavailable from the band | Requires user input or integration with equipment |
| Muscle-group stimulus | Derived estimate | Exercise mapping plus sets, reps, load, tempo, and effort |
| Muscle activation | Not measured | Requires EMG or another muscle-specific sensor |
| Muscle growth | Not measured | Requires longitudinal body measurements and broader context |

## 2. Hardware assessment

### 2.1 Board and processor

The XIAO nRF52840 Sense measures 21 × 17.8 mm and includes an onboard antenna, USB Type-C connection, battery charging circuit, PDM microphone, and LSM6DS3TR-C six-axis IMU. The nRF52840 contains a 64 MHz Arm Cortex-M4 processor with floating-point support, 1 MB internal flash, and 256 KB RAM. These resources are sufficient for acquisition, filtering, feature extraction, BLE, and a small quantized model, but RAM must be budgeted with the Bluetooth stack and runtime included.

Seeed's current wiki advertises an additional 2 MB onboard flash. The currently linked Sense schematic labels the external flash position as `DNP` (do not populate). Firmware design must therefore treat external flash as unconfirmed until the exact physical board revision and bill of materials are inspected. The product must not depend on this storage for whole-session recording without that check.

Bluetooth capability descriptions vary between the current Seeed comparison table and older board documentation. Product requirements should be based on the BLE features actually enabled by the selected firmware stack, not on the highest Bluetooth version number shown on a marketing page.

### 2.2 IMU

The onboard STMicroelectronics LSM6DS3TR-C provides:

- Three-axis acceleration and three-axis angular velocity
- Accelerometer full scales of ±2, ±4, ±8, and ±16 g
- Gyroscope full scales of ±125, ±250, ±500, ±1000, and ±2000 dps
- 16-bit outputs, I2C/SPI interfaces, interrupts, and embedded motion functions
- A 4 KB smart FIFO
- Approximately 0.90 mA in combined high-performance mode, 0.45 mA in normal mode at 208 Hz, and 0.29 mA in low-power combined mode at 52 Hz, under datasheet conditions

At 100 Hz, raw accelerometer and gyroscope data require 12 bytes per sample before timestamps or framing. A 4 KB FIFO therefore holds only about 341 samples, or 3.4 seconds. It is useful for interrupt-driven batching, but not for storing a workout.

### 2.3 Recommended acquisition profile

Start model-development recordings with:

| Setting | Initial value | Reason |
|---|---:|---|
| Sampling rate | 100 Hz | Preserves rapid transitions while collecting a high-quality baseline |
| Accelerometer range | ±8 g | Practical starting margin for gym motion; verify clipping |
| Gyroscope range | ±1000 dps | Practical starting margin; verify clipping during fast movements |
| Signals | Accel + gyro | Orientation-sensitive exercise pairs benefit from both modalities |
| Timestamp | Monotonic device time | Required for loss and jitter detection |
| Packet sequence | Incrementing counter | Required to quantify BLE packet loss |

After validation, compare 100 Hz and 50 Hz. A 2024 peer-reviewed exercise-classification study found little overall loss down to 20 Hz in its particular dataset, but that result cannot be assumed for this board, placement, or exercise catalog. The production rate must be chosen from this product's own accuracy and battery measurements.

### 2.4 Power and battery

The board uses a TI BQ25101 single-cell Li-ion/Li-polymer charger. Seeed documents selectable board-level charge currents of 50 mA and 100 mA. Battery capacity, enclosure, strap, water resistance, and assembled device weight are product-design decisions and are not supplied by the development board.

Seeed documents `P0.14` as `READ_BAT_ENABLE` and `P0.31` as `AIN7_BAT`. Its wiki warns that the reading path must be enabled correctly: set `P0.14` low before reading the battery ADC, and do not use the unsafe high state while charging.

Battery life must be measured on the assembled prototype. MCU-only or IMU-only datasheet currents are not a valid whole-device runtime estimate. Test at least acquisition, BLE streaming, disconnected logging, idle, session detection, and charging states. A motion interrupt or phone command should wake the full-rate pipeline; continuous all-day full-rate BLE streaming is not the recommended design.

### 2.5 Microphone recommendation

The onboard microphone is unnecessary for the first exercise-recognition MVP. Gym audio introduces privacy risk and unpredictable background noise while providing little guaranteed value for rep counting. Keep it disabled unless a later, separately consented experiment demonstrates a clear benefit.

## 3. System architecture

```text
XIAO band
  IMU sampling -> timestamping -> FIFO read -> packet sequence -> BLE
       |                                                   |
       +-> optional motion gate / edge rep detector        v
                                                     Mobile app
                          session segmentation -> exercise classifier
                          -> rep/set counter -> correction UI
                                      |
                                      v
                           local summary / optional cloud
                           training with explicit consent
```

### 3.1 Device responsibilities

- Initialize and calibrate the IMU.
- Acquire synchronized accelerometer and gyroscope samples.
- Add monotonic timestamps and packet sequence numbers.
- Batch FIFO reads and transmit through an encrypted BLE GATT service.
- Detect prolonged inactivity and enter a low-power state.
- Optionally calculate a simple motion gate or rep candidate signal.
- Preserve a small circular buffer during brief phone disconnections.

### 3.2 Mobile responsibilities

- Start, stop, and recover workout sessions.
- Store raw labeled recordings during development.
- Run segmentation, classification, and rep-counting models.
- Display confidence and request confirmation for uncertain predictions.
- Collect user corrections and optional load/RPE entries.
- Produce workout and muscle-group stimulus summaries.

### 3.3 Cloud responsibilities, if used

- Train and version models.
- Evaluate candidate models against a frozen subject-wise test set.
- Store consented training data with deletion and retention controls.
- Monitor aggregate error metrics without requiring raw motion uploads by default.

Cloud processing is optional. Normal workout summaries and inference should remain usable when offline.

## 4. Recognition pipeline

A hierarchical pipeline is preferable to a single classifier over an entire gym visit:

1. **Session gate:** distinguish likely workout activity from inactive periods.
2. **Exercise/rest segmentation:** find candidate set boundaries while retaining preparation and transition states.
3. **Exercise classification:** predict one of the supported exercises or `unknown`.
4. **Rep phase detection:** identify complete cycles within a classified set.
5. **Set aggregation:** merge valid rep cycles and apply duration/rest constraints.
6. **Confidence policy:** automatically accept high-confidence results and request correction for uncertain ones.

The `unknown`, `transition`, and `non-exercise` classes are essential. A model trained only on clean exercise clips will classify phone use, plate loading, machine adjustment, and walking as exercises.

### 4.1 Suggested model progression

1. Establish signal-quality and rule-based peak-counting baselines.
2. Train a compact feature model such as random forest or gradient boosting for exercise/rest segmentation and classification.
3. Compare a one-dimensional CNN or temporal convolutional network using raw windows.
4. Evaluate an exercise-conditioned rep detector instead of forcing one universal threshold.
5. Quantize and port only a model that materially improves offline behavior and fits the measured edge memory/power budget.

Model choice should be made by user-independent results, latency, and battery consumption rather than headline accuracy on random windows.

## 5. Exercise scope and expected limitations

### 5.1 Recommended MVP classes

Prefer exercises where wrist motion is strongly coupled to the resistance:

- Dumbbell biceps curl
- Dumbbell or machine shoulder press
- Dumbbell lateral raise
- Seated cable row
- Lat pulldown
- Triceps pushdown
- Chest press or bench press
- One additional movement selected after pilot separability testing

Do not begin with many nearly identical machine variants. Classes should be merged when their wrist signals and product value do not justify a reliable distinction.

### 5.2 Difficult or unsupported cases

- Leg press, leg curl, calf raise, and other lower-body machine exercises with passive wrists
- Squat depth, knee alignment, and detailed lifting-form assessment
- Isometric exercises such as planks without a strong cyclic wrist signal
- Load or force estimation from motion alone
- Unilateral work performed mainly by the arm without the band
- Exercise variants with nearly identical wrist trajectories
- Loose straps, reversed orientation, switching wrists, or holding the phone during a set

Controlled studies demonstrate that wrist-based recognition can perform well on limited catalogs. One smartwatch study reported 98.91% wrist-only recognition and rep counts within ±1 for 91% of sets. These figures are not a product guarantee: another study using 37 exercises reported only 75% wrist-only group-classification accuracy, with lower-body movements benefiting from other sensor locations. Real-gym transitions, unseen users, equipment variations, and unsupported exercises will reduce performance relative to clean laboratory clips.

## 6. Dataset design

Two complementary datasets are required.

### 6.1 Controlled exercise recordings

Record each supported exercise with known labels and deliberately varied execution:

- 20 to 50 participants for a serious first validation
- Different body sizes, training experience, dominant hands, and movement styles
- Three to five sets per exercise and approximately 8 to 15 reps per set
- Multiple loads, tempos, ranges of motion, grip styles, and fatigue levels
- Both wrist sides where the product permits either side
- Tight, normal, and slightly loose strap conditions
- Correct repetitions, incomplete repetitions, pauses, and aborted sets

### 6.2 Continuous gym sessions

Record complete sessions that include:

- Walking and standing
- Phone use and drinking water
- Equipment adjustment and plate handling
- Warm-ups and mobility work
- Rest periods and conversations
- Unsupported exercises
- Transitions between machines
- Session start and end ambiguity

Continuous sessions must be annotated with set and rep timestamps, not just one label for the whole file. Synchronized video is the most practical development-time ground truth, provided participants explicitly consent and the video is protected and deleted according to policy.

### 6.3 Minimum record schema

| Field group | Fields |
|---|---|
| Sample | session ID, device time, sequence number, accel x/y/z, gyro x/y/z |
| Device | firmware version, board revision, IMU range/ODR, wrist side, orientation |
| Participant | pseudonymous ID, dominant hand, optional cohort attributes |
| Set label | exercise, set start/end, rep start/end, valid/incomplete rep |
| Training context | load, tempo target, RPE, equipment, grip/stance variant |
| Quality | strap tightness, packet loss, video available, annotator/confidence |

Never use names, email addresses, or other direct identifiers as model keys.

### 6.4 Data partitioning

Split by participant, not by random windows. Windows from one person's session must not appear in both training and test data. Recommended evaluation is:

- Development: subject-wise train/validation split
- Model selection: leave-one-subject-out or grouped cross-validation
- Final report: one frozen, untouched participant-wise test set
- Optional personalization: report separately from the user-independent model

Also hold out entire sessions, equipment instances, or gym locations when testing the corresponding generalization claim.

## 7. Validation and release gates

### 7.1 Model metrics

| Function | Required metrics |
|---|---|
| Exercise classification | Macro-F1, balanced accuracy, per-class precision/recall, confusion matrix, unknown rejection |
| Set detection | Event precision/recall/F1 with an explicit boundary tolerance |
| Rep counting | Mean absolute error, median absolute error, percentage of sets within ±1 and ±2 reps |
| Continuous operation | False sets per hour, missed-set rate, end-to-end session accuracy |
| System quality | BLE loss, timing jitter, inference latency, current, runtime, thermal behavior |

Window accuracy alone is insufficient because many overlapping windows can come from the same easy set.

### 7.2 Proposed MVP release gate

- Five to eight published exercise classes plus `unknown`
- Macro-F1 of at least 0.80 on the frozen participant-wise test set
- At least 85% of correctly identified sets counted within ±1 repetition
- False-set rate low enough for complete sessions; set a numeric threshold after pilot data
- Less than 1% BLE packet loss under the supported phone-distance scenario
- Workout-length battery runtime demonstrated on the assembled prototype with safety margin
- Every result editable in the app; low-confidence results clearly identified

These are engineering starting gates, not medical or universal-performance claims.

## 8. Muscle-use and growth reporting

### 8.1 Acceptable output

The app may compute a transparent **muscle-group training-stimulus estimate**:

```text
stimulus(group) = sum(
  exercise-to-muscle contribution
  x completed sets
  x completed reps
  x entered load or relative intensity
  x effort / tempo adjustment
)
```

It should be described as an estimate based on the workout record. When load or effort is missing, show a lower-confidence relative score rather than fabricated training volume.

Useful outputs include:

- Sets and reps by exercise
- Entered volume load (`sets × reps × load` where applicable)
- Primary and secondary muscle groups trained
- Weekly volume trend
- Estimated stimulus and recovery trend
- Personal consistency and progression

### 8.2 Prohibited or unsupported claims

Do not state that the device measured:

- Percentage of a muscle activated
- Muscle damage
- Calories with clinical precision
- Hypertrophy produced by an individual workout
- Millimeters or percentage of muscle growth
- Injury risk or medical recovery status

Longitudinal growth assessment would require additional inputs such as consistent circumference or imaging measurements, body composition, load history, nutrition, sleep, and recovery. Even then, output is a trend estimate rather than a direct IMU measurement.

## 9. Privacy, safety, and security

- Disable audio capture by default and avoid collecting it for the MVP.
- Use authenticated pairing, encrypted BLE characteristics, and signed firmware where the chosen stack supports them.
- Store a pseudonymous participant ID and keep identity data separately.
- Obtain explicit consent for research recordings, especially synchronized video.
- Define retention and deletion periods before data collection.
- Keep raw sensor upload opt-in; summaries can remain local.
- Document battery type, polarity, charging current, enclosure ventilation, and charging tests.
- Do not market the prototype as a medical device or diagnostic instrument.

Motion patterns can be identifying and are health-adjacent personal data. Security and consent requirements apply even when the data contains no name.

## 10. Development roadmap

### Phase 0: board characterization (1–2 weeks)

- Confirm physical board revision and whether external flash is populated.
- Validate IMU axes, ranges, timestamp stability, FIFO, interrupt, and BLE throughput.
- Measure current in idle, recording, transmitting, disconnected, and sleep states.
- Verify safe battery monitoring and 50/100 mA charging behavior.

### Phase 1: logger and pilot data (2–3 weeks)

- Implement the 100 Hz accel+gyro data protocol.
- Build the mobile recording, labeling, and correction flow.
- Collect a small controlled pilot and continuous negative examples.
- Select five to eight separable exercises.

### Phase 2: baseline inference (3–4 weeks)

- Implement motion gating and exercise/rest segmentation.
- Establish feature-model and peak-counting baselines.
- Add exercise-conditioned rep counting and `unknown` rejection.
- Evaluate using participant-wise splits.

### Phase 3: full-session validation (3–4 weeks)

- Collect 20–50 participant data with continuous gym sessions.
- Freeze the exercise catalog and test set.
- Evaluate accuracy, false sets per hour, BLE reliability, and battery runtime.
- Improve the correction UX and confidence policy.

### Phase 4: edge optimization and beta (3–4 weeks)

- Compare 100 Hz and 50 Hz production profiles.
- Port a quantized motion gate or rep model only if it improves battery, privacy, or offline use.
- Conduct real-gym beta testing and publish supported/unsupported conditions.

## 11. Principal risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Wrist cannot observe lower-body motion | Missed or confused exercises | Limit claims; add another sensor or equipment integration later |
| Clean-clip overfitting | Good lab score, poor gym behavior | Collect continuous sessions and hard negatives |
| Participant leakage | Inflated validation results | Group all splits by participant |
| Uncertain board storage | Data loss or oversized firmware | Verify revision/BOM; do not depend on external flash |
| BLE interruption | Missing samples and counts | Sequence numbers, ring buffer, reconnection recovery |
| Strap movement/orientation | Signal drift and misclassification | Orientation calibration, fit guidance, augmentation |
| Battery estimate based on datasheets | Unmet runtime | Measure the complete assembled system |
| Muscle-growth overclaim | Loss of trust and regulatory risk | Report transparent stimulus/trend estimates only |

## 12. Conclusion

Proceed with the XIAO nRF52840 Sense for a scoped prototype. The board is capable of acquiring the motion signals and running the communication and lightweight processing needed for an exercise-tracking band. The principal challenge is not processor performance; it is obtaining representative, accurately labeled, user-independent data and defining an honest supported-exercise boundary.

The first product claim should be: **automatic set and repetition tracking for a published list of supported exercises, with user correction**. Muscle-group stimulus may be added as a transparent derived estimate. Direct muscle activation and muscle growth should remain outside the sensor's claims.

## References

1. Seeed Studio, [Getting Started with Seeed Studio XIAO nRF52840 Series](https://wiki.seeedstudio.com/XIAO_BLE/).
2. Seeed Studio, [IMU Usage for XIAO nRF52840 Sense](https://wiki.seeedstudio.com/XIAO-BLE-Sense-IMU-Usage/).
3. Seeed Studio, [XIAO nRF52840 Sense schematic](https://files.seeedstudio.com/wiki/XIAO-BLE/Seeed_Studio_XIAO_nRF52840_PDF.pdf).
4. Nordic Semiconductor, [nRF52840 product page](https://www.nordicsemi.com/Products/nRF52840).
5. Nordic Semiconductor, [nRF52840 Product Specification](https://docs.nordicsemi.com/bundle/ps_nrf52840/page/keyfeatures_html5.html).
6. STMicroelectronics, [LSM6DS3TR-C datasheet](https://www.st.com/resource/en/datasheet/lsm6ds3tr-c.pdf).
7. Texas Instruments, [BQ25100/BQ25101 single-cell charger datasheet](https://www.ti.com/lit/ds/symlink/bq25100a.pdf).
8. Pernek et al., [Recognition and Repetition Counting for Complex Physical Exercises with Deep Learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC6387025/), *Sensors*, 2019, doi:10.3390/s19030714.
9. Phan et al., [Seven Things to Know about Exercise Classification with Inertial Sensing Wearables](https://pmc.ncbi.nlm.nih.gov/articles/PMC11284806/), 2024.

---

This is an engineering feasibility report, not medical advice or a clinical validation document.
