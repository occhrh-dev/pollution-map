const fs = require('node:fs');
const assert = require('node:assert/strict');

const backup = fs.readFileSync('apps-script/Backup.gs','utf8');
const alerts = fs.readFileSync('apps-script/BackupAlerts.gs','utf8');

new Function(backup);
new Function(alerts);

assert.match(alerts, /const BACKUP_STALE_HOURS = 24/);
assert.match(alerts, /const BACKUP_HEALTH_TRIGGER_HOUR = 4/);
assert.match(alerts, /MailApp\.sendEmail/);
assert.match(alerts, /BACKUP_OWNER_EMAIL/);
assert.match(alerts, /BACKUP_EXECUTION_EMAIL/);
assert.match(alerts, /function checkBackupHealth\(/);
assert.match(alerts, /function notifyBackupFailure_\(/);
assert.match(alerts, /function markBackupHealthy_\(/);
assert.match(backup, /notifyBackupFailure_\(error, mode\)/);
assert.match(backup, /markBackupHealthy_\(String\(mode \|\| 'BACKUP'\)\)/);
assert.ok(!/function\s+.*restore/i.test(backup + '\n' + alerts), 'Automatic restore function must not be introduced');

console.log('Backup alert regression checks passed.');
