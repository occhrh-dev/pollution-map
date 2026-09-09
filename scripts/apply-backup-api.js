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

let html=fs.readFileSync('system-admin.html','utf8');
html=replaceOnce(html,
"<button id=\"auditTab\" class=\"secondary\" type=\"button\">ประวัติการดำเนินการ</button></div>",
"<button id=\"auditTab\" class=\"secondary\" type=\"button\">ประวัติการดำเนินการ</button><button id=\"backupTab\" class=\"secondary\" type=\"button\">สำรองข้อมูล</button></div>",'backup tab');
html=replaceOnce(html,
"<section id=\"auditPanel\" class=\"panel hidden\"><h2>ประวัติการดำเนินการล่าสุด</h2><p>แสดงรายการล่าสุดสูงสุด 200 รายการจากทะเบียนส่วนกลาง</p><div id=\"audit\" class=\"audit\">กำลังโหลด...</div></section></div></main>",
"<section id=\"auditPanel\" class=\"panel hidden\"><h2>ประวัติการดำเนินการล่าสุด</h2><p>แสดงรายการล่าสุดสูงสุด 200 รายการจากทะเบียนส่วนกลาง</p><div id=\"audit\" class=\"audit\">กำลังโหลด...</div></section><section id=\"backupPanel\" class=\"panel hidden\"><h2>สำรองข้อมูลทะเบียนกลาง</h2><p>สำรอง Spreadsheet ทั้งไฟล์อัตโนมัติทุกวันช่วง 02:00–03:00 น. และเก็บย้อนหลัง 30 วัน ระบบนี้ไม่มีการ Restore อัตโนมัติ</p><div id=\"backupStatus\" class=\"card\">กำลังโหลด...</div><button id=\"backupNow\" type=\"button\">สร้าง Backup ตอนนี้</button></section></div></main>",'backup panel');
html=replaceOnce(html,
"function switchTab(tab){for(const name of ['requests','agencies','audit']){$(name+'Panel').classList.toggle('hidden',name!==tab);$(name+'Tab').className=name===tab?'active':'secondary';}if(tab==='audit')loadAudit();}",
"function switchTab(tab){for(const name of ['requests','agencies','audit','backup']){$(name+'Panel').classList.toggle('hidden',name!==tab);$(name+'Tab').className=name===tab?'active':'secondary';}if(tab==='audit')loadAudit();if(tab==='backup')loadBackup();}",'backup switch');
html=replaceOnce(html,
"$('back').onclick=()=>location.href='login.html';$('requestsTab').onclick=()=>switchTab('requests');$('agenciesTab').onclick=()=>switchTab('agencies');$('auditTab').onclick=()=>switchTab('audit');",
"async function loadBackup(){try{const data=await auth.api('systemBackupStatus');const root=$('backupStatus');root.replaceChildren(element('strong','สถานะล่าสุด'),element('div',data.lastSuccessAt?'สำเร็จล่าสุด: '+dateText(data.lastSuccessAt):'ยังไม่มี Backup ที่สำเร็จ'),element('div',data.lastFileName?'ไฟล์: '+data.lastFileName:'ไฟล์: —'),element('div','เก็บย้อนหลัง: '+data.retentionDays+' วัน'));if(data.lastError)root.append(element('div','ข้อผิดพลาดล่าสุด: '+data.lastError,'error'));}catch(error){$('backupStatus').textContent=error.message||'โหลดสถานะ Backup ไม่สำเร็จ';}}\nasync function createBackupNow(){if(!confirm('สร้าง Backup ของทะเบียนกลางตอนนี้หรือไม่?'))return;const b=$('backupNow');b.disabled=true;try{const data=await auth.api('systemCreateBackup');show('สร้าง Backup แล้ว: '+data.name);await Promise.all([loadBackup(),loadAudit()]);}catch(error){show(error.message||'สร้าง Backup ไม่สำเร็จ',true);}finally{b.disabled=false;}}\n$('back').onclick=()=>location.href='login.html';$('requestsTab').onclick=()=>switchTab('requests');$('agenciesTab').onclick=()=>switchTab('agencies');$('auditTab').onclick=()=>switchTab('audit');$('backupTab').onclick=()=>switchTab('backup');$('backupNow').onclick=createBackupNow;",'backup handlers');
html=replaceOnce(html,
"const owner=data.systemRole==='OWNER';$('roleBox').replaceChildren",
"const owner=data.systemRole==='OWNER';$('backupTab').classList.toggle('hidden',!owner);$('roleBox').replaceChildren",'owner-only tab');
fs.writeFileSync('system-admin.html',html);

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
assert.ok(!/function\\s+restore/i.test(backup),'Backup.gs must not implement restore');
console.log('Applied backup API, owner UI, and static safety checks.');
