# Pollution Map — Central Registry Backup Setup

## What this adds

- Copies the entire central Google Sheet into `Pollution Map Backups`.
- Automatic backup every day during the 02:00–03:00 Asia/Bangkok window.
- Retains backup files for 30 days; older matching backup copies are moved to Trash.
- Shares the backup folder and generated backup files with `choksayam.kleaw@gmail.com`.
- Adds an owner-only **สำรองข้อมูล** tab in System Admin with a **สร้าง Backup ตอนนี้** button.
- Backup creation is recorded in `AUDIT_LOG`.
- There is intentionally no automatic restore function.

## Accounts

- Apps Script / scheduled execution account: `occ.hrh@gmail.com`
- SYSTEM OWNER: `choksayam.kleaw@gmail.com`

## Backup folder

Folder ID:

`1xkf1K0S-zaB4Xr_IXqeblWzdDR_jU3Ow`

The folder was created under the connected `occ.hrh@gmail.com` Google Drive account.

## Deploy the backend

1. Open the existing Google Apps Script project currently serving Pollution Map.
2. Replace the existing `Code.gs` contents with the complete `apps-script/Code.gs` from this branch/PR.
3. Add a **new script file** named `Backup.gs` in the same Apps Script project.
4. Copy the complete contents of `apps-script/Backup.gs` from this branch/PR into that file.
5. Save the project.
6. Deploy → Manage deployments → Edit the existing deployment → New version → Deploy.
7. Preserve the existing `/exec` URL and the existing `GOOGLE_CLIENT_ID` Script Property.

## Install the scheduled backup once

Run this only while signed into the Apps Script editor as `occ.hrh@gmail.com`.

1. Select the function `runBackupSetup` from the function selector.
2. Click **Run**.
3. Approve the requested Google Drive / Apps Script permissions when prompted.
4. The setup function will:
   - share the backup folder with the SYSTEM OWNER,
   - replace any previous backup trigger for `createDailyBackup`,
   - install one daily trigger for the 02:00 hour in `Asia/Bangkok`,
   - create the first backup immediately.

## Verify setup

Select and run `verifyBackupSetup` in Apps Script.

Expected values include:

- `triggerInstalled: true`
- `triggerCount: 1`
- `retentionDays: 30`
- a non-empty `lastSuccessAt`
- a non-empty `lastFileId`
- a non-empty `lastFileName`

Also open the `Pollution Map Backups` Drive folder and confirm the first copied spreadsheet exists.

## Verify the web UI

After merging the PR and GitHub Pages updates:

1. Sign in as `choksayam.kleaw@gmail.com`.
2. Open System Admin.
3. Confirm the **สำรองข้อมูล** tab is visible.
4. Open it and confirm the last backup status is shown.
5. Click **สร้าง Backup ตอนนี้** and confirm a new backup appears in the Drive folder and an audit entry is added.
6. Sign in as `occ.hrh@gmail.com` and confirm the **สำรองข้อมูล** tab is hidden. The backend also rejects backup API calls from the backup system admin.

## Recovery policy

Backups are automatic; restore is manual only. If recovery is needed, inspect the selected backup copy first and explicitly decide which sheets/rows should be restored. Never overwrite the live registry automatically.
