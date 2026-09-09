// Pollution Map central registry backup service.
// Add this file to the SAME Apps Script project as Code.gs.
// Scheduled backups are change-aware: if meaningful registry data has not changed,
// no duplicate Drive copy is created. There is intentionally NO automatic restore.

const BACKUP_FOLDER_ID = '1xkf1K0S-zaB4Xr_IXqeblWzdDR_jU3Ow';
const BACKUP_RETENTION_DAYS = 30;
const BACKUP_OWNER_EMAIL = 'choksayam.kleaw@gmail.com';
const BACKUP_EXECUTION_EMAIL = 'occ.hrh@gmail.com';
const BACKUP_TRIGGER_HOUR = 2;
const BACKUP_TRIGGER_HANDLER = 'createDailyBackup';
const BACKUP_FINGERPRINT_PROPERTY = 'BACKUP_LAST_FINGERPRINT';
const BACKUP_LAST_CHECK_AT_PROPERTY = 'BACKUP_LAST_CHECK_AT';
const BACKUP_LAST_CHECK_RESULT_PROPERTY = 'BACKUP_LAST_CHECK_RESULT';

function createDailyBackup() {
  return createRegistryBackup_('DAILY', 'scheduler', {skipIfUnchanged:true});
}

function runBackupSetup() {
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (email !== BACKUP_EXECUTION_EMAIL) {
    throw new Error('กรุณารันการติดตั้ง Backup ด้วยบัญชี ' + BACKUP_EXECUTION_EMAIL);
  }
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  folder.addEditor(BACKUP_OWNER_EMAIL);
  installDailyBackupTrigger();
  if (typeof installBackupHealthTrigger === 'function') installBackupHealthTrigger();
  const firstBackup = createRegistryBackup_('SETUP', email, {skipIfUnchanged:false});
  return {
    installed: true,
    folderId: BACKUP_FOLDER_ID,
    sharedWith: BACKUP_OWNER_EMAIL,
    schedule: 'ทุกวันช่วง 02:00-03:00 Asia/Bangkok',
    healthSchedule: 'ทุกวันช่วง 04:00-05:00 Asia/Bangkok',
    firstBackup: firstBackup
  };
}

function verifyBackupSetup() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_TRIGGER_HANDLER;
  });
  const props = PropertiesService.getScriptProperties();
  const health = typeof backupHealthSnapshot_ === 'function' ? backupHealthSnapshot_() : null;
  return {
    triggerInstalled: triggers.length === 1,
    triggerCount: triggers.length,
    folderId: BACKUP_FOLDER_ID,
    retentionDays: BACKUP_RETENTION_DAYS,
    lastSuccessAt: props.getProperty('BACKUP_LAST_SUCCESS_AT') || '',
    lastFileId: props.getProperty('BACKUP_LAST_FILE_ID') || '',
    lastFileName: props.getProperty('BACKUP_LAST_FILE_NAME') || '',
    lastMode: props.getProperty('BACKUP_LAST_MODE') || '',
    lastCheckAt: props.getProperty(BACKUP_LAST_CHECK_AT_PROPERTY) || '',
    lastCheckResult: props.getProperty(BACKUP_LAST_CHECK_RESULT_PROPERTY) || '',
    lastErrorAt: props.getProperty('BACKUP_LAST_ERROR_AT') || '',
    lastError: props.getProperty('BACKUP_LAST_ERROR') || '',
    healthStatus: health ? health.status : '',
    ageHours: health ? health.ageHours : null,
    backupAgeHours: health ? health.backupAgeHours : null,
    lastAlertAt: health ? health.lastAlertAt : ''
  };
}

function createManualBackupForOwner_(actorEmail) {
  const actor = normalizeEmail_(actorEmail);
  if (!actor || actor !== systemOwnerEmail_()) {
    throw apiError_('เฉพาะ SYSTEM OWNER เท่านั้นที่สร้าง Backup ด้วยตนเองได้', 'ACCESS_DENIED');
  }
  // An explicit owner request always creates a copy, even when data is unchanged.
  return createRegistryBackup_('MANUAL', actor, {skipIfUnchanged:false});
}

