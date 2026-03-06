#!/usr/bin/env node

/*
 * Applies Organized Play errata bans from temp-data/Erratad Cards.csv to source card data.
 *
 * Why: The same card name can exist across multiple waves/sets, so this script maps each CSV
 * wave entry to matching set IDs and bans only the intended older printing by adding
 * `opBanned: true` to the selected card object.
 *
 * Expected CSV format:
 * Old Card,Wave
 * Example CSV rows:
 * Monotanium Armour Plating,2
 * U.S.S. Hood,u.s.s. hood prize pack
 *
 * Default mode is dry-run for safety; pass --write to persist updates in src/data/*.js.
 */

const fs = require("fs");
const path = require("path");

// Configuration
const CSV_FILE = path.join(__dirname, "../temp-data/Erratad Cards.csv");
const DATA_DIR = path.join(__dirname, "../src/data");
const SETS_FILE = path.join(__dirname, "../src/data/sets.js");
const MAIN_FILES = ["ships.js", "upgrades.js", "captains.js", "ambassadors.js", "admirals.js"];
const FALLBACK_FILES = ["others.js", "starship_construction.js"];

const DRY_RUN = !process.argv.includes("--write");

// Parse CSV file - returns array of {name, wave}
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").slice(1); // Skip header
  const cards = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const oldCard = cols[0].trim();
    const wave = cols[1].trim();
    if (oldCard) {
      cards.push({ name: oldCard, wave });
    }
  }

  return cards;
}

// Load sets.js and create mapping of set names/references to set IDs
function loadSets() {
  try {
    delete require.cache[require.resolve(SETS_FILE)];
    return require(SETS_FILE) || [];
  } catch (e) {
    console.error(`Error loading sets.js: ${e.message}`);
    return [];
  }
}

// Explicit aliases for CSV wave strings that don't resolve via sets.js text matching
const waveAliases = {
  "bellerophon prize ship": ["72001p"],
  "gornarus prize ship": ["71797"],
  "hirogen hunter card pack": ["73042"],
  "u.s.s. hood prize pack": ["71998p"],
  "enterprise-a prize ship": ["72260gp"],
  "u.s.s. enterprise-a prize ship": ["72260gp"],
  "u.s.s. enterprise-d prize ship": ["72284p"],
  "2013 starter": ["71120"],
  "u.s.s. lakota prize ship": ["blind_lakota"],
  "u.s.s. grissom card pack": ["72011wp"],
  "i.r.w. belak booster ship": ["blind_belak"],
};

// Given a wave string from the CSV, return array of all matching set IDs.
// Numeric waves match "Wave N" parentSet.
// Text waves match against set name or set id (case-insensitive, partial OK).
function findSetIdsForWave(wave, sets) {
  const lowerWave = wave.trim().toLowerCase();

  // Check explicit alias map first
  if (waveAliases[lowerWave]) return waveAliases[lowerWave];

  // Numeric: match all sets whose parentSet === "Wave N"
  if (/^\d+$/.test(wave.trim())) {
    const label = `wave ${parseInt(wave, 10)}`;
    const matches = sets
      .filter((s) => s.parentSet && s.parentSet.toLowerCase() === label)
      .map((s) => s.id);
    return matches;
  }

  // Text: first try exact set name match
  const exactName = sets.filter((s) => s.name && s.name.toLowerCase() === lowerWave);
  if (exactName.length > 0) return exactName.map((s) => s.id);

  // Text: try set id exact match (case-insensitive)
  const exactId = sets.filter((s) => s.id && s.id.toLowerCase() === lowerWave);
  if (exactId.length > 0) return exactId.map((s) => s.id);

  // Text: partial match on name
  const partial = sets.filter((s) => s.name && s.name.toLowerCase().includes(lowerWave));
  if (partial.length > 0) return partial.map((s) => s.id);

  // Text: partial match on parentSet
  const parentPartial = sets.filter(
    (s) => s.parentSet && s.parentSet.toLowerCase().includes(lowerWave)
  );
  if (parentPartial.length > 0) return parentPartial.map((s) => s.id);

  return [];
}

