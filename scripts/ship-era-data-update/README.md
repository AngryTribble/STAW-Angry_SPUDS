# Ships CSV Workflow

This document explains how to use the import/export scripts for managing ship era flags in CSV format.

## Overview

Two scripts enable a round-trip workflow for managing ship data:
- **`ships-to-csv.js`** — Exports ship data to CSV format
- **`csv-to-ships.js`** — Imports CSV data back into ships.js format

This allows non-technical users to edit ship era flags in a spreadsheet application (Excel, Google Sheets, Numbers, etc.) and update the source data.

## What Gets Exported/Imported

Each script handles these columns:
- `id` — Ship identifier (e.g., "FRS001", "S317")
- `name` — Ship name (e.g., "U.S.S. Enterprise")
- `class` — Ship class (e.g., "Constitution Class")
- `eraENT` — Enterprise Era flag
- `eraTOS` — The Original Series Era flag
- `eraTMP` — The Motion Picture Era flag
- `eraTNG` — The Next Generation Era flag
- `eraDSV` — Deep Space Nine & Voyager Era flag
- `eraKVN` — Kelvin Timeline Era flag

**Era flags** are represented as:
- `x` — Flag is enabled (true)
- *(blank)* — Flag is disabled (not set)

## Workflow

### Step 1: Export Ships to CSV

```bash
node scripts/ship-era-data-update/ships-to-csv.js src/data/ships.js ships.csv
```

**Output:**
```
id,name,class,eraENT,eraTOS,eraTMP,eraTNG,eraDSV,eraKVN
FRS001,Duras's Bird-of-Prey,22nd Century Bird-of-Prey,,,,,,
S317,U.S.S. Enterprise,Constitution Class,x,,,,,
S085,Chang's Bird-of-Prey,Klingon Bird-of-Prey,,,x,x,x,
```

The CSV file is now ready to open in a spreadsheet application.

### Step 2: Edit the CSV

Open the generated CSV in Excel, Google Sheets, or any spreadsheet application:
1. Locate the ships you want to modify
2. In the era columns, enter `x` to enable a flag, or leave blank to disable it
3. Save the file (in CSV format)

**Example modifications:**
- Remove eraENT from S317: Change `x,,,,,` to `,,,,`
- Add eraTMP to FRS001: Change `,,` to `,,,x,,`

### Step 3: Import CSV Back to ships.js

```bash
node scripts/ship-era-data-update/csv-to-ships.js ships.csv src/data/ships.js
```

**Output:**
```
✓ Successfully imported 407 ships to: src/data/ships.js
  Note: Era flags have been updated. Other fields preserved from original.
```

The original ship data is preserved, and only era flags are updated.

## Command Reference

### Export

```bash
node scripts/ship-era-data-update/ships-to-csv.js <input-file> <output-file>
```

**Parameters:**
- `<input-file>` — Path to ships.js (e.g., `src/data/ships.js`)
- `<output-file>` — Path where CSV will be saved (e.g., `ships.csv`)

**Example:**
```bash
node scripts/ship-era-data-update/ships-to-csv.js src/data/ships.js ships.csv
```

### Import

```bash
node scripts/ship-era-data-update/csv-to-ships.js <csv-file> <output-file>
```

**Parameters:**
- `<csv-file>` — Path to edited CSV file
- `<output-file>` — Path where updated ships.js will be saved (typically `src/data/ships.js`)

**Example:**
```bash
node scripts/ship-era-data-update/csv-to-ships.js ships.csv src/data/ships.js
```

## Important Notes

### Data Preservation
- **Export** captures: `id`, `name`, `class`, and era flags only
- **Import** preserves all original fields from the source ships.js file (attack, shields, cost, text, factions, etc.)
- Only era flags are updated from the CSV

### Round-Trip Accuracy
The workflow is safe and accurately preserves:
- Ship object structure and properties
- Special characters in ship names and classes
- All non-era-flag data

### CSV Format
- Plain CSV format (comma-separated values)
- Can be opened and edited in any spreadsheet application
- Era flags use `x` for true (not "yes", "true", "1")
- Blank cells for false/empty flags

## Troubleshooting

### "Input file not found"
Make sure the file path is correct:
```bash
# Check the file exists first
ls src/data/ships.js
```

### "CSV file does not export an array"
The input file must be a valid Node.js module that exports an array. ships.js uses:
```javascript
module.exports = [ /* ships */ ]
```

### Spreadsheet won't open CSV
Some spreadsheet applications require file extension `.csv`. Ensure your file is saved with `.csv` extension.

### Lost data after import
The import script preserves all original fields from the source file. If you imported from the wrong source, the data is intact in a backup. Re-run with the correct files.

## Example Workflow

```bash
# 1. Export all ships
node scripts/ship-era-data-update/ships-to-csv.js src/data/ships.js ships-export.csv

# 2. Edit ships-export.csv in Excel/Sheets
#    (User adds 'x' marks in era columns)

# 3. Import updated CSV
node scripts/ship-era-data-update/csv-to-ships.js ships-export.csv src/data/ships.js

# 4. Rebuild the application
npm start
```

## Questions?

Refer to the inline comments in the scripts for implementation details:
- `ships-to-csv.js` — Export logic and CSV formatting
- `csv-to-ships.js` — Import logic and data preservation