function getBackupStatusForOwner_(actorEmail) {
  const actor = normalizeEmail_(actorEmail);
  if (!actor || actor !== systemOwnerEmail_()) {
    throw apiError_('เฉพาะ SYSTEM OWNER เท่านั้นที่ดูสถานะ Backup ได้', 'ACCESS_DENIED');
  }
  const props = PropertiesService.getScriptProperties();
  const health = typeof backupHealthSnapshot_ === 'function' ? backupHealthSnapshot_() : null;
  return {
    lastSuccessAt: props.getProperty('BACKUP_LAST_SUCCESS_AT') || '',
    lastFileId: props.getProperty('BACKUP_LAST_FILE_ID') || '',
    lastFileName: props.getProperty('BACKUP_LAST_FILE_NAME') || '',
    lastMode: props.getProperty('BACKUP_LAST_MODE') || '',
    lastCheckAt: props.getProperty(BACKUP_LAST_CHECK_AT_PROPERTY) || '',
    lastCheckResult: props.getProperty(BACKUP_LAST_CHECK_RESULT_PROPERTY) || '',
    lastErrorAt: props.getProperty('BACKUP_LAST_ERROR_AT') || '',
    lastError: props.getProperty('BACKUP_LAST_ERROR') || '',
    retentionDays: BACKUP_RETENTION_DAYS,
    triggerHour: BACKUP_TRIGGER_HOUR,
    folderId: BACKUP_FOLDER_ID,
    healthStatus: health ? health.status : '',
    ageHours: health ? health.ageHours : null,
    backupAgeHours: health ? health.backupAgeHours : null,
    lastAlertAt: health ? health.lastAlertAt : '',
    alertRecipients: typeof backupAlertRecipients_ === 'function' ? backupAlertRecipients_() : ''
  };
}

