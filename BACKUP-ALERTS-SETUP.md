# Pollution Map — Backup Health Alerts

This feature adds email alerts for central registry backups.

## Behavior

- Daily registry backup: 02:00–03:00 Asia/Bangkok.
- Daily health check: 04:00–05:00 Asia/Bangkok.
- A backup is considered stale when no successful backup exists for more than 24 hours.
- A failed backup sends an alert immediately, subject to a 6-hour repeat guard.
- A stale backup sends an alert and repeats at most once every 24 hours while the incident remains unresolved.
- When backup operation recovers after FAILED/STALE state, the system sends a recovery email.
- Alert recipients:
  - SYSTEM OWNER: `choksayam.kleaw@gmail.com`
  - Backup execution account: `occ.hrh@gmail.com`
- Alerts and recovery events are appended to `AUDIT_LOG` as `SYSTEM_BACKUP_ALERT`.
- No automatic restore path is added.

## Apps Script deployment

1. In the existing Pollution Map Apps Script project, add a new script file named `BackupAlerts.gs` and paste the repository version into it.
2. Replace `Backup.gs` with the repository version from this change.
3. Save the project.
4. Deploy a new version of the existing Web App deployment and preserve the current `/exec` URL.
5. While signed into Apps Script as `occ.hrh@gmail.com`, run `runBackupAlertSetup()` once and approve Mail/trigger permissions if Google requests them.
6. Run `verifyBackupAlertSetup()`.

Expected verification:

- `triggerInstalled: true`
- `triggerCount: 1`
- `healthStatus: HEALTHY` after a recent successful backup
- recipients include both `choksayam.kleaw@gmail.com` and `occ.hrh@gmail.com`

## Safe acceptance test

Do not deliberately break the production backup just to test failure alerts. Confirm the trigger and current health with `verifyBackupAlertSetup()`. The failure path is covered by code/CI checks and will activate if a real failure occurs.
