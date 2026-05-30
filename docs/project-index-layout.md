# Project Index and Folder Layout

This document defines the target on-disk layout for project-scoped grading data and the JSON
contract for the per-project index file. It is the authoritative reference for the
`ProjectIndex` class (`src/ProjectIndex.mjs`) and the project-entry check in `FolderScanner`
(`src/FolderScanner.mjs`, check `SCN-011`).

---

## 1. Layout — flat global schema base + project entries

The schema base is flat and global. Every graded schema lives once under
`grading-data/schemas/<namespace>/`, shared across all projects. Projects never duplicate
schema snapshots; a project's selections reference the flat-base snapshots by `schemaId`.

```
grading-data/
├── schemas/                       FLAT GLOBAL BASE — shared, no duplication
│   └── <namespace>/
│       ├── namespace.json
│       ├── about/<aboutHash>--about.md
│       └── <schemaHash>--v<X.Y.Z>.mjs
└── projects/
    └── <projectName>/
        ├── index.json             single index file for this project
        └── selection/
            └── <selectionId>/
                ├── selection.json
                └── selection.lock.json
```

---

## 2. Reference + override (on-top, non-mutating)

A selection member references a flat-base schema by `schemaId` and MAY carry an optional
`override` layer:

```json
{
    "schemaId": "weather.getForecast",
    "override": {
        "name": "Forecast",
        "description": "Short-range weather forecast for a city."
    }
}
```

Rules:

- The override is applied **on-top at selection level only**. It adapts the presented tool
  `name` / `description`.
- It does **not** mutate the frozen schema snapshot, so the referenced `schemaHash` is unchanged.
- Because the override is part of `selection.json`, it flows into the `selectionHash`.
- Only the whitelisted keys `name` and `description` are accepted. Any other key, a non-object
  override, or an empty override is rejected with error code `LCK-005`.
- `SelectionLockfile.validateOverride( { override } )` validates a single override object.
  `SelectionLockfile.generate(...)` validates every member override before writing the lockfile
  and records the validated override in each lockfile member state.

---

## 3. Index JSON contract (`indexVersion: 1`)

The index is the single point that all three grading stages write to: the data-pretest stage,
the single-grading stage, and the selection-grading stage.

```json
{
    "indexVersion": 1,
    "projectName": "demo-project",
    "createdAt": "2026-05-30T10:00:00.000Z",
    "updatedAt": "2026-05-30T10:42:00.000Z",
    "dataPretest": {
        "lastRunAt": "2026-05-30T10:05:00.000Z",
        "status": "passed",
        "notes": "endpoint reachability + auth coverage checked"
    },
    "singleGradings": {
        "weather--getForecast": {
            "schemaHash": "1a2b3c4d",
            "gradingStatus": "stable",
            "lastGradedAt": "2026-05-30T10:20:00.000Z"
        }
    },
    "selectionGradings": {
        "travel-basics": {
            "selectionHash": "9f8e7d6c",
            "memberCount": 7,
            "lastGradedAt": "2026-05-30T10:40:00.000Z"
        }
    }
}
```

### Fields and who writes what

| Field | Type | Required | Writer |
|-------|------|----------|--------|
| `indexVersion` | number (`1`) | yes | `ProjectIndex.init` (set once) |
| `projectName` | string | yes | `ProjectIndex.init` (set once, must match folder) |
| `createdAt` | ISO-8601 string | yes | `ProjectIndex.init` (set once) |
| `updatedAt` | ISO-8601 string | yes | `ProjectIndex.write` (refreshed on every write) |
| `dataPretest` | object | yes | data-pretest stage |
| `singleGradings` | object (keyed by `<namespace>--<tool>`) | yes | single-grading stage |
| `selectionGradings` | object (keyed by `<selectionId>`) | yes | selection-grading stage |

The inner shapes of `dataPretest`, `singleGradings`, and `selectionGradings` are owned by the
respective writing stage. `ProjectIndex.validateIndex` enforces only that all three are present
objects so the three writers can update their own section independently without clobbering the
others.

---

## 4. No-overwrite init

`ProjectIndex.init( { gradingDataRoot, projectName } )` is a no-overwrite operation:

1. Build the index path from the project name.
2. Existence check.
3. If the file does not exist, create it with the default skeleton and return `created: true`.
4. If the file already exists, read and return it with `created: false` and the warning
   `IDX-WARN-001` — the existing index is never overwritten.

Use `ProjectIndex.write( { gradingDataRoot, projectName, index } )` to persist updates. `write`
validates the index shape, rejects a `projectName` mismatch (`IDX-005`), and refreshes
`updatedAt`.

---

## 5. Folder-scanner check `SCN-011`

`FolderScanner.scan` walks `grading-data/projects/*` and runs
`FolderScanner.checkProjectIndex( { gradingDataRoot, projectName } )` for each entry. It reports
error code `SCN-011` when the `index.json` file is missing or fails `ProjectIndex` validation.
The summary returned by `scan` includes a `projects` count alongside `namespaces`, `schemas`,
`singles`, and `selections`.

---

## 6. Error codes

| Code | Meaning |
|------|---------|
| `IDX-001` | Required field missing |
| `IDX-002` | Type mismatch |
| `IDX-003` | Unsupported `indexVersion` |
| `IDX-004` | Index file is not valid JSON |
| `IDX-005` | `projectName` mismatch on write |
| `IDX-006` | Index file not readable |
| `IDX-WARN-001` | Index already exists — init returns the existing index, no overwrite |
| `LCK-005` | Invalid selection-member override (non-whitelisted key / wrong type / empty) |
| `SCN-011` | Project index missing or invalid |
