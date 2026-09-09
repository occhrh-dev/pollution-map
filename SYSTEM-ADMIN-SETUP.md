# System and agency administration

## Access model

The central SYSTEM ADMIN identity is determined by the server, not by a browser flag or an ordinary agency role. The account must have a verified Google ID token, its email must appear in CONFIG / SYSTEM_ADMIN_EMAILS, and it must have an ACTIVE ADMIN membership in the ACTIVE agency identified by REGISTRATION_REVIEW_AGENCY_ID. The ordinary USERS role dropdown remains ADMIN, EDITOR, VIEWER. Do not add SYSTEM_ADMIN as a selectable agency role.

An AGENCY ADMIN can review existing-agency requests and manage members only in its own agency. NEW_AGENCY requests are exclusively handled by the system endpoints. System administrators can review new agencies, inspect all agency registries, manage members and suspend/re-enable agencies. The central registry agency cannot be suspended through the API. Trusted central identities cannot be demoted or disabled through ordinary member APIs or system member APIs; changes to the trusted identity registry require a separate controlled configuration process.

The browser displays separate entry points on login.html: จัดการหน่วยงาน for each agency ADMIN, and ศูนย์ผู้ดูแลระบบ only when the backend returns systemAdmin=true. The latter opens system-admin.html without a Drive authorization. The map workspace remains unchanged. Direct navigation or forged API payloads do not bypass server authorization.

## Deployment

1. Back up the current Apps Script Code.gs and record the existing deployment version and URL. Do not replace the live script before reviewing the complete changes.
2. Verify the central Sheet CONFIG contains SYSTEM_ADMIN_EMAILS = occ.hrh@gmail.com and REGISTRATION_REVIEW_AGENCY_ID = AGY-OCC-HRH. Restrict spreadsheet editor access to trusted system operators. The registry is an authorization authority, not merely reporting data.
3. Review the PR and its RBAC checks. The automated tests use mocked Google identity and Sheets services; they are not live OAuth or Apps Script integration tests.
4. Copy the complete apps-script/Code.gs from the approved commit into the original Apps Script project. Preserve GOOGLE_CLIENT_ID in Script Properties, the manifest and existing deployment configuration. Deploy > Manage deployments > Edit existing deployment > New version > Deploy. Keep the existing /exec URL.
5. Verify the new server endpoints and existing login/project workflows in a controlled test before publishing the frontend. Merge the approved PR to main and wait for GitHub Pages deployment to succeed. Refresh login.html and sign in again. If the frontend is published before the backend, new system actions will not work; do not attempt approvals in that mixed-version state.
6. Test the central account, an ordinary agency ADMIN, EDITOR/VIEWER and an unregistered Google account. Confirm the central account sees both entry points, agency ADMIN sees only its own management entry, and the other roles see neither. Confirm direct access to system-admin.html fails for non-system accounts.
7. Submit a new-agency request using a separate test Google account. Confirm only the system console sees it. Approve it and verify exactly one ACTIVE AGENCIES row, one initial ADMIN membership and APPROVED request with created_agency_id. Test duplicate submission, rejection, disabled membership, and retry behavior. Do not use a real organization's name for test data without authorization.
8. Test an existing-agency request and verify only that agency's ADMIN can approve it. Attempt cross-agency and system endpoint calls using an ordinary agency-admin token; they must fail. Verify ordinary admins cannot modify trusted central identities, and the last active agency ADMIN cannot be removed.
9. Verify existing project save/load/archive and Drive authorization still work under the correct agency and owner. Test suspended-agency access and restoration. Review AUDIT_LOG and any Apps Script execution errors. Keep the previous deployment version available for rollback.

## Operational notes

The registry uses Google Sheets, not a transactional database. New-agency provisioning uses a stable request-derived ID and a PROVISIONING state to reduce duplicate creation on retries, but real integration and failure-recovery testing remains necessary. The system does not automatically transfer Drive ownership, migrate existing projects, or provision a shared agency Drive. A new agency starts with OWNER_DRIVE and an empty root folder ID, as in the previous implementation.

For a future production-grade multi-tenant deployment, move central role assignments to a protected server-side identity/permission registry, use an immutable Google subject identifier alongside verified email, introduce transactional provisioning and explicit recovery/audit procedures, and separate the central administration service from ordinary tenant operations. Never grant system privileges solely from a client-supplied role, agency ID or UI state.
