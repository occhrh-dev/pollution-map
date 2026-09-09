const fs=require('node:fs');
const assert=require('node:assert/strict');
const backup=fs.readFileSync('apps-script/Backup.gs','utf8');
const alerts=fs.readFileSync('apps-script/BackupAlerts.gs','utf8');

assert.ok(backup.includes("skipIfUnchanged:true"),'daily backup must be change-aware');
assert.ok(backup.includes("SKIPPED_NO_CHANGE"),'must record no-change skips');
assert.ok(backup.includes("name === 'AUDIT_LOG'"),'audit log must be excluded from fingerprint');
assert.ok(backup.includes("header === 'last_login_at'"),'volatile last_login_at must be excluded');
assert.ok(backup.includes("Utilities.DigestAlgorithm.SHA_256"),'fingerprint must use SHA-256');
assert.ok(backup.includes("skipIfUnchanged:false"),'manual/setup backup must remain forceable');
assert.ok(alerts.includes("BACKUP_LAST_CHECK_AT"),'health must use latest backup check');
assert.ok(alerts.includes("BACKUP_LAST_CHECK_RESULT"),'health must understand skipped no-change checks');
assert.ok(alerts.includes("backupAgeHours"),'status must preserve real backup age separately');
assert.ok(!/function\s+restore/i.test(backup+alerts),'must not add automatic restore');

console.log('Change-aware backup regression checks passed.');
