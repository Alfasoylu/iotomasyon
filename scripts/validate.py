#!/usr/bin/env python3
"""
iotomasyon server action output validator.
Kullanım: python3 scripts/validate.py <output.json> [schema.json]

Schema belirtilmezse ACTION_RESULT_SCHEMA kullanılır.
Çıkış kodu: 0 = geçerli, 1 = geçersiz.
"""

import sys
import json

try:
    from jsonschema import validate, ValidationError
except ImportError:
    print("HATA: jsonschema kütüphanesi bulunamadı. 'pip install jsonschema' çalıştırın.", file=sys.stderr)
    sys.exit(2)

# iotomasyon server action'larının standart dönüş şeması.
# lib/actions/*.ts dosyalarındaki { ok, message, redirectTo, fieldErrors } yapısını yansıtır.
ACTION_RESULT_SCHEMA = {
    "type": "object",
    "required": ["ok"],
    "properties": {
        "ok": {
            "type": "boolean",
            "description": "İşlem başarılı mı?"
        },
        "message": {
            "type": "string",
            "description": "Kullanıcıya gösterilecek mesaj"
        },
        "redirectTo": {
            "type": "string",
            "description": "Başarı sonrası yönlendirilecek URL"
        },
        "fieldErrors": {
            "type": "object",
            "additionalProperties": {
                "type": "array",
                "items": {"type": "string"}
            },
            "description": "Alan bazlı doğrulama hataları"
        }
    },
    "additionalProperties": False
}


def main():
    if len(sys.argv) < 2:
        print("Kullanım: validate.py <output.json> [schema.json]", file=sys.stderr)
        print("Örnek:    validate.py result.json", file=sys.stderr)
        print("          validate.py result.json custom-schema.json", file=sys.stderr)
        sys.exit(1)

    output_file = sys.argv[1]
    schema_file = sys.argv[2] if len(sys.argv) >= 3 else None

    # Output dosyasını oku
    try:
        with open(output_file, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"HATA: Dosya bulunamadı: {output_file}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"HATA: Geçersiz JSON — {e}", file=sys.stderr)
        sys.exit(1)

    # Schema belirle
    schema = ACTION_RESULT_SCHEMA
    if schema_file:
        try:
            with open(schema_file, encoding="utf-8") as f:
                schema = json.load(f)
        except FileNotFoundError:
            print(f"HATA: Schema dosyası bulunamadı: {schema_file}", file=sys.stderr)
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"HATA: Geçersiz schema JSON — {e}", file=sys.stderr)
            sys.exit(1)

    # Doğrula
    try:
        validate(instance=data, schema=schema)
        print(f"OK — {output_file} şemaya uygun")
        sys.exit(0)
    except ValidationError as e:
        print(f"HATA: {e.json_path} → {e.message}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
