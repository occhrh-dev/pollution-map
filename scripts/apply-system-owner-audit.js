const fs=require('node:fs');
const assert=require('node:assert/strict');
function replaceOnce(text,before,after,label){assert.equal(text.split(before).length-1,1,'Expected one match: '+label);return text.replace(before,after);}
let code=fs.readFileSync('apps-script/Code.gs','utf8');
code=replaceOnce(code,
"      systemListMembers:systemListMembers_,systemSetMember:systemSetMember_\n",
"      systemListMembers:systemListMembers_,systemSetMember:systemSetMember_,systemListAuditLog:systemListAuditLog_\n",'action map');
code=replaceOnce(code,
"function systemAdminEmails_() {\n  return configValue_('SYSTEM_ADMIN_EMAILS').split(',').map(normalizeEmail_).filter(Boolean);\n}\nfunction systemAdminIdentity_(claims) {",
"function systemAdminEmails_() {\n  return configValue_('SYSTEM_ADMIN_EMAILS').split(',').map(normalizeEmail_).filter(Boolean);\n}\nfunction systemOwnerEmail_() {\n  return normalizeEmail_(configValue_('SYSTEM_OWNER_EMAIL'));\n}\nfunction systemAdminIdentity_(claims) {",'owner helper');
code=replaceOnce(code,
"function authorizeSystem_(input) {\n  const claims = verifyCredential_(input.credential);\n  if (!systemAdminIdentity_(claims)) throw apiError_('เฉพาะผู้ดูแลระบบส่วนกลาง','ACCESS_DENIED');\n  return {id:claims.sub,email:claims.email,name:claims.name || ''};\n}\nfunction systemSession_(input) {\n  return {user:authorizeSystem_(input),systemAdmin:true};\n}\n",
"function authorizeSystem_(input) {\n  const claims = verifyCredential_(input.credential);\n  if (!systemAdminIdentity_(claims)) throw apiError_('เฉพาะผู้ดูแลระบบส่วนกลาง','ACCESS_DENIED');\n  return {id:claims.sub,email:claims.email,name:claims.name || '',systemRole:claims.email === systemOwnerEmail_() ? 'OWNER' : 'ADMIN'};\n}\nfunction systemSession_(input) {\n  const user = authorizeSystem_(input);\n  return {user:user,systemAdmin:true,systemRole:user.systemRole};\n}\n",'system role');
code=replaceOnce(code,
"    const row = agencyById_(id);\n    if (!row) throw apiError_('ไม่พบหน่วยงาน','NOT_FOUND');\n    if (['ACTIVE','SUSPENDED'].indexOf(row.status) < 0) throw apiError_('หน่วยงานยังอยู่ระหว่างจัดเตรียม','BAD_REQUEST');\n",
"    const row = agencyById_(id);\n    if (!row) throw apiError_('ไม่พบหน่วยงาน','NOT_FOUND');\n    if (['ACTIVE','SUSPENDED'].indexOf(row.status) < 0) throw apiError_('หน่วยงานยังอยู่ระหว่างจัดเตรียม','BAD_REQUEST');\n    if (status === 'SUSPENDED' && cleanText_(input.confirmation,200) !== String(row.agency_name || '')) throw apiError_('กรุณายืนยันชื่อหน่วยงานให้ถูกต้อง','CONFIRMATION_REQUIRED');\n",'agency confirmation');
code=replaceOnce(code,
"function systemSetMember_(input) {\n  const actor = authorizeSystem_(input);\n  return setMemberCore_(input.member || {},cleanText_(input.targetAgencyId,120),actor,true);\n}\n",
"function systemSetMember_(input) {\n  const actor = authorizeSystem_(input);\n  return setMemberCore_(input.member || {},cleanText_(input.targetAgencyId,120),actor,true,cleanText_(input.confirmation || '',200));\n}\n",'member confirmation arg');
code=replaceOnce(code,
"function setMemberCore_(member,agencyId,actor,system) {",
"function setMemberCore_(member,agencyId,actor,system,confirmation) {",'core signature');
code=replaceOnce(code,
"    const protectedIdentity = protectedMemberEmail_(email,agencyId);\n    if (protectedIdentity && !system) throw apiError_('บัญชีผู้ดูแลระบบส่วนกลางต้องจัดการผ่านศูนย์ผู้ดูแลระบบ','ACCESS_DENIED');\n",
"    const protectedIdentity = protectedMemberEmail_(email,agencyId);\n    const ownerEmail = systemOwnerEmail_();\n    if (protectedIdentity && !system) throw apiError_('บัญชีผู้ดูแลระบบส่วนกลางต้องจัดการผ่านศูนย์ผู้ดูแลระบบ','ACCESS_DENIED');\n    if (system && email === ownerEmail && normalizeEmail_(actor.email) !== ownerEmail) throw apiError_('เฉพาะเจ้าของระบบเท่านั้นที่จัดการบัญชีเจ้าของระบบได้','ACCESS_DENIED');\n",'owner protection');
code=replaceOnce(code,
"    if (status === 'DISABLED' && !current) throw apiError_('ไม่พบสมาชิก','NOT_FOUND');\n    // The trusted identity registry is managed separately from ordinary memberships.\n",
"    if (status === 'DISABLED' && !current) throw apiError_('ไม่พบสมาชิก','NOT_FOUND');\n    if (system && current && current.status === 'ACTIVE' && (status === 'DISABLED' || (current.role === 'ADMIN' && role !== 'ADMIN')) && confirmation !== email) throw apiError_('กรุณายืนยันอีเมลสมาชิกให้ถูกต้อง','CONFIRMATION_REQUIRED');\n    // The trusted identity registry is managed separately from ordinary memberships.\n",'member dangerous confirmation');
code=replaceOnce(code,
"function authorize_(input,roles) {",
"function systemListAuditLog_(input) {\n  authorizeSystem_(input);\n  const requested = Number(input.limit || 200);\n  const limit = Math.max(1,Math.min(300,isFinite(requested) ? Math.floor(requested) : 200));\n  const agencies = {};\n  rows_('AGENCIES').forEach(function(row){agencies[row.agency_id]=row.agency_name;});\n  return rows_('AUDIT_LOG').slice(-limit).reverse().map(function(row){\n    const timestamp=row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');\n    return {id:row.log_id,timestamp:timestamp,email:row.user_email || row.actor_email || '',agencyId:row.agency_id || '',agencyName:agencies[row.agency_id] || '',action:row.action || '',objectType:row.object_type || '',objectId:row.object_id || '',result:row.result || '',detail:row.detail || ''};\n  });\n}\n\nfunction authorize_(input,roles) {",'audit api');
fs.writeFileSync('apps-script/Code.gs',code);
let test=fs.readFileSync('scripts/test-rbac.js','utf8');
test=replaceOnce(test,
"  add('CONFIG',['SYSTEM_ADMIN_EMAILS','root@example.org,backup@example.org','','SYSTEM']);add('CONFIG',['REGISTRATION_REVIEW_AGENCY_ID','CENTRAL','','SYSTEM']);",
"  add('CONFIG',['SYSTEM_ADMIN_EMAILS','root@example.org,backup@example.org','','SYSTEM']);add('CONFIG',['SYSTEM_OWNER_EMAIL','root@example.org','','SYSTEM']);add('CONFIG',['REGISTRATION_REVIEW_AGENCY_ID','CENTRAL','','SYSTEM']);",'test owner config');
test=test.replace("f.ok('root','systemSession');","assert.equal(f.ok('root','systemSession').systemRole,'OWNER');");
test=test.replace("f.ok('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'SUSPENDED'});","f.denied('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'SUSPENDED'});f.ok('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'SUSPENDED',confirmation:'Agency B'});");
test=test.replace("['ACCESS_DENIED','AUTH_REQUIRED','LAST_ADMIN','ACCOUNT_DISABLED','BAD_REQUEST','NOT_FOUND']","['ACCESS_DENIED','AUTH_REQUIRED','LAST_ADMIN','ACCOUNT_DISABLED','BAD_REQUEST','NOT_FOUND','CONFIRMATION_REQUIRED']");
test=replaceOnce(test,
"test('Only system administrator can enroll an allowlisted central identity',()=>{const f=fixture();f.ok('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN',status:'ACTIVE'}});f.ok('backup','systemSession');f.denied('centralAdmin','disableMember',{agencyId:'CENTRAL',email:'backup@example.org'});f.denied('backup','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'VIEWER'}});});",
"test('Only system administrator can enroll an allowlisted central identity',()=>{const f=fixture();f.ok('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN',status:'ACTIVE'}});assert.equal(f.ok('backup','systemSession').systemRole,'ADMIN');f.denied('centralAdmin','disableMember',{agencyId:'CENTRAL',email:'backup@example.org'});f.denied('backup','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN',status:'ACTIVE',displayName:'Changed'}});});",'owner-vs-backup test');
test=replaceOnce(test,
"console.log('RBAC regression suite completed.');",
"test('Audit log is system-scoped and dangerous actions require typed confirmation',()=>{const f=fixture();f.denied('a','systemListAuditLog');const logs=f.ok('root','systemListAuditLog',{limit:20});assert.ok(Array.isArray(logs));f.ok('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'ACTIVE'}});f.denied('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'DISABLED'}});f.ok('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'DISABLED'},confirmation:'x@example.org'});});\n\nconsole.log('RBAC regression suite completed.');",'audit test');
fs.writeFileSync('scripts/test-rbac.js',test);
console.log('Applied system owner, confirmation, and audit changes.');
