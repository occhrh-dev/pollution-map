const fs=require('node:fs');
const assert=require('node:assert/strict');
function replaceOnce(text,before,after,label){assert.equal(text.split(before).length-1,1,'Expected one match: '+label);return text.replace(before,after);}
let code=fs.readFileSync('apps-script/Code.gs','utf8');
code=replaceOnce(code,
"      systemListMembers:systemListMembers_,systemSetMember:systemSetMember_,systemListAuditLog:systemListAuditLog_\n",
"      systemListMembers:systemListMembers_,systemSetMember:systemSetMember_,systemListAuditLog:systemListAuditLog_,\n      systemBackupStatus:systemBackupStatus_,systemCreateBackup:systemCreateBackup_\n",'action map');
code=replaceOnce(code,
"function systemSession_(input) {\n  const user = authorizeSystem_(input);\n  return {user:user,systemAdmin:true,systemRole:user.systemRole};\n}\n",
"function systemSession_(input) {\n  const user = authorizeSystem_(input);\n  return {user:user,systemAdmin:true,systemRole:user.systemRole};\n}\nfunction authorizeSystemOwner_(input) {\n  const actor = authorizeSystem_(input);\n  if (actor.systemRole !== 'OWNER') throw apiError_('เฉพาะ SYSTEM OWNER เท่านั้น','ACCESS_DENIED');\n  return actor;\n}\nfunction systemBackupStatus_(input) {\n  const actor = authorizeSystemOwner_(input);\n  return getBackupStatusForOwner_(actor.email);\n}\nfunction systemCreateBackup_(input) {\n  const actor = authorizeSystemOwner_(input);\n  return createManualBackupForOwner_(actor.email);\n}\n",'backup owner api');
fs.writeFileSync('apps-script/Code.gs',code);

let test=fs.readFileSync('scripts/test-rbac.js','utf8');
test=replaceOnce(test,
"for(const action of ['systemListAgencies','systemListRegistrationRequests','systemListMembers','systemSetAgencyStatus','systemSetMember'])",
"for(const action of ['systemListAgencies','systemListRegistrationRequests','systemListMembers','systemSetAgencyStatus','systemSetMember','systemBackupStatus','systemCreateBackup'])",'system endpoint isolation list');
test=replaceOnce(test,
"console.log('RBAC regression suite completed.');",
"test('Backup endpoints are owner-only before backup implementation executes',()=>{const f=fixture();f.denied('a','systemBackupStatus');f.denied('a','systemCreateBackup');f.ok('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN',status:'ACTIVE'}});f.denied('backup','systemBackupStatus');f.denied('backup','systemCreateBackup');});\n\nconsole.log('RBAC regression suite completed.');",'backup RBAC test');
fs.writeFileSync('scripts/test-rbac.js',test);

const backup=fs.readFileSync('apps-script/Backup.gs','utf8');
new Function(backup);
assert.ok(backup.includes("const BACKUP_RETENTION_DAYS = 30"));
assert.ok(backup.includes(".everyDays(1)"));
assert.ok(backup.includes(".inTimezone('Asia/Bangkok')"));
assert.ok(!/restore/i.test(backup.replace(/NO automatic restore function/g,'')),'Backup.gs must not implement restore');
console.log('Applied backup API wiring and static safety checks.');
