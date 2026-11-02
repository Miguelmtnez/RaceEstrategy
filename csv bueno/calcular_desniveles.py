"""Calculate elevation metrics for the five activity CSV parts."""

import ast
import csv
import gzip
import json
import math
import os
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent
JSON_PATH = Path.home() / "Downloads" / "endomondoHR.json.gz"
PART_PATTERN = "actividades_completo_con_detalle_parte_*.csv"
ELEVATION_FIELDS = (
    "desnivel_positivo_m",
    "desnivel_negativo_m",
    "altitud_min_m",
    "altitud_max_m",
)
MAX_STEP_M = 100.0
MIN_ALTITUDE_M = -500.0
MAX_ALTITUDE_M = 8849.0
MAX_TOTAL_ELEVATION_M = 4000.0


def clean_altitudes(altitudes):
    """Interpolate missing or implausible samples and remove abrupt spikes."""
    values = []
    filtered = 0
    for altitude in altitudes:
        if altitude is None:
            values.append(None)
            continue
        try:
            value = float(altitude)
        except (TypeError, ValueError, OverflowError):
            values.append(None)
            filtered += 1
            continue
        if not math.isfinite(value) or not MIN_ALTITUDE_M <= value <= MAX_ALTITUDE_M:
            values.append(None)
            filtered += 1
            continue
        values.append(value)

    spikes = set()
    for index in range(len(values) - 1):
        first = values[index]
        second = values[index + 1]
        if first is not None and second is not None and abs(second - first) > MAX_STEP_M:
            spikes.update((index, index + 1))

    for index in spikes:
        values[index] = None
    filtered += len(spikes)

    index = 0
    while index < len(values):
        if values[index] is not None:
            index += 1
            continue

        start = index
        while index < len(values) and values[index] is None:
            index += 1
        end = index - 1
        left = values[start - 1] if start > 0 else None
        right = values[index] if index < len(values) else None

        if left is not None and right is not None:
            gap_size = end - start + 2
            step = (right - left) / gap_size
            for offset, position in enumerate(range(start, index), start=1):
                values[position] = left + step * offset
        elif left is not None:
            for position in range(start, index):
                values[position] = left
        elif right is not None:
            for position in range(start, index):
                values[position] = right

    return values, filtered


def calculate_elevation(altitudes):
    if len(altitudes) < 2:
        return "", "", "", ""

    alt_min = round(min(altitudes), 1)
    alt_max = round(max(altitudes), 1)
    gain = 0.0
    loss = 0.0

    for first, second in zip(altitudes, altitudes[1:]):
        difference = second - first
        if difference >= 0.5:
            gain += difference
        elif difference <= -0.5:
            loss += abs(difference)

    gain = round(gain, 1)
    loss = round(loss, 1)
    if gain > MAX_TOTAL_ELEVATION_M or loss > MAX_TOTAL_ELEVATION_M:
        return "", "", "", ""
    return gain, loss, alt_min, alt_max


def read_activity_ids(parts):
    ids_by_part = []
    fields_by_part = []
    ids_to_update = set()
    seen_ids = set()

    for part in parts:
        with part.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            fields = reader.fieldnames
            required = {"actividad_id", *ELEVATION_FIELDS}
            if not fields or not required.issubset(fields):
                raise ValueError(f"Missing required columns in {part.name}")

            ids = []
            for row in reader:
                activity_id = str(row.get("actividad_id", "")).strip()
                if not activity_id:
                    raise ValueError(f"Missing actividad_id in {part.name}")
                if activity_id in seen_ids:
                    raise ValueError(f"Duplicate actividad_id: {activity_id}")
                seen_ids.add(activity_id)
                ids.append(activity_id)
                if any(not row.get(field) for field in ELEVATION_FIELDS):
                    ids_to_update.add(activity_id)

        ids_by_part.append(ids)
        fields_by_part.append(fields)

    return ids_by_part, fields_by_part, ids_to_update


