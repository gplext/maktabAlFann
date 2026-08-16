import { customType } from "drizzle-orm/pg-core";

/**
 * A monetary amount: `numeric(12, 2)` in PostgreSQL, `number` in TypeScript.
 *
 * WHY THIS EXISTS
 *
 * node-postgres hands `numeric` back as a **string**, not a number — because a
 * PostgreSQL numeric can hold values no JS number can represent exactly. Left
 * alone, `artwork.displayPrice` would arrive in the frontend as `"68000.00"`,
 * and `price + addonPrice` would quietly produce `"68000.0013"`.
 *
 * Every amount in this application fits comfortably inside a JS number
 * (max 9,999,999,999.99), so converting on the way in and out is safe and
 * removes a whole category of bug. Do not use `integer` for money, and do not
 * use bare `numeric()` — use this.
 *
 * `toDriver` writes a fixed 2-decimal string so the value PostgreSQL stores is
 * exactly what was intended, with no float formatting surprises.
 */
export const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(12, 2)";
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    return value.toFixed(2);
  },
});

/** ISO-4217 code. The gallery's base currency. */
export const BASE_CURRENCY = "PKR" as const;

/** Round to whole paisa — use before persisting any computed amount. */
export function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