// Spelling variation map
const spellingVariations = {
  "Monotanium Armour Plating": ["Monotanium Armor Plating"],
  "Ablative Hull Armour": ["Ablative Hull Armor"],
  "Enhanced Hull Plating (Fed)": ["Enhanced Hull Plating"],
  "Regenerative Shielding": ["Regenerative Shields"],
  "U.S.S. Enterprise NCC-1701-E": ["U.S.S. Enterprise NCC-1701-E", "U.S.S. Enterprise-E"],
  "Federation Starship (Delta flyer Shuttle)": ["Federation Starship"],
};

// Find all cards with matching name in a file
function findCardsInFile(filePath, cardName) {
  const content = fs.readFileSync(filePath, "utf8");
  const results = [];

  const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRegex = new RegExp(`"?name"?\\s*:\\s*["\']${escapedCardName}["\']`, "g");

  let match;
  while ((match = nameRegex.exec(content)) !== null) {
    const pos = match.index;

    // Find the opening brace of this object by working backwards
    let braceCount = 0;
    let objStart = pos;
    for (let i = pos - 1; i >= 0; i--) {
      if (content[i] === "}") braceCount++;
      if (content[i] === "{") {
        if (braceCount === 0) {
          objStart = i;
          break;
        }
        braceCount--;
      }
    }

    // Find the closing brace by working forwards
    braceCount = 0;
    let objEnd = pos;
    for (let i = objStart; i < content.length; i++) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          objEnd = i;
          break;
        }
      }
    }

    // Extract the full object
    const objText = content.substring(objStart, objEnd + 1);

    // Extract id and set array
    const idMatch = objText.match(/"?id"?\s*:\s*["\']?([A-Za-z0-9_-]+)["\']?/);
    const setMatch = objText.match(/"?set"?\s*:\s*(\[[^\]]+\])/);

    if (idMatch) {
      let setArray = [];
      if (setMatch) {
        try {
          const parsed = eval("(" + setMatch[1] + ")");
          setArray = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // ignore parse error, keep empty set
        }
      }
      results.push({
        id: idMatch[1],
        set: setArray,
        objStart: objStart,
        objEnd: objEnd,
        objText: objText,
      });
    }
  }

  return results;
}

// Find ships in ships.js by class field, filtered by set IDs.
// Returns only ships whose name ends in "Starship".
function findShipsByClass(className, targetSetIds) {
  const filePath = path.join(DATA_DIR, "ships.js");
  const content = fs.readFileSync(filePath, "utf8");
  const results = [];

  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classRegex = new RegExp(`"?class"?\\s*:\\s*["']${escapedClassName}["']`, "g");

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const pos = match.index;

    let braceCount = 0;
    let objStart = pos;
    for (let i = pos - 1; i >= 0; i--) {
      if (content[i] === "}") braceCount++;
      if (content[i] === "{") {
        if (braceCount === 0) { objStart = i; break; }
        braceCount--;
      }
    }

    braceCount = 0;
    let objEnd = pos;
    for (let i = objStart; i < content.length; i++) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") {
        braceCount--;
        if (braceCount === 0) { objEnd = i; break; }
      }
    }

    const objText = content.substring(objStart, objEnd + 1);
    const idMatch = objText.match(/"?id"?\s*:\s*["']?([A-Za-z0-9_-]+)["']?/);
    const nameMatch = objText.match(/"?name"?\s*:\s*["']([^"']+)["']/);
    const setMatch = objText.match(/"?set"?\s*:\s*(\[[^\]]+\])/);

    if (!idMatch || !nameMatch) continue;

    let setArray = [];
    if (setMatch) {
      try { setArray = eval("(" + setMatch[1] + ")"); } catch (e) {}
    }
    if (!Array.isArray(setArray)) setArray = [setArray];

    if (targetSetIds && targetSetIds.length > 0) {
      if (!setArray.some((s) => targetSetIds.includes(s))) continue;
    }

    if (!nameMatch[1].endsWith("Starship")) continue;

    results.push({
      id: idMatch[1],
      set: setArray,
      filePath,
      fileName: "ships.js",
      objStart,
      objEnd,
      objText,
    });
  }

  return results;
}

