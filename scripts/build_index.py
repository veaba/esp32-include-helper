#!/usr/bin/env python3
"""
ESP-IDF Symbol Index Builder
Scans ESP-IDF header files and builds a SQLite symbol cache
"""

import os
import re
import sqlite3
import argparse
from pathlib import Path
from typing import Dict, List
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed


@dataclass
class SymbolInfo:
    name: str
    header: str
    full_path: str
    type: str
    chip_target: str
    idf_version: str
    line_number: int
    description: str


CHIP_SPECIFIC_PATHS = {
    'esp32': ['esp32/include', 'hal/esp32/include', 'soc/esp32/include'],
    'esp32s3': ['esp32s3/include', 'hal/esp32s3/include', 'soc/esp32s3/include'],
    'esp32c3': ['esp32c3/include', 'hal/esp32c3/include', 'soc/esp32c3/include'],
    'esp32c6': ['esp32c6/include', 'hal/esp32c6/include', 'soc/esp32c6/include'],
    'esp32h2': ['esp32h2/include', 'hal/esp32h2/include', 'soc/esp32h2/include'],
}


class ESPIDFIndexBuilder:
    def __init__(self, idf_path: str, chip_target: str, idf_version: str):
        self.idf_path = Path(idf_path)
        self.components_path = self.idf_path / "components"
        self.chip_target = chip_target
        self.idf_version = idf_version
        self.symbols: Dict[str, SymbolInfo] = {}

        if chip_target in CHIP_SPECIFIC_PATHS:
            self.chip_paths = CHIP_SPECIFIC_PATHS[chip_target]
        else:
            self.chip_paths = []

    def build_index(self) -> Dict[str, SymbolInfo]:
        print(f"Scanning ESP-IDF {self.idf_version} headers...")
        print(f"Target chip: {self.chip_target}")
        print(f"IDF path: {self.idf_path}")

        headers = self.collect_headers()
        print(f"Found {len(headers)} header files")

        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(self.parse_header, h): h for h in headers}
            for i, future in enumerate(as_completed(futures)):
                if i % 100 == 0:
                    print(f"Progress: {i}/{len(headers)}")
                symbols = future.result()
                for sym in symbols:
                    self.symbols[sym.name] = sym

        print(f"Extracted {len(self.symbols)} symbols")
        return self.symbols

    def collect_headers(self) -> List[Path]:
        headers = []

        if not self.components_path.exists():
            print(f"Warning: components path not found: {self.components_path}")
            return headers

        for component_dir in self.components_path.iterdir():
            if not component_dir.is_dir():
                continue

            include_dir = component_dir / "include"
            if include_dir.exists():
                headers.extend(include_dir.rglob("*.h"))

            for chip_path in self.chip_paths:
                chip_include = component_dir / chip_path
                if chip_include.exists():
                    headers.extend(chip_include.rglob("*.h"))

        return list(set(headers))

    def parse_header(self, header_path: Path) -> List[SymbolInfo]:
        symbols = []

        try:
            with open(header_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')

            patterns = [
                (r'^\s*(\w+(?:\s*\*\s*)?)\s+(\w+)\s*\([^)]*\)\s*;', 'function'),
                (r'typedef\s+[^;]+\s+(\w+)\s*;', 'typedef'),
                (r'typedef\s+enum\s*\{[^}]*\}\s*(\w+)\s*;', 'enum'),
                (r'typedef\s+struct\s*\{[^}]*\}\s*(\w+)\s*;', 'struct'),
                (r'#define\s+([A-Z_][A-Z0-9_]*)(?:\s|$)', 'macro'),
                (r'#define\s+(ESP_ERR_[A-Z_]+)\s+', 'macro'),
                (r'^\s*(\w+(?:\s*\*\s*)?)\s+(esp_\w+)\s*\([^)]*\)\s*;', 'function'),
                (r'^\s*(\w+(?:\s*\*\s*)?)\s+(nvs_\w+)\s*\([^)]*\)\s*;', 'function'),
                (r'^\s*(\w+(?:\s*\*\s*)?)\s+(gpio_\w+)\s*\([^)]*\)\s*;', 'function'),
                (r'^\s*(\w+(?:\s*\*\s*)?)\s+(wifi_\w+)\s*\([^)]*\)\s*;', 'function'),
            ]

            for pattern, sym_type in patterns:
                for match in re.finditer(pattern, content, re.MULTILINE):
                    symbol_name = match.group(1) if len(match.groups()) > 0 else match.group(0)
                    if len(match.groups()) >= 2:
                        symbol_name = match.group(2)

                    line_num = content[:match.start()].count('\n') + 1
                    description = self.extract_comment_before(lines, line_num - 1)

                    try:
                        relative_path = str(header_path.relative_to(self.idf_path))
                    except ValueError:
                        relative_path = str(header_path)

                    symbol = SymbolInfo(
                        name=symbol_name,
                        header=header_path.name,
                        full_path=relative_path,
                        type=sym_type,
                        chip_target=self.chip_target,
                        idf_version=self.idf_version,
                        line_number=line_num,
                        description=description,
                    )
                    symbols.append(symbol)

        except Exception as e:
            print(f"Error parsing {header_path}: {e}")

        return symbols

    def extract_comment_before(self, lines: List[str], line_index: int) -> str:
        description = ""
        i = line_index - 1
        comment_lines = []

        while i >= 0 and (lines[i].strip().startswith('//') or lines[i].strip().startswith('/*')):
            comment_lines.insert(0, lines[i].strip())
            i -= 1

        if comment_lines:
            description = ' '.join(comment_lines)
            description = re.sub(r'[/\*]', '', description).strip()

        return description

    def save_to_sqlite(self, db_path: str):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                header TEXT NOT NULL,
                full_path TEXT,
                type TEXT,
                chip_target TEXT,
                idf_version TEXT,
                line_number INTEGER,
                description TEXT,
                UNIQUE(name, chip_target, idf_version)
            );

            CREATE TABLE IF NOT EXISTS headers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                full_path TEXT,
                includes TEXT,
                symbols TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_symbol_name ON symbols(name);
            CREATE INDEX IF NOT EXISTS idx_symbol_chip ON symbols(chip_target);
            CREATE INDEX IF NOT EXISTS idx_symbol_header ON symbols(header);

            CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
                name, header, description,
                content=symbols,
                content_rowid=id
            );

            CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
                INSERT INTO symbols_fts(rowid, name, header, description)
                VALUES (new.id, new.name, new.header, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
                INSERT INTO symbols_fts(symbols_fts, rowid, name, header, description)
                VALUES ('delete', old.id, old.name, old.header, old.description);
            END;
        """)

        cursor.execute("DELETE FROM symbols")

        symbols_data = []
        for symbol in self.symbols.values():
            symbols_data.append((
                symbol.name,
                symbol.header,
                symbol.full_path,
                symbol.type,
                symbol.chip_target,
                symbol.idf_version,
                symbol.line_number,
                symbol.description,
            ))

        cursor.executemany('''
            INSERT OR REPLACE INTO symbols
            (name, header, full_path, type, chip_target, idf_version, line_number, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', symbols_data)

        conn.commit()
        conn.close()
        print(f"Saved {len(symbols_data)} symbols to {db_path}")


def main():
    parser = argparse.ArgumentParser(description='Build ESP-IDF symbol index')
    parser.add_argument('--idf-path', required=True, help='ESP-IDF installation path')
    parser.add_argument('--chip-target', default='esp32', help='Target chip type')
    parser.add_argument('--idf-version', default='v5.5.4', help='ESP-IDF version')
    parser.add_argument('--output', default='symbols.db', help='Output database path')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose output')

    args = parser.parse_args()

    builder = ESPIDFIndexBuilder(args.idf_path, args.chip_target, args.idf_version)
    builder.build_index()
    builder.save_to_sqlite(args.output)


if __name__ == '__main__':
    main()