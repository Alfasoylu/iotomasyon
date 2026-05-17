# Import Economics Model

## Purpose

This document defines the canonical import-cost logic for IOTOMASYON.

It exists so the owner can stop relying on spreadsheet-only landed-cost math.

---

## Canonical Example

Example inputs:
- source purchase price: `10 RMB`
- payment commission: `5%`
- weight: `0.2 kg`
- air freight: `8 USD/kg`
- sea freight: `1 USD/kg`
- customs multiplier: `30%`
- RMB/USD: `1 USD = 6.7 RMB`
- USD/TRY: `1 USD = 46 TRY`

Expected air landed cost:

`((10 / 6.7) * 1.05 + (8 * 0.2)) * 1.30 = 4.11731 USD`

Step breakdown:
1. RMB to USD: `10 / 6.7 = 1.492537`
2. Add payment commission: `1.492537 * 1.05 = 1.567164`
3. Add freight: `8 * 0.2 = 1.6`
4. Pre-customs subtotal: `1.567164 + 1.6 = 3.167164`
5. Apply customs multiplier: `3.167164 * 1.30 = 4.11731`

---

## Canonical Formula

For RMB-origin imports:

`((rmb_cost / rmb_usd_rate) * (1 + payment_fee_pct) + (freight_usd_per_kg * weight_kg)) * (1 + customs_pct)`

Where:
- `rmb_cost` = purchase price in RMB
- `rmb_usd_rate` = RMB per 1 USD
- `payment_fee_pct` = payment commission percentage expressed as a decimal uplift
- `freight_usd_per_kg` = air or sea cost per kg in USD
- `weight_kg` = unit weight
- `customs_pct` = customs / import commission percentage

---

## Default Freight Rules

If no override exists:
- `AIR = 8 USD/kg`
- `SEA = 1 USD/kg`

These defaults must remain overridable by:
1. product override
2. route/profile override
3. global default fallback

---

## Required Inputs

Minimum active-use inputs:
- source purchase currency
- source purchase cost
- RMB/USD monthly exchange rate
- USD/TRY monthly exchange rate
- payment commission percentage
- weight in kg
- customs percentage
- shipping method preference
- freight profile or product-specific freight override

---

## Governance Rules

- IOTOMASYON must have one canonical landed-cost engine.
- Spreadsheet logic must not remain the operational source of truth.
- Decision results must preserve the month and assumptions used.
- Procurement, capital allocation, import calculator, and executive reporting must share the same cost engine.

---

## Current Gap Summary

At the time of writing, the current import decision engine is not yet fully aligned with this model.

Known gaps:
- current engine expects USD source price instead of supporting RMB-first input directly
- no RMB/USD monthly rate layer
- no payment commission input in the decision engine
- no route/profile freight governance
- no holding-grade snapshot and approval flow