// Find card by name, optionally filtered by a list of valid set IDs.
// If targetSetIds is non-empty, only return cards whose set array overlaps.
function findCard(cardName, fileNames, targetSetIds) {
  const results = [];

  for (const fileName of fileNames) {
    const filePath = path.join(DATA_DIR, fileName);
    const matches = findCardsInFile(filePath, cardName);

    for (const match of matches) {
      if (targetSetIds && targetSetIds.length > 0) {
        const overlaps = match.set.some((s) => targetSetIds.includes(s));
        if (!overlaps) continue;
      }

      results.push({
        id: match.id,
        filePath: filePath,
        fileName: fileName,
        set: match.set,
        objStart: match.objStart,
        objEnd: match.objEnd,
        objText: match.objText,
      });
    }
  }

  return results;
}

// Pick best card: prefer cards whose set matches targetSetIds; fallback to lowest numeric ID
function pickCard(results) {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // Sort by numeric suffix of ID (lowest first = oldest card = the one being replaced)
  results.sort((a, b) => {
    const aNum = parseInt(a.id.match(/\d+$/)?.[0] || "Infinity", 10);
    const bNum = parseInt(b.id.match(/\d+$/)?.[0] || "Infinity", 10);
    return aNum - bNum;
  });

  return results[0];
}

// Look up set names for an array of set IDs
function setNames(setIds, sets) {
  if (!setIds || setIds.length === 0) return "(no set)";
  return setIds
    .map((id) => {
      const found = sets.find((s) => s.id === id);
      return found ? `${found.name} [${id}]` : id;
    })
    .join(", ");
}

// Update card in file
function updateCardInFile(result) {
  const { filePath, objStart, objEnd, objText } = result;
  const content = fs.readFileSync(filePath, "utf8");

  if (objText.includes("opBanned")) {
    return false; // Already banned
  }

  const lastBraceIndex = objText.lastIndexOf("}");
  if (lastBraceIndex === -1) return false;

  const beforeBrace = objText.substring(0, lastBraceIndex).trimEnd();
  const newObjText =
    beforeBrace +
    (beforeBrace.endsWith(",") ? "" : ",") +
    "\n\topBanned: true\n\t" +
    objText.substring(lastBraceIndex);

  const newContent = content.substring(0, objStart) + newObjText + content.substring(objEnd + 1);
  fs.writeFileSync(filePath, newContent, "utf8");

  return true;
}

