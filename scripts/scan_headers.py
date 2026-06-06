#!/usr/bin/env python3
"""
ESP-IDF Header Scanner
Scans ESP-IDF header files and reports available symbols without building a database.
Useful for quick inspection and debugging.
"""

import argparse
import re
from pathlib import Path
from typing import Dict, List
from collections import defaultdict


CHIP_SPECIFIC_PATHS = {
    'esp32': ['esp32/include', 'hal/esp32/include', 'soc/esp32/include'],
    'esp32s3': ['esp32s3/include', 'hal/esp32s3/include', 'soc/esp32s3/include'],
    'esp32c3': ['esp32c3/include', 'hal/esp32c3/include', 'soc/esp32c3/include'],
    'esp32c6': ['esp32c6/include', 'hal/esp32c6/include', 'soc/esp32c6/include'],
    'esp32h2': ['esp32h2/include', 'hal/esp32h2/include', 'soc/esp32h2/include'],
}


def collect_headers(idf_path: Path, chip_target: str) -> List[Path]:
    headers = []
    components_path = idf_path / "components"

    if not components_path.exists():
        print(f"Warning: components path not found: {components_path}")
        return headers

    chip_paths = CHIP_SPECIFIC_PATHS.get(chip_target, [])

    for component_dir in components_path.iterdir():
        if not component_dir.is_dir():
            continue

        include_dir = component_dir / "include"
        if include_dir.exists():
            headers.extend(include_dir.rglob("*.h"))

        for chip_path in chip_paths:
            chip_include = component_dir / chip_path
            if chip_include.exists():
                headers.extend(chip_include.rglob("*.h"))

    return list(set(headers))


def scan_symbol_names(header_path: Path) -> Dict[str, List[int]]:
    symbols: Dict[str, List[int]] = defaultdict(list)

    try:
        with open(header_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        patterns = [
            r'#define\s+([A-Z_][A-Z0-9_]*)(?:\s|$)',
            r'^\s*(\w+(?:\s*\*\s*)?)\s+(\w+)\s*\([^)]*\)\s*;',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, content, re.MULTILINE):
                name = match.group(1)
                if len(match.groups()) >= 2:
                    name = match.group(2)
                line_num = content[:match.start()].count('\n') + 1
                symbols[name].append(line_num)

    except Exception as e:
        print(f"Error scanning {header_path}: {e}")

    return symbols


def main():
    parser = argparse.ArgumentParser(description='Scan ESP-IDF headers for symbols')
    parser.add_argument('--idf-path', required=True, help='ESP-IDF installation path')
    parser.add_argument('--chip-target', default='esp32', help='Target chip type')
    parser.add_argument('--filter', default=None, help='Filter symbols by name pattern')

    args = parser.parse_args()
    idf_path = Path(args.idf_path)

    headers = collect_headers(idf_path, args.chip_target)
    print(f"Found {len(headers)} header files\n")

    total_symbols = 0
    name_filter = re.compile(args.filter, re.IGNORECASE) if args.filter else None

    for header in sorted(headers):
        symbols = scan_symbol_names(header)
        if not symbols:
            continue

        if name_filter:
            symbols = {k: v for k, v in symbols.items() if name_filter.search(k)}
            if not symbols:
                continue

        try:
            relative = str(header.relative_to(idf_path))
        except ValueError:
            relative = str(header)

        print(f"\n{relative}:")
        for name, lines in sorted(symbols.items()):
            print(f"  {name} (lines: {', '.join(map(str, lines[:3]))})")
            total_symbols += 1

    print(f"\nTotal: {total_symbols} symbols across {len(headers)} headers")


if __name__ == '__main__':
    main()