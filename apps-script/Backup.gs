// Pollution Map central registry backup service.
// This file is intended to live in the SAME Apps Script project as Code.gs.
// Automatic backups are created by the Apps Script execution account.

const BACKUP_FOLDER_ID = '1xkf1K0S-zaB4Xr_IXqeblWzdDR_jU3Ow';
const BACKUP_RETENTION_DAYS = 30;
const BACKUP_OWNER_EMAIL = 'choksayam.kleaw@gmail.com';
const BACKUP_TRIGGER_HOUR = 2;
const BACKUP_TRIGGER_HANDLER = 'createDailyBackup';

function createDailyBackup() {
  return createRegistryBackup_('DAILY', 'scheduler');
}

function createManualBackupForOwner_(actorEmail) {
  const actor = normalizeEmail_(actorEmail);
  if (!actor || actor !== systemOwnerEmail_()) {
    throw apiError_('เฉพาะ SYSTEM OWNER เท่านั้นที่สร้าง Backup ด้วยตนเองได้', 'ACCESS_DENIED');
  }
  return createRegistryBackup_('MANUAL', actor);
}

function getBackupStatusForOwner_(actorEmail) {
  const actor = normalizeEmail_(actorEmail);
  if (!actor || actor !== systemOwnerEmail_()) {
    throw apiError_('เฉพาะ SYSTEM OWNER เท่านั้นที่ดูสถานะ Backup ได้', 'ACCESS_DENIED');
  }
  const props = PropertiesService.getScriptProperties();
  return {
    lastSuccessAt: props.getProperty('BACKUP_LAST_SUCCESS_AT') || '',
    lastFileId: props.getProperty('BACKUP_LAST_FILE_ID') || '',
    lastFileName: props.getProperty('BACKUP_LAST_FILE_NAME') || '',
    lastMode: props.getProperty('BACKUP_LAST_MODE') || '',
    lastErrorAt: props.getProperty('BACKUP_LAST_ERROR_AT') || '',
    lastError: props.getProperty('BACKUP_LAST_ERROR') || '',
    retentionDays: BACKUP_RETENTION_DAYS,
    triggerHour: BACKUP_TRIGGER_HOUR,
    folderId: BACKUP_FOLDER_ID
  };
}

function createRegistryBackup_(mode, actorEmail) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const props = PropertiesService.getScriptProperties();
    try {
      const source = DriveApp.getFileById(SPREADSHEET_ID);
      const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
      const stamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd_HHmmss');
      const fileName = 'Pollution Map Registry Backup_' + stamp + '_' + mode;
      const copy = source.makeCopy(fileName, folder);

      // Make sure the SYSTEM OWNER can access the backup even though the Apps Script
      // execution account owns the folder/file. Repeated addEditor calls are safe.
      try { folder.addEditor(BACKUP_OWNER_EMAIL); } catch (shareError) {}
      try { copy.addEditor(BACKUP_OWNER_EMAIL); } catch (shareError2) {}

      props.setProperty('BACKUP_LAST_SUCCESS_AT', now.toISOString());
      props.setProperty('BACKUP_LAST_FILE_ID', copy.getId());
      props.setProperty('BACKUP_LAST_FILE_NAME', copy.getName());
      props.setProperty('BACKUP_LAST_MODE', String(mode || 'UNKNOWN'));
      props.deleteProperty('BACKUP_LAST_ERROR');
      props.deleteProperty('BACKUP_LAST_ERROR_AT');

      cleanupOldBackups_();
      appendAudit_(normalizeEmail_(actorEmail || 'scheduler'), '', 'SYSTEM_BACKUP_CREATE', 'BACKUP', copy.getId(), 'SUCCESS', copy.getName());
      return {id: copy.getId(), name: copy.getName(), createdAt: now.toISOString(), mode: mode};
    } catch (error) {
      props.setProperty('BACKUP_LAST_ERROR_AT', now.toISOString());
      props.setProperty('BACKUP_LAST_ERROR', String(error && error.message || error));
      try { appendAudit_(normalizeEmail_(actorEmail || 'scheduler'), '', 'SYSTEM_BACKUP_CREATE', 'BACKUP', '', 'FAILED', String(error && error.message || error)); } catch (auditError) {}
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
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
  if (email !== 'occ.hrh@gmail.com') {
    throw new Error('กรุณารันการติดตั้ง Trigger ด้วยบัญชี occ.hrh@gmail.com');
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
