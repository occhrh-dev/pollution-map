// Pollution Map backup health monitor.
// Sends email alerts to both SYSTEM OWNER and the backup execution account.
// Health is based on the latest scheduled CHECK, not the age of the last Drive copy,
// because an unchanged registry can legitimately skip creating a new backup file.

const BACKUP_HEALTH_TRIGGER_HANDLER = 'checkBackupHealth';
const BACKUP_HEALTH_TRIGGER_HOUR = 4;
const BACKUP_STALE_HOURS = 24;
const BACKUP_ALERT_REPEAT_HOURS = 24;
const BACKUP_FAILURE_REPEAT_HOURS = 6;

function runBackupAlertSetup() {
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (email !== BACKUP_EXECUTION_EMAIL) {
    throw new Error('กรุณารันการติดตั้ง Backup Alert ด้วยบัญชี ' + BACKUP_EXECUTION_EMAIL);
  }
  installBackupHealthTrigger();
  const health = checkBackupHealth();
  return {
    installed: true,
    recipients: backupAlertRecipients_(),
    schedule: 'ทุกวันช่วง 04:00-05:00 Asia/Bangkok',
    staleAfterHours: BACKUP_STALE_HOURS,
    health: health
  };
}

function verifyBackupAlertSetup() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_HEALTH_TRIGGER_HANDLER;
  });
  const health = backupHealthSnapshot_();
  const result = {
    triggerInstalled: triggers.length === 1,
    triggerCount: triggers.length,
    recipients: backupAlertRecipients_(),
    healthStatus: health.status,
    ageHours: health.ageHours,
    backupAgeHours: health.backupAgeHours,
    lastCheckAt: health.lastCheckAt,
    lastCheckResult: health.lastCheckResult,
    lastSuccessAt: health.lastSuccessAt,
    lastErrorAt: health.lastErrorAt,
    lastAlertAt: health.lastAlertAt,
    staleAfterHours: BACKUP_STALE_HOURS
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function installBackupHealthTrigger() {
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (email !== BACKUP_EXECUTION_EMAIL) {
    throw new Error('กรุณารันการติดตั้ง Health Trigger ด้วยบัญชี ' + BACKUP_EXECUTION_EMAIL);
  }
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_HEALTH_TRIGGER_HANDLER;
  }).forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger(BACKUP_HEALTH_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(BACKUP_HEALTH_TRIGGER_HOUR)
    .inTimezone('Asia/Bangkok')
    .create();

  return 'ติดตั้ง Backup Health Trigger แล้ว: ทุกวันช่วง 04:00-05:00 Asia/Bangkok';
}

function removeBackupHealthTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_HEALTH_TRIGGER_HANDLER;
  }).forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  return 'ลบ Backup Health Trigger แล้ว';
}

function checkBackupHealth() {
  const health = backupHealthSnapshot_();
  const props = PropertiesService.getScriptProperties();

  if (health.status === 'HEALTHY') {
    markBackupHealthy_('HEALTH_CHECK');
    return health;
  }

  const lastAlertAt = parseDateMs_(props.getProperty('BACKUP_LAST_ALERT_AT'));
  const repeatMs = BACKUP_ALERT_REPEAT_HOURS * 60 * 60 * 1000;
  const shouldAlert = !lastAlertAt || Date.now() - lastAlertAt >= repeatMs || props.getProperty('BACKUP_ALERT_STATE') !== health.status;

  props.setProperty('BACKUP_ALERT_STATE', health.status);
  if (shouldAlert) {
    const subject = health.status === 'FAILED'
      ? '[Pollution Map] Backup ล่าสุดล้มเหลว'
      : '[Pollution Map] ระบบไม่ได้ตรวจ Backup เกิน ' + BACKUP_STALE_HOURS + ' ชั่วโมง';
    const details = health.status === 'FAILED'
      ? 'การตรวจ Backup ล่าสุดล้มเหลว\nผลการตรวจล่าสุด: ' + (health.lastCheckResult || 'FAILED') + '\nข้อผิดพลาดล่าสุด: ' + (health.lastError || 'ไม่ระบุ')
      : 'ไม่พบการตรวจ Backup ตามรอบเวลาที่กำหนด\nอายุการตรวจล่าสุด: ' + (health.ageHours === null ? 'ไม่พบข้อมูล' : health.ageHours.toFixed(1) + ' ชั่วโมง');
    sendBackupAlert_(subject, details, health.status);
  }
  return health;
}

function notifyBackupFailure_(error, mode) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const lastAlertAt = parseDateMs_(props.getProperty('BACKUP_LAST_ALERT_AT'));
  const previousState = props.getProperty('BACKUP_ALERT_STATE') || '';
  const repeatMs = BACKUP_FAILURE_REPEAT_HOURS * 60 * 60 * 1000;
  props.setProperty('BACKUP_ALERT_STATE', 'FAILED');

  if (previousState !== 'FAILED' || !lastAlertAt || now - lastAlertAt >= repeatMs) {
    const message = 'การสร้าง/ตรวจ Backup ไม่สำเร็จ\nโหมด: ' + String(mode || 'UNKNOWN') + '\nข้อผิดพลาด: ' + String(error && error.message || error);
    sendBackupAlert_('[Pollution Map] Backup ล้มเหลว', message, 'FAILED');
  }
}

