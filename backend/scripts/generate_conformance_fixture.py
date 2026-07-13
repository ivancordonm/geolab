"""Generate a cross-runtime conformance fixture from a construction script.

The Python engine is the deterministic authority: it evaluates the script
and records the resulting document plus every evaluated value. The frontend
suite must reproduce these values within the documented tolerance (1e-9).

Usage (from backend/, venv active):
    python scripts/generate_conformance_fixture.py fixtures-src/transformations.txt ../shared/fixtures/transformations.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.geometry.engine import evaluate_geometry_document
from app.geometry.script import evaluate_script


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: generate_conformance_fixture.py <script.txt> <output.json>")
    script_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    script = script_path.read_text()

    document, _ = evaluate_script(
        script,
        document_id=f"doc_{output_path.stem.replace('-', '_')}",
        title=output_path.stem.replace("-", " ").capitalize(),
    )
    values = evaluate_geometry_document(document)

    fixture = {
        "script": script,
        "document": json.loads(document.model_dump_json(by_alias=True)),
        "initialValues": {
            object_id: value.model_dump(by_alias=True, mode="json")
            for object_id, value in values.items()
        },
    }
    output_path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {output_path} with {len(fixture['initialValues'])} evaluated values")


if __name__ == "__main__":
    main()
