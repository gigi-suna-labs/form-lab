# Fabric sensor — test materials to order

To try the conductive-fabric version (see `fabric-design.html`) before sewing anything. Two parts, roughly $25–30 total, both from Adafruit (or a reseller that carries the same items).

## 1. The stretch sensor fabric

**EeonTex Stretchy Variable Resistance Sensor Fabric — LTT-SLPA-20K** (Adafruit #3669).

- ~20 kΩ per square inch at rest; resistance **drops to about half when stretched**.
- 72% nylon, 28% spandex; ~0.38 mm thick; washable, tested to 30 washes.
- Sold as a sheet (about 8 × 8 in / 20 × 20 cm) for ~$14.

**Important: this is the opposite direction from our rubber cord.** The cord's resistance goes *up* when stretched; this fabric's goes *down*. So a rep shows as a dip, not a peak. The firmware/analysis just flips the sign, but don't be confused when you first see it on the graph.

## 2. The contacts

**Adafruit Stainless Steel Conductive Thread — 3-ply** (Adafruit #641), ~10 Ω/ft.

- Use the 3-ply, not the 2-ply (#640, 16 Ω/ft) — lower resistance makes cleaner contacts.
- 316L stainless, doesn't oxidize, machine-washable.
- ~$6 for 60 ft.

Sew a solid line of this thread across the fabric at each end of the sensing segment. That line is the contact; your jumper wire attaches to it (via a knot + a tiny crimp, or a snap). **Don't solder** — solder won't bond to these.

## Bench test (do this before sewing into a band)

1. Cut a strip of the fabric, a few cm wide, along the stretchy direction.
2. Sew a line of conductive thread across each end, a set distance apart.
3. Multimeter across the two lines: read resistance at rest, then while stretched. Confirm it changes clearly and returns to rest.
4. Pick a fixed divider resistor near the fabric's rest resistance (likely tens of kΩ, so probably ~22 kΩ, not the 10 kΩ used for the cord). Measure first, then choose.
5. Wire the divider (3V3 → fabric → A0 → fixed resistor → GND), run it through FORM Lab, and compare a curl set against a cord recording.

## Sources
- EeonTex LTT-SLPA-20K: https://www.adafruit.com/product/3669
- Datasheet: https://cdn-shop.adafruit.com/product-files/3669/LTT-SLPA+TDS.pdf
- Conductive thread 3-ply: https://www.adafruit.com/product/641