def find_elevations(activity_ids):
    elevations = {}
    invalid_records = 0
    filtered_samples = 0
    rejected_activities = 0
    parse_errors = 0
    records_scanned = 0

    with gzip.open(JSON_PATH, "rt", encoding="utf-8") as source:
        for line in source:
            records_scanned += 1
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                try:
                    data = ast.literal_eval(line)
                except (ValueError, SyntaxError, MemoryError):
                    parse_errors += 1
                    continue

            if not isinstance(data, dict):
                continue
            activity_id = str(data.get("id"))
            if activity_id not in activity_ids or activity_id in elevations:
                continue

            altitudes = data.get("altitude", [])
            if altitudes is None:
                altitudes = []
            if not isinstance(altitudes, (list, tuple)):
                invalid_records += 1
                elevations[activity_id] = dict.fromkeys(ELEVATION_FIELDS, "")
                continue

            cleaned, filtered = clean_altitudes(altitudes)
            filtered_samples += filtered
            valid_altitudes = [value for value in cleaned if value is not None]
            if len(valid_altitudes) < 2:
                invalid_records += 1
                elevations[activity_id] = dict.fromkeys(ELEVATION_FIELDS, "")
            else:
                result = calculate_elevation(cleaned)
                if result[0] == "":
                    rejected_activities += 1
                    elevations[activity_id] = dict.fromkeys(ELEVATION_FIELDS, "")
                else:
                    elevations[activity_id] = dict(
                        zip(ELEVATION_FIELDS, result)
                    )

            if records_scanned % 50000 == 0:
                print(
                    f"Read {records_scanned:,} records; "
                    f"found {len(elevations):,}/{len(activity_ids):,}",
                    flush=True,
                )
            if len(elevations) == len(activity_ids):
                break

    missing_ids = activity_ids - set(elevations)
    return (
        elevations,
        missing_ids,
        invalid_records,
        filtered_samples,
        rejected_activities,
        parse_errors,
        records_scanned,
    )


def write_and_validate_parts(parts, ids_by_part, fields_by_part, elevations):
    temp_paths = []
    try:
        for part, expected_ids, fields in zip(parts, ids_by_part, fields_by_part):
            temp = part.with_name(part.name + ".elevation.tmp")
            if temp.exists():
                raise FileExistsError(f"Temporary file already exists: {temp.name}")
            temp_paths.append(temp)
            with part.open("r", encoding="utf-8-sig", newline="") as source:
                reader = csv.DictReader(source)
                with temp.open("w", encoding="utf-8-sig", newline="") as target:
                    writer = csv.DictWriter(target, fieldnames=fields)
                    writer.writeheader()
                    for row in reader:
                        result = elevations.get(row["actividad_id"])
                        if result is not None:
                            row.update(result)
                        writer.writerow(row)

            with temp.open("r", encoding="utf-8-sig", newline="") as check:
                reader = csv.DictReader(check)
                if reader.fieldnames != fields:
                    raise ValueError(f"Header validation failed: {temp.name}")
                rows = list(reader)
            actual_ids = [row["actividad_id"] for row in rows]
            if len(rows) != len(expected_ids) or actual_ids != expected_ids:
                raise ValueError(f"Row/order validation failed: {temp.name}")
            if any(len(row) != len(fields) for row in rows):
                raise ValueError(f"Column count validation failed: {temp.name}")

        for part, temp in zip(parts, temp_paths):
            os.replace(temp, part)
    finally:
        for temp in temp_paths:
            if temp.exists():
                temp.unlink()


def main():
    parts = sorted(DATA_DIR.glob(PART_PATTERN))
    if len(parts) != 5:
        raise FileNotFoundError(f"Expected 5 CSV parts; found {len(parts)}")
    if not JSON_PATH.is_file():
        raise FileNotFoundError(f"Altitude data not found: {JSON_PATH}")

    ids_by_part, fields_by_part, ids_to_update = read_activity_ids(parts)
    print(f"Activities needing elevation data: {len(ids_to_update):,}")
    (
        elevations,
        missing_ids,
        invalid_records,
        filtered_samples,
        rejected_activities,
        parse_errors,
        records_scanned,
    ) = find_elevations(ids_to_update)

    print(f"JSON records scanned: {records_scanned:,}")
    print(f"Matched activities: {len(elevations):,}")
    print(f"Missing activity IDs: {len(missing_ids):,}")
    print(f"Filtered altitude samples: {filtered_samples:,}")
    print(f"Activities without usable altitudes: {invalid_records:,}")
    print(f"Activities rejected above 4,000 m gain/loss: {rejected_activities:,}")
    print(f"Unparseable JSON lines: {parse_errors:,}")

    write_and_validate_parts(parts, ids_by_part, fields_by_part, elevations)
    for part, ids in zip(parts, ids_by_part):
        calculated = sum(
            elevations.get(activity_id, {}).get("desnivel_positivo_m", "") != ""
            for activity_id in ids
        )
        print(f"{part.name}: {calculated:,} activities calculated")
    print("All five CSV parts were updated and validated.")


if __name__ == "__main__":
    main()
