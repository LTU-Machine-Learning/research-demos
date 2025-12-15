---
title: Price Estimation – Housing Price Prediction Demo
description: Experimental tabular ML demo (Booli-derived) — currently under reconstruction.
---

## Status

This demo remains part of Vision Hub, but its **model + feature design is being rebuilt**.
Treat any output as **demo-only**.

## Goal

Expose a **stateless HTTP inference service** that predicts a housing price from structured inputs
and returns a **point estimate + uncertainty band** (e.g., p10/p50/p90).

## Current baseline (legacy)

The current version (to be replaced) follows this shape:

- **Data source:** Booli *sold* transactions (Luleå-focused dataset).
- **Models:** three LightGBM regressors (median + quantiles).
- **Serving:** FastAPI endpoints (`/predict`, plus basic health/readiness endpoints).
- **Integration:** called by the Astro frontend through JSON requests (no video / no WebRTC / no WS).

Limitations of the current baseline (reason for redesign):
- too sensitive to feature interpretation (especially geo/address signals),
- inconsistent behavior on out-of-support inputs,
- accuracy not sufficient for anything beyond demonstration.

## Vision Hub integration

From the platform perspective, this demo is just an HTTP workload:

- orchestrated on-demand by the **Control API** (Swarm service `price-api`),
- independent from `mediamtx` and the capture pipeline,
- reachable through the overlay network (`vision-hub-net`) and/or published port mapping.

## Compliance note (Booli)

If your outputs are derived from Booli data, keep the required attribution near any displayed results
(e.g., “Powered by Booli” + logo) and avoid long-term caching of raw Booli data unless explicitly allowed.
Model artifacts are typically fine.

## Related pages

- [Demos overview](/docs/demos)
- [Control API](/docs/api)
- [Global architecture](/docs/architecture)
- [Swarm backend](/docs/infrastructure/swarm)