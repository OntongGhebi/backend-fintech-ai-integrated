const fs = require('node:fs');
const path = require('node:path');

const candidates = [
  path.resolve(__dirname, '..', 'dist', 'main.js'),
  path.resolve(__dirname, '..', 'dist', 'src', 'main.js'),
];

const entryPoint = candidates.find((candidate) => fs.existsSync(candidate));

if (!entryPoint) {
  console.error('Production entry point not found. Run "npm run build" first.');
  process.exit(1);
}

require(entryPoint);