function createRegistryBackup_(mode, actorEmail, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const props = PropertiesService.getScriptProperties();
    const opts = options || {};
    try {
      const fingerprint = registryFingerprint_();
      const previousFingerprint = props.getProperty(BACKUP_FINGERPRINT_PROPERTY) || '';

      props.setProperty(BACKUP_LAST_CHECK_AT_PROPERTY, now.toISOString());

      if (opts.skipIfUnchanged && previousFingerprint && fingerprint === previousFingerprint) {
        props.setProperty(BACKUP_LAST_CHECK_RESULT_PROPERTY, 'SKIPPED_NO_CHANGE');
        props.deleteProperty('BACKUP_LAST_ERROR');
        props.deleteProperty('BACKUP_LAST_ERROR_AT');
        appendAudit_(normalizeEmail_(actorEmail || 'scheduler'), '', 'SYSTEM_BACKUP_CHECK', 'BACKUP', '', 'SKIPPED_NO_CHANGE', 'ข้อมูลทะเบียนกลางไม่เปลี่ยนแปลง');
        if (typeof markBackupHealthy_ === 'function') markBackupHealthy_('NO_CHANGE');
        cleanupOldBackups_();
        return {
          skipped: true,
          reason: 'NO_CHANGE',
          checkedAt: now.toISOString(),
          mode: mode,
          lastFileId: props.getProperty('BACKUP_LAST_FILE_ID') || '',
          lastFileName: props.getProperty('BACKUP_LAST_FILE_NAME') || ''
        };
      }

      const source = DriveApp.getFileById(SPREADSHEET_ID);
      const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
      const stamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd_HHmmss');
      const fileName = 'Pollution Map Registry Backup_' + stamp + '_' + String(mode || 'UNKNOWN');
      const copy = source.makeCopy(fileName, folder);

      // The Apps Script execution account owns the backup. Keep the SYSTEM OWNER
      // as an editor of both the folder and each generated copy.
      folder.addEditor(BACKUP_OWNER_EMAIL);
      copy.addEditor(BACKUP_OWNER_EMAIL);

      props.setProperty(BACKUP_FINGERPRINT_PROPERTY, fingerprint);
      props.setProperty(BACKUP_LAST_CHECK_RESULT_PROPERTY, 'BACKED_UP');
      props.setProperty('BACKUP_LAST_SUCCESS_AT', now.toISOString());
      props.setProperty('BACKUP_LAST_FILE_ID', copy.getId());
      props.setProperty('BACKUP_LAST_FILE_NAME', copy.getName());
      props.setProperty('BACKUP_LAST_MODE', String(mode || 'UNKNOWN'));
      props.deleteProperty('BACKUP_LAST_ERROR');
      props.deleteProperty('BACKUP_LAST_ERROR_AT');

      cleanupOldBackups_();
      appendAudit_(normalizeEmail_(actorEmail || 'scheduler'), '', 'SYSTEM_BACKUP_CREATE', 'BACKUP', copy.getId(), 'SUCCESS', copy.getName());
      if (typeof markBackupHealthy_ === 'function') markBackupHealthy_(String(mode || 'BACKUP'));
      return {id: copy.getId(), name: copy.getName(), createdAt: now.toISOString(), mode: mode, skipped:false};
    } catch (error) {
      props.setProperty(BACKUP_LAST_CHECK_AT_PROPERTY, now.toISOString());
      props.setProperty(BACKUP_LAST_CHECK_RESULT_PROPERTY, 'FAILED');
      props.setProperty('BACKUP_LAST_ERROR_AT', now.toISOString());
      props.setProperty('BACKUP_LAST_ERROR', String(error && error.message || error));
      try {
        appendAudit_(normalizeEmail_(actorEmail || 'scheduler'), '', 'SYSTEM_BACKUP_CREATE', 'BACKUP', '', 'FAILED', String(error && error.message || error));
      } catch (auditError) {}
      if (typeof notifyBackupFailure_ === 'function') {
        try { notifyBackupFailure_(error, mode); } catch (alertError) {}
      }
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

// Fingerprint only meaningful registry state. AUDIT_LOG is intentionally excluded because
// login/backup audit entries would otherwise make the workbook look changed every day.
// USERS.last_login_at is also excluded because logins are operational activity, not registry data.
function registryFingerprint_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const snapshot = [];
  spreadsheet.getSheets().forEach(function(sheet) {
    const name = sheet.getName();
    if (name === 'AUDIT_LOG') return;

    const range = sheet.getDataRange();
    const values = range.getValues();
    if (!values.length) {
      snapshot.push([name, []]);
      return;
    }

    let columnIndexes = null;
    if (name === 'USERS') {
      const headers = values[0].map(function(value) { return String(value || '').trim(); });
      columnIndexes = headers.map(function(header, index) {
        return header === 'last_login_at' ? -1 : index;
      }).filter(function(index) { return index >= 0; });
    }

    const normalizedRows = values.map(function(row) {
      const sourceRow = columnIndexes ? columnIndexes.map(function(index) { return row[index]; }) : row;
      return sourceRow.map(canonicalBackupValue_);
    });
    snapshot.push([name, normalizedRows]);
  });

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(snapshot),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(value) {
    const byte = value < 0 ? value + 256 : value;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

function canonicalBackupValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  return value;
}

function cleanupOldBackups_() {
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = folder.getFiles();
  let removed = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf('Pollution Map Registry Backup_') !== 0) continue;
    if (file.getDateCreated().getTime() < cutoff) {
      file.setTrashed(true);
      removed += 1;
    }
  }
  return removed;
}

function installDailyBackupTrigger() {
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (email !== BACKUP_EXECUTION_EMAIL) {
    throw new Error('กรุณารันการติดตั้ง Trigger ด้วยบัญชี ' + BACKUP_EXECUTION_EMAIL);
  }
  const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_TRIGGER_HANDLER;
  });
  existing.forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger(BACKUP_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(BACKUP_TRIGGER_HOUR)
    .inTimezone('Asia/Bangkok')
    .create();

  DriveApp.getFolderById(BACKUP_FOLDER_ID).addEditor(BACKUP_OWNER_EMAIL);
  return 'ติดตั้ง Daily Backup Trigger แล้ว: ทุกวันช่วง 02:00-03:00 Asia/Bangkok';
}

function removeDailyBackupTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_TRIGGER_HANDLER;
  }).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  return 'ลบ Daily Backup Trigger แล้ว';
}
