#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
iotomasyon SKILL.md linter.
Her skill dosyasının zorunlu bölümleri içerdiğini doğrular.
Kullanım: python3 scripts/lint-skills.py
Çıkış kodu: 0 = tüm skill'ler geçerli, 1 = eksik bölüm var.
"""

import sys
import io
from pathlib import Path

# Windows terminali için UTF-8 çıktı zorla
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Her SKILL.md dosyasında bulunması zorunlu bölümler.
REQUIRED_SECTIONS = [
    "## Amaç",
    "## Tetikleyiciler",
    "## Workflow",
    "## Çıktı",
    "## Kural",
]

# Her agents/*.md dosyasında bulunması zorunlu bölümler.
REQUIRED_AGENT_SECTIONS = [
    "## Amaç",
    "## Zamanlama",
    "## Workflow",
    "## Kural",
]

ROOT = Path(__file__).parent.parent
SKILLS_DIR = ROOT / "skills"
AGENTS_DIR = ROOT / "agents"

errors = []
checked = 0


def check_file(filepath: Path, required: list[str]) -> list[str]:
    """Dosyayı okur, eksik bölümleri döndürür."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except OSError as e:
        return [f"Okunamadı: {e}"]

    return [
        f"Eksik bölüm: '{section}'"
        for section in required
        if section not in content
    ]


# Skills kontrolü
if SKILLS_DIR.exists():
    for skill_file in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        file_errors = check_file(skill_file, REQUIRED_SECTIONS)
        checked += 1
        for err in file_errors:
            errors.append(f"{skill_file.relative_to(ROOT)} — {err}")
else:
    print("UYARI: skills/ klasörü bulunamadı", file=sys.stderr)

# Agents kontrolü
if AGENTS_DIR.exists():
    for agent_file in sorted(AGENTS_DIR.glob("*.md")):
        file_errors = check_file(agent_file, REQUIRED_AGENT_SECTIONS)
        checked += 1
        for err in file_errors:
            errors.append(f"{agent_file.relative_to(ROOT)} — {err}")
else:
    print("UYARI: agents/ klasörü bulunamadı", file=sys.stderr)

# Sonuç
if errors:
    print(f"\n✗ {len(errors)} sorun bulundu ({checked} dosya kontrol edildi):\n")
    for err in errors:
        print(f"  ✗ {err}")
    sys.exit(1)
else:
    print(f"✓ {checked} dosya kontrol edildi — tüm bölümler mevcut.")
    sys.exit(0)
