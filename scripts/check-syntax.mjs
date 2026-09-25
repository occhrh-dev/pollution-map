import fs from 'node:fs';
import vm from 'node:vm';

const htmlFiles = fs.readdirSync('.').filter(file => file.endsWith('.html') && file !== 'index.backup.html');
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`${file}: duplicate id ${[...new Set(duplicateIds)].join(', ')}`);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    if (match[1].trim()) new vm.Script(match[1], { filename: `${file}:inline-${index + 1}` });
  });
}

const sourceFiles = [
  ...fs.readdirSync('.').filter(file => file.endsWith('.js')),
  ...fs.readdirSync('apps-script').filter(file => file.endsWith('.gs')).map(file => `apps-script/${file}`)
];
for (const file of sourceFiles) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
console.log(`Syntax OK: ${htmlFiles.length} HTML pages and ${sourceFiles.length} JavaScript/Apps Script files`);
