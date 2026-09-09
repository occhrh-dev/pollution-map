// One-time, branch-guarded source migration. Run only through the dedicated
// workflow, which validates the exact source blobs before changing anything.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function blobSha(text) {
  return crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0'+text).digest('hex');
}
function patch(file, expected, changes) {
  let text = fs.readFileSync(file,'utf8');
  assert.equal(blobSha(text),expected,'Unexpected source revision: '+file);
  for(const [before,after] of changes) {
    assert.equal(text.split(before).length-1,1,'Expected exactly one match in '+file+': '+before.slice(0,80));
    text=text.replace(before,after);
  }
  fs.writeFileSync(file,text);
  console.log('Updated',file);
}
patch('apps-script/Code.gs','7055c9aba141e282bcdf99fe8f5ac98451af51d5',[[
  "      const email = normalizeEmail_(request.email);const sub = String(request.google_sub || '');\n      const current = rows_('USERS').find(function(row){return row.agency_id === agencyId && (normalizeEmail_(row.email) === email || (sub && String(row.user_id) === sub));});",
  "      const email = normalizeEmail_(request.email);const sub = String(request.google_sub || '');\n      if (protectedMemberEmail_(email,agencyId)) throw apiError_('บัญชีผู้ดูแลระบบส่วนกลางต้องจัดการผ่านศูนย์ผู้ดูแลระบบ','ACCESS_DENIED');\n      const current = rows_('USERS').find(function(row){return row.agency_id === agencyId && (normalizeEmail_(row.email) === email || (sub && String(row.user_id) === sub));});"
]]);
let tests = fs.readFileSync('scripts/test-rbac.js','utf8');
assert.equal(blobSha(tests),'be8613138859ea9699ca261a850e0f7666928758','Unexpected test revision');
for(const [oldId,newId] of [['REQ-NEW','REQ-0000000000000003'],['REQ-A','REQ-0000000000000001'],['REQ-B','REQ-0000000000000002']]) tests=tests.replaceAll(oldId,newId);
function replace(before,after) {
  assert.equal(tests.split(before).length-1,1,'Expected exactly one test match: '+before.slice(0,80));
  tests=tests.replace(before,after);
}
replace("user('root','root@example.org','CENTRAL','ADMIN');user('a'", "user('root','root@example.org','CENTRAL','ADMIN');user('central-admin','central-admin@example.org','CENTRAL','ADMIN');user('a'");
replace("['SYSTEM_ADMIN_EMAILS','root@example.org','','SYSTEM']", "['SYSTEM_ADMIN_EMAILS','root@example.org,backup@example.org','','SYSTEM']");
replace("request('REQ-0000000000000003','founder@example.org','','NEW_AGENCY','New Hospital');", "request('REQ-0000000000000003','founder@example.org','','NEW_AGENCY','New Hospital');request('REQ-0000000000000004','backup@example.org','CENTRAL','EXISTING_AGENCY');");
replace("const claims={root:{sub:'root',email:'root@example.org'},", "const claims={root:{sub:'root',email:'root@example.org'},centralAdmin:{sub:'central-admin',email:'central-admin@example.org'},backup:{sub:'backup',email:'backup@example.org'},");
replace("f.denied('a','upsertMember',{agencyId:'A',member:{email:'root@example.org',role:'ADMIN'}});", "f.denied('centralAdmin','upsertMember',{agencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN'}});");
replace("f.denied('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'VIEWER'}});", "f.denied('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'VIEWER'}});f.denied('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN',status:'DISABLED'}});");
const extra = `
test('Central agency administrators cannot grant system privilege through registration',()=>{const f=fixture();f.denied('centralAdmin','systemSession');f.denied('centralAdmin','upsertMember',{agencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN'}});f.denied('centralAdmin','reviewRegistration',{agencyId:'CENTRAL',requestId:'REQ-0000000000000004',decision:'APPROVE',role:'ADMIN'});f.denied('root','reviewRegistration',{agencyId:'CENTRAL',requestId:'REQ-0000000000000004',decision:'APPROVE',role:'ADMIN'});f.denied('backup','systemSession');});
test('Only system administrator can enroll an allowlisted central identity',()=>{const f=fixture();f.ok('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN',status:'ACTIVE'}});f.ok('backup','systemSession');f.denied('centralAdmin','disableMember',{agencyId:'CENTRAL',email:'backup@example.org'});f.denied('backup','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'VIEWER'}});});
test('Provisioning retries reuse the agency ID and do not duplicate the initial member',()=>{const f=fixture();const id='AGY-0000000000000003';f.tables.REGISTRATION_REQUESTS[3][15]=id;f.tables.AGENCIES.push([id,'New Hospital','founder@example.org','','OWNER_DRIVE','PROVISIONING','','']);f.denied('root','systemSetAgencyStatus',{targetAgencyId:id,status:'ACTIVE'});const result=f.ok('root','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE'});assert.equal(result.createdAgencyId,id);assert.equal(f.tables.AGENCIES.filter(r=>r[0]===id).length,1);assert.equal(f.tables.USERS.filter(r=>r[3]===id).length,1);assert.equal(f.tables.AGENCIES.find(r=>r[0]===id)[5],'ACTIVE');});
test('Existing project APIs retain agency, owner and role isolation',()=>{const f=fixture();const project=f.ok('a','saveProject',{agencyId:'A',project:{name:'Test',fileId:'validFile1234'}});assert.equal(f.ok('a','listProjects',{agencyId:'A'}).length,1);assert.equal(f.ok('a2','listProjects',{agencyId:'A'}).length,0);f.denied('viewer','saveProject',{agencyId:'A',project:{name:'Test',fileId:'validFile1234'}});f.denied('a','saveProject',{agencyId:'B',project:{name:'Test',fileId:'validFile1234'}});f.denied('a2','archiveProject',{agencyId:'A',projectId:project.id});});
test('System API role and status validation rejects forged privilege values',()=>{const f=fixture();f.denied('root','systemSetMember',{targetAgencyId:'B',member:{email:'x@example.org',role:'SYSTEM_ADMIN'}});f.denied('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'PROVISIONING'});f.denied('outsider','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE'});});
`;
replace("console.log('RBAC regression suite completed.');",extra+"\nconsole.log('RBAC regression suite completed.');");
fs.writeFileSync('scripts/test-rbac.js',tests);
console.log('Updated RBAC regression fixtures and security cases.');
