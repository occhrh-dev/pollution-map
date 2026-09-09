import fs from 'node:fs';
import vm from 'node:vm';

const htmlFiles = ['index.html', 'login.html', 'admin.html', 'reset-password.html'];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    if (match[1].trim()) new vm.Script(match[1], { filename: `${file}:inline-${index + 1}` });
  });
}

new vm.Script(fs.readFileSync('auth-client.js', 'utf8'), { filename: 'auth-client.js' });
new vm.Script(fs.readFileSync('config.js', 'utf8'), { filename: 'config.js' });
new vm.Script(fs.readFileSync('apps-script/Code.gs', 'utf8'), { filename: 'apps-script/Code.gs' });
console.log('Syntax OK: HTML inline scripts, auth client, config, and Apps Script');