function markBackupHealthy_(source) {
  const props = PropertiesService.getScriptProperties();
  const previousState = props.getProperty('BACKUP_ALERT_STATE') || '';
  props.setProperty('BACKUP_ALERT_STATE', 'HEALTHY');

  if (previousState && previousState !== 'HEALTHY') {
    try {
      MailApp.sendEmail({
        to: backupAlertRecipients_(),
        subject: '[Pollution Map] Backup กลับมาทำงานปกติแล้ว',
        body: 'ระบบ Backup กลับมาทำงานปกติแล้ว\nแหล่งตรวจสอบ: ' + String(source || 'BACKUP') + '\nผลการตรวจล่าสุด: ' + (props.getProperty('BACKUP_LAST_CHECK_RESULT') || 'ไม่ระบุ') + '\nBackup ล่าสุด: ' + (props.getProperty('BACKUP_LAST_FILE_NAME') || 'ไม่ระบุ'),
        name: 'Pollution Map Backup Monitor'
      });
      appendAudit_(BACKUP_EXECUTION_EMAIL, '', 'SYSTEM_BACKUP_ALERT', 'BACKUP', '', 'RECOVERED', String(source || 'BACKUP'));
    } catch (error) {
      try { appendAudit_(BACKUP_EXECUTION_EMAIL, '', 'SYSTEM_BACKUP_ALERT', 'BACKUP', '', 'EMAIL_FAILED', String(error && error.message || error)); } catch (auditError) {}
    }
  }
}

function backupHealthSnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const successText = props.getProperty('BACKUP_LAST_SUCCESS_AT') || '';
  const errorText = props.getProperty('BACKUP_LAST_ERROR_AT') || '';
  const checkText = props.getProperty('BACKUP_LAST_CHECK_AT') || successText;
  const checkResult = props.getProperty('BACKUP_LAST_CHECK_RESULT') || (successText ? 'BACKED_UP' : '');
  const successMs = parseDateMs_(successText);
  const errorMs = parseDateMs_(errorText);
  const checkMs = parseDateMs_(checkText);
  const ageHours = checkMs ? (now - checkMs) / (60 * 60 * 1000) : null;
  const backupAgeHours = successMs ? (now - successMs) / (60 * 60 * 1000) : null;

  let status = 'HEALTHY';
  if (checkResult === 'FAILED' || (errorMs && (!checkMs || errorMs >= checkMs))) status = 'FAILED';
  else if (!checkMs || ageHours > BACKUP_STALE_HOURS) status = 'STALE';

  return {
    status: status,
    ageHours: ageHours,
    backupAgeHours: backupAgeHours,
    lastCheckAt: checkText,
    lastCheckResult: checkResult,
    lastSuccessAt: successText,
    lastFileId: props.getProperty('BACKUP_LAST_FILE_ID') || '',
    lastFileName: props.getProperty('BACKUP_LAST_FILE_NAME') || '',
    lastErrorAt: errorText,
    lastError: props.getProperty('BACKUP_LAST_ERROR') || '',
    lastAlertAt: props.getProperty('BACKUP_LAST_ALERT_AT') || ''
  };
}

function sendBackupAlert_(subject, details, state) {
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  try {
    MailApp.sendEmail({
      to: backupAlertRecipients_(),
      subject: subject,
      body: details + '\n\nเวลาตรวจสอบ: ' + Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss') + '\nผู้รับแจ้งเตือน: ' + backupAlertRecipients_(),
      name: 'Pollution Map Backup Monitor'
    });
    props.setProperty('BACKUP_LAST_ALERT_AT', now.toISOString());
    props.setProperty('BACKUP_ALERT_STATE', String(state || 'ALERT'));
    appendAudit_(BACKUP_EXECUTION_EMAIL, '', 'SYSTEM_BACKUP_ALERT', 'BACKUP', '', 'SENT', String(state || 'ALERT'));
  } catch (error) {
    try { appendAudit_(BACKUP_EXECUTION_EMAIL, '', 'SYSTEM_BACKUP_ALERT', 'BACKUP', '', 'EMAIL_FAILED', String(error && error.message || error)); } catch (auditError) {}
  }
}

function backupAlertRecipients_() {
  return [BACKUP_OWNER_EMAIL, BACKUP_EXECUTION_EMAIL].filter(function(email, index, list) {
    return email && list.indexOf(email) === index;
  }).join(',');
}

function parseDateMs_(value) {
  const ms = Date.parse(String(value || ''));
  return isNaN(ms) ? 0 : ms;
}
