const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
}

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');

if (!fs.existsSync(buildDir)) {
	throw new Error(`Build directory not found: ${buildDir}. Run "npm run build" first.`);
}

const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const rootPackageJson = readJson(rootPackageJsonPath);

const buildPackageJson = {
	name: rootPackageJson.name,
	version: rootPackageJson.version,
	private: rootPackageJson.private,
	description: rootPackageJson.description,
	type: rootPackageJson.type,
	main: 'src/main.js',
	engines: rootPackageJson.engines,
	dependencies: rootPackageJson.dependencies,
	scripts: {
		start: 'node src/main.js',
	},
};

writeJson(path.join(buildDir, 'package.json'), buildPackageJson);

