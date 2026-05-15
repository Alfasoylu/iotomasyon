import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// ── CSV parser ────────────────────────────────────────────────────
// Handles lines of the form: "value1","value2","value3"
function parseCsv(filePath: string): string[][] {
  const raw = readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const matches = line.match(/"([^"]*)"/g);
      return matches ? matches.map((m) => m.slice(1, -1).trim()) : [];
    })
    .filter((row) => row.length >= 2);
}

// ── Title-case with Turkish locale ────────────────────────────────
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0) + word.slice(1).toLocaleLowerCase("tr-TR"),
    )
    .join(" ");
}

// ── Singleton cache (build once per process) ──────────────────────
let _cities: string[] | null = null;
let _districtsByCity: Record<string, string[]> | null = null;
let _counts: { cities: number; districts: number } | null = null;

function build() {
  if (_cities) return;

  const dir = path.join(process.cwd(), "adresler");

  // il.csv: "il_kodu","il_adi"
  const ilRows = parseCsv(path.join(dir, "il.csv"));
  const ilById = new Map<string, string>(); // id → title-cased name
  for (const [id, name] of ilRows) {
    if (id && name) ilById.set(id, titleCase(name));
  }

  // ilce.csv: "ilce_kodu","il_kodu","ilce_adi"
  const ilceRows = parseCsv(path.join(dir, "ilce.csv"));
  const byCity: Record<string, Set<string>> = {};
  for (const row of ilceRows) {
    const [, ilId, name] = row;
    const cityName = ilById.get(ilId ?? "");
    if (!cityName || !name) continue;
    if (!byCity[cityName]) byCity[cityName] = new Set();
    byCity[cityName].add(titleCase(name));
  }

  _cities = Array.from(ilById.values()).sort((a, b) =>
    a.localeCompare(b, "tr-TR"),
  );

  _districtsByCity = {};
  let totalDistricts = 0;
  for (const [city, districts] of Object.entries(byCity)) {
    const sorted = Array.from(districts).sort((a, b) =>
      a.localeCompare(b, "tr-TR"),
    );
    _districtsByCity[city] = sorted;
    totalDistricts += sorted.length;
  }

  _counts = { cities: _cities.length, districts: totalDistricts };
}

// ── Public API ────────────────────────────────────────────────────

export function getCities(): string[] {
  build();
  return _cities!;
}

export function getDistrictsByCity(): Record<string, string[]> {
  build();
  return _districtsByCity!;
}

export function getLocations(): {
  cities: string[];
  districtsByCity: Record<string, string[]>;
} {
  build();
  return { cities: _cities!, districtsByCity: _districtsByCity! };
}

export function getLocationCounts(): { cities: number; districts: number } {
  build();
  return _counts!;
}
