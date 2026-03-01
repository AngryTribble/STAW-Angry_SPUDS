#!/usr/bin/env node
/**
 * Export ships from ships.js to CSV format
 * Usage: node ships-to-csv.js [input-file] [output-file]
 * Example: node ships-to-csv.js src/data/ships.js ships.csv
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
	console.error('Usage: node ships-to-csv.js <input-file> <output-file>');
	console.error('Example: node ships-to-csv.js src/data/ships.js ships.csv');
	process.exit(1);
}

const inputFile = path.resolve(args[0]);
const outputFile = path.resolve(args[1]);

// Validate input file exists
if (!fs.existsSync(inputFile)) {
	console.error(`Error: Input file not found: ${inputFile}`);
	process.exit(1);
}

try {
	// Load ships data
	const ships = require(inputFile);

	if (!Array.isArray(ships)) {
		console.error('Error: ships.js does not export an array');
		process.exit(1);
	}

	// Define era era flags in order
	const eraFlags = ['eraENT', 'eraTOS', 'eraTMP', 'eraTNG', 'eraDSV', 'eraKVN'];

	// Build CSV header
	const headers = ['id', 'name', 'class', ...eraFlags];
	const csvLines = [headers.map(escapeCSV).join(',')];

	// Build CSV rows
	ships.forEach((ship) => {
		const row = [
			ship.id,
			ship.name,
			ship.class,
			...eraFlags.map((flag) => (ship[flag] ? 'x' : ''))
		];
		csvLines.push(row.map(escapeCSV).join(','));
	});

	// Write CSV file
	fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf8');
	console.log(`✓ Successfully exported ${ships.length} ships to: ${outputFile}`);
} catch (error) {
	console.error('Error during export:', error.message);
	process.exit(1);
}

/**
 * Escape CSV field values
 * Wraps in quotes if contains comma, newline, or quote
 */
function escapeCSV(value) {
	if (value === undefined || value === null) {
		return '';
	}
	const str = String(value);
	if (str.includes(',') || str.includes('\n') || str.includes('"')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}
