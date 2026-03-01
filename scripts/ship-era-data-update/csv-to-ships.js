#!/usr/bin/env node
/**
 * Import ships from CSV back into ships.js format
 * Usage: node csv-to-ships.js [csv-file] [output-file]
 * Example: node csv-to-ships.js ships.csv src/data/ships.js
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
	console.error('Usage: node csv-to-ships.js <csv-file> <output-file>');
	console.error('Example: node csv-to-ships.js ships.csv src/data/ships.js');
	process.exit(1);
}

const csvFile = path.resolve(args[0]);
const outputFile = path.resolve(args[1]);

// Validate CSV file exists
if (!fs.existsSync(csvFile)) {
	console.error(`Error: CSV file not found: ${csvFile}`);
	process.exit(1);
}

try {
	// Read CSV file
	const csvContent = fs.readFileSync(csvFile, 'utf8');
	const lines = csvContent.trim().split('\n');

	if (lines.length < 1) {
		console.error('Error: CSV file is empty');
		process.exit(1);
	}

	// Parse CSV header
	const headers = parseCSVLine(lines[0]);
	const eraFlagIndices = {};
	const idIndex = headers.indexOf('id');
	const nameIndex = headers.indexOf('name');
	const classIndex = headers.indexOf('class');

	if (idIndex === -1 || nameIndex === -1 || classIndex === -1) {
		console.error('Error: CSV must contain "id", "name", and "class" columns');
		process.exit(1);
	}

	// Find era flag column indices
	['eraENT', 'eraTOS', 'eraTMP', 'eraTNG', 'eraDSV', 'eraKVN'].forEach((flag) => {
		const idx = headers.indexOf(flag);
		if (idx !== -1) {
			eraFlagIndices[flag] = idx;
		}
	});

	// Load original ships to preserve other fields
	const originalFile = outputFile;
	let originalShips = [];
	if (fs.existsSync(originalFile)) {
		try {
			originalShips = require(path.resolve(originalFile));
		} catch (e) {
			console.warn('Warning: Could not load original ships.js, creating new file with CSV data only');
		}
	}

	// Create lookup map for original ships by id
	const originalMap = {};
	originalShips.forEach((ship) => {
		originalMap[ship.id] = ship;
	});

	// Parse CSV rows and build updated ships
	const updatedShips = [];
	for (let i = 1; i < lines.length; i++) {
		const values = parseCSVLine(lines[i]);
		if (values.length === 0 || (values.length === 1 && values[0] === '')) {
			continue; // Skip empty lines
		}

		const id = values[idIndex];
		const name = values[nameIndex];
		const shipClass = values[classIndex];

		// Start with original ship data if it exists, otherwise create new object
		const originalShip = originalMap[id];
		let ship = originalShip ? JSON.parse(JSON.stringify(originalShip)) : { id, name, class: shipClass };

		// Update fields from CSV
		ship.id = id;
		ship.name = name;
		ship.class = shipClass;

		// Update era flags
		['eraENT', 'eraTOS', 'eraTMP', 'eraTNG', 'eraDSV', 'eraKVN'].forEach((flag) => {
			if (eraFlagIndices[flag] !== undefined) {
				const value = values[eraFlagIndices[flag]];
				if (value && value.toLowerCase().trim() === 'x') {
					ship[flag] = true;
				} else {
					// Remove the flag if not marked
					delete ship[flag];
				}
			}
		});

		updatedShips.push(ship);
	}

	if (updatedShips.length === 0) {
		console.error('Error: No valid ship records found in CSV');
		process.exit(1);
	}

	// Generate JavaScript file
	const jsContent = `module.exports = ${JSON.stringify(updatedShips, null, '\t')}\n`;

	// Write output file
	fs.writeFileSync(outputFile, jsContent, 'utf8');
	console.log(`✓ Successfully imported ${updatedShips.length} ships to: ${outputFile}`);
	console.log(`  Note: Era flags have been updated. Other fields preserved from original.`);
} catch (error) {
	console.error('Error during import:', error.message);
	process.exit(1);
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
	const result = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// Escaped quote
				current += '"';
				i++;
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			// Field separator
			result.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	// Add final field
	result.push(current);
	return result;
}
