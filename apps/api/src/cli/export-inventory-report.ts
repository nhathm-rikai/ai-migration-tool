// Developer/TL command: writes the JSON and XLSX report of selected programs
// from an inventory JSON made by analyze-source. It reads only that file
// (validated against source-inventory-v1); source files are never opened.
// --source-root is the folder the inventory was made from: outputs inside
// it (through aliases/junctions too) are refused before anything is written.
//
//   node apps/api/dist/cli/export-inventory-report.js --inventory <file.json>
//     --source-root <dir> --programs <ID,ID,...> --out-json <report.json>
//     --out-xlsx <report.xlsx>
import { main } from './export-inventory-report-command.js';

process.exitCode = await main(process.argv.slice(2));
