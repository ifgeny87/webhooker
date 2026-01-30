'use strict';
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

function fixFile(filePath) {
	let content = fs.readFileSync(filePath, 'utf-8');
	content = content.replace(
		/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
		(_, prefix, specifier, suffix) =>
			specifier.endsWith('.js')
				? prefix + specifier + suffix
				: prefix + specifier + '.js' + suffix,
	);
	fs.writeFileSync(filePath, content, 'utf-8');
}

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full);
		else if (e.name.endsWith('.js')) fixFile(full);
	}
}

if (fs.existsSync(buildDir)) walk(buildDir);