// Main execution
async function main() {
  if (DRY_RUN) {
    console.log("🔍 DRY RUN — no files will be modified. Pass --write to apply changes.\n");
  }
  console.log("🔍 Reading errata CSV and sets...\n");
  const cardEntries = parseCSV(CSV_FILE);
  const sets = loadSets();

  console.log(`Found ${cardEntries.length} errata entries\n`);

  let foundCount = 0;
  let notFoundCount = 0;
  let alreadyBannedCount = 0;
  const notFound = [];
  const alreadyBanned = [];

  for (const entry of cardEntries) {
    const { name: cardName, wave } = entry;

    // Resolve all set IDs that belong to this wave reference
    const targetSetIds = findSetIdsForWave(wave, sets);
    if (targetSetIds.length === 0) {
      console.warn(`  ⚠️  Could not map wave "${wave}" to any set ID for "${cardName}"`);
    }

    // Search in main files, then fallback files
    let results = findCard(cardName, MAIN_FILES, targetSetIds);
    if (results.length === 0) {
      results = findCard(cardName, FALLBACK_FILES, targetSetIds);
    }

    // If nothing found via set filter, try spelling variations with same set filter
    if (results.length === 0 && spellingVariations[cardName]) {
      for (const variation of spellingVariations[cardName]) {
        results = findCard(variation, MAIN_FILES, targetSetIds);
        if (results.length > 0) break;
        results = findCard(variation, FALLBACK_FILES, targetSetIds);
        if (results.length > 0) break;
      }
    }

    // Last resort: try without set filter (name only) + spelling variations
    if (results.length === 0) {
      results = findCard(cardName, MAIN_FILES, []);
      if (results.length === 0) results = findCard(cardName, FALLBACK_FILES, []);
      if (results.length === 0 && spellingVariations[cardName]) {
        for (const variation of spellingVariations[cardName]) {
          results = findCard(variation, MAIN_FILES, []);
          if (results.length > 0) break;
          results = findCard(variation, FALLBACK_FILES, []);
          if (results.length > 0) break;
        }
      }
      if (results.length > 0) {
        console.warn(`  ⚠️  "${cardName}" not found in wave sets [${targetSetIds.join(", ")}] — falling back to name-only match`);
      }
    }

    // Fallback: treat name as a ship class, find ships whose name ends in "Starship"
    if (results.length === 0) {
      const byClass = findShipsByClass(cardName, targetSetIds);
      if (byClass.length === 1) {
        console.warn(`  ⚠️  "${cardName}" matched as ship class — using ship "${byClass[0].id}" (${setNames(byClass[0].set, sets)})`);
        results = byClass;
      } else if (byClass.length === 0) {
        console.log(`✗ "${cardName}" (wave: ${wave}) — no ship found with this class and a name ending in "Starship"`);
        notFound.push({ name: cardName, wave });
        notFoundCount++;
        continue;
      } else {
        const ids = byClass.map((r) => r.id).join(", ");
        console.log(`✗ "${cardName}" (wave: ${wave}) — ambiguous: ${byClass.length} ships match class with "Starship" name: ${ids}`);
        notFound.push({ name: cardName, wave });
        notFoundCount++;
        continue;
      }
    }

    if (results.length === 0) {
      console.log(`✗ "${cardName}" (wave: ${wave}) - NOT FOUND`);
      notFound.push({ name: cardName, wave });
      notFoundCount++;
      continue;
    }

    const chosen = pickCard(results);

    const chosenSetName = setNames(chosen.set, sets);
    const othersStr = results.length > 1
      ? ` (chosen over ${results.filter((r) => r.id !== chosen.id).map((r) => r.id).join(", ")})`
      : "";
    const baseMsg = `"${cardName}" (id: ${chosen.id}${othersStr}) in ${chosen.fileName} — set: ${chosenSetName}`;

    let success;
    if (DRY_RUN) {
      success = !chosen.objText.includes("opBanned");
    } else {
      success = updateCardInFile(chosen);
    }

    if (success) {
      console.log(`✓ ${baseMsg}`);
      foundCount++;
    } else {
      console.log(`✗ ${baseMsg} — already has opBanned`);
      alreadyBannedCount++;
      alreadyBanned.push({ name: cardName, wave });
    }
  }

  const action = DRY_RUN ? "would be marked as banned" : "marked as banned";
  console.log(
    `\n✅ Complete: ${foundCount} cards ${action}, ${alreadyBannedCount} already banned, ${notFoundCount} not found`
  );

  if (alreadyBanned.length > 0) {
    console.log("\n📝 Cards already banned:");
    alreadyBanned.forEach(({ name, wave }) => console.log(`  - ${name} (wave: ${wave})`));
  }

  if (notFound.length > 0) {
    console.log("\n📝 Cards not found:");
    notFound.forEach(({ name, wave }) => console.log(`  - ${name} (wave: ${wave})`));
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
