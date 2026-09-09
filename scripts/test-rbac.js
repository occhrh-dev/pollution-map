const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
new vm.Script(source, {filename:'Code.gs'});
for (const file of ['login.html','registration.html','admin.html','system-admin.html']) {
  const html = fs.readFileSync(path.join(root,file),'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  scripts.forEach((script,i)=>new vm.Script(script,{filename:file+':'+i}));
}
const headers = {
  AGENCIES:['agency_id','agency_name','owner_email','root_folder_id','storage_mode','status','created_at','updated_at'],
  USERS:['user_id','email','display_name','agency_id','role','status','registered_at','last_login_at'],
  REGISTRATION_REQUESTS:['request_id','email','display_name','requested_agency_id','status','requested_at','reviewed_at','reviewed_by','assigned_role','note','google_sub','request_type','requested_agency_name','province','details','created_agency_id'],
  CONFIG:['config_key','config_value','description','editable_by'],
  PROJECTS:['project_id','agency_id','project_name','owner_email','drive_file_id','file_name','status','created_at','updated_at'],
  AUDIT_LOG:['log_id','timestamp','actor_email','agency_id','action','object_type','object_id','result','detail']
};
function fixture() {
  const tables = {};
  for (const [name,h] of Object.entries(headers)) tables[name]=[h.slice()];
  const add=(name,row)=>tables[name].push(row);
  const agency=(id,name,owner)=>add('AGENCIES',[id,name,owner,'','OWNER_DRIVE','ACTIVE','','']);
  agency('CENTRAL','Central','root@example.org');agency('A','Agency A','a@example.org');agency('B','Agency B','b@example.org');
  const user=(sub,email,agencyId,role,status='ACTIVE')=>add('USERS',[sub,email,email,agencyId,role,status,'','']);
  user('root','root@example.org','CENTRAL','ADMIN');user('central-admin','central-admin@example.org','CENTRAL','ADMIN');user('a','a@example.org','A','ADMIN');user('a2','a2@example.org','A','ADMIN');user('b','b@example.org','B','ADMIN');user('viewer','viewer@example.org','A','VIEWER');
  add('CONFIG',['SYSTEM_ADMIN_EMAILS','root@example.org,backup@example.org','','SYSTEM']);add('CONFIG',['SYSTEM_OWNER_EMAIL','root@example.org','','SYSTEM']);add('CONFIG',['REGISTRATION_REVIEW_AGENCY_ID','CENTRAL','','SYSTEM']);
  const request=(id,email,agencyId,type,name='')=>add('REGISTRATION_REQUESTS',[id,email,email,agencyId,'PENDING',new Date(),'','','','','sub-'+id,type,name,'Rayong','','']);
  request('REQ-0000000000000001','new-a@example.org','A','EXISTING_AGENCY');request('REQ-0000000000000002','new-b@example.org','B','EXISTING_AGENCY');request('REQ-0000000000000003','founder@example.org','','NEW_AGENCY','New Hospital');request('REQ-0000000000000004','backup@example.org','CENTRAL','EXISTING_AGENCY');
  function sheet(name) {
    const rows=tables[name];
    if(!rows)return null;
    return {getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getLastColumn:()=>rows[0].length,
      appendRow:row=>{rows.push(row.slice());},
      getRange:(r,c,n=1,m=1)=>({getValues:()=>Array.from({length:n},(_,i)=>rows[r-1+i].slice(c-1,c-1+m)),setValue:value=>{rows[r-1][c-1]=value;},setValues:values=>{values.forEach((row,i)=>row.forEach((value,j)=>{rows[r-1+i][c-1+j]=value;}));}})};
  }
  const claims={root:{sub:'root',email:'root@example.org'},centralAdmin:{sub:'central-admin',email:'central-admin@example.org'},backup:{sub:'backup',email:'backup@example.org'},a:{sub:'a',email:'a@example.org'},a2:{sub:'a2',email:'a2@example.org'},b:{sub:'b',email:'b@example.org'},viewer:{sub:'viewer',email:'viewer@example.org'},outsider:{sub:'outsider',email:'outsider@example.org'},founder:{sub:'sub-REQ-0000000000000003',email:'founder@example.org'}};
  const context={Date,JSON,String,Number,Array,Object,Error,Math,console,
    SpreadsheetApp:{openById:()=>({getSheetByName:sheet})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='GOOGLE_CLIENT_ID'?'test-client':''})},
    CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),getUuid:()=>crypto.randomUUID()},
    UrlFetchApp:{fetch:url=>{const token=new URL(url).searchParams.get('id_token');const c=claims[token];return {getResponseCode:()=>c?200:401,getContentText:()=>JSON.stringify({...c,aud:'test-client',iss:'accounts.google.com',email_verified:'true',exp:Math.floor(Date.now()/1000)+3600})};}},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  };
  vm.createContext(context);vm.runInContext(source,context);
  function call(token,action,payload={}){return JSON.parse(context.doPost({postData:{contents:JSON.stringify({action,credential:token,...payload})}}).text);}
  function ok(token,action,payload){const result=call(token,action,payload);assert.equal(result.ok,true,result.error);return result.data;}
  function denied(token,action,payload){const result=call(token,action,payload);assert.equal(result.ok,false,action+' unexpectedly succeeded');assert.ok(['ACCESS_DENIED','AUTH_REQUIRED','LAST_ADMIN','ACCOUNT_DISABLED','BAD_REQUEST','NOT_FOUND','CONFIRMATION_REQUIRED'].includes(result.code),JSON.stringify(result));return result;}
  return {tables,call,ok,denied};
}
function test(name,fn){try{fn();console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
test('System privilege requires verified identity and active central administrator',()=>{const f=fixture();f.denied('outsider','systemSession');f.denied('a','systemSession',{agencyId:'CENTRAL'});assert.equal(f.ok('root','systemSession').systemRole,'OWNER');f.tables.USERS[1][5]='DISABLED';f.denied('root','systemSession');});
test('Agency administrator sees only its existing-agency requests',()=>{const f=fixture();const data=f.ok('a','listRegistrationRequests',{agencyId:'A'});assert.deepEqual(data.map(x=>x.id),['REQ-0000000000000001']);f.denied('a','listRegistrationRequests',{agencyId:'B'});f.denied('viewer','listRegistrationRequests',{agencyId:'A'});});
test('Agency administrator cannot approve new agencies even with forged review agency',()=>{const f=fixture();f.denied('a','reviewRegistration',{agencyId:'A',requestId:'REQ-0000000000000003',decision:'APPROVE',role:'ADMIN'});f.denied('a','reviewRegistration',{agencyId:'CENTRAL',requestId:'REQ-0000000000000003',decision:'APPROVE'});f.denied('a','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE'});assert.equal(f.tables.AGENCIES.length,4);});
test('System administrator creates agency and initial admin only through system endpoint',()=>{const f=fixture();const result=f.ok('root','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE',role:'VIEWER'});assert.equal(result.role,'ADMIN');assert.equal(f.tables.AGENCIES.length,5);const membership=f.tables.USERS.find(r=>r[3]===result.createdAgencyId);assert.equal(membership[4],'ADMIN');assert.equal(membership[0],'sub-REQ-0000000000000003');f.denied('root','systemReviewRegistration',{requestId:'REQ-0000000000000001',decision:'APPROVE'});});
test('Agency-scoped member APIs cannot access another agency',()=>{const f=fixture();f.denied('a','listMembers',{agencyId:'B'});f.denied('a','upsertMember',{agencyId:'B',member:{email:'intruder@example.org',role:'ADMIN'}});f.denied('viewer','upsertMember',{agencyId:'A',member:{email:'intruder@example.org',role:'ADMIN'}});f.denied('a','disableMember',{agencyId:'B',email:'b@example.org'});});
test('System APIs cannot be invoked by ordinary agency administrators',()=>{const f=fixture();for(const action of ['systemListAgencies','systemListRegistrationRequests','systemListMembers','systemSetAgencyStatus','systemSetMember'])f.denied('a',action,{targetAgencyId:'B',status:'SUSPENDED',member:{email:'b@example.org',role:'ADMIN'}});});
test('System administrator may manage agency status without suspending central registry',()=>{const f=fixture();f.denied('root','systemSetAgencyStatus',{targetAgencyId:'CENTRAL',status:'SUSPENDED'});f.denied('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'SUSPENDED'});f.ok('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'SUSPENDED',confirmation:'Agency B'});f.denied('b','session',{agencyId:'B'});f.ok('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'ACTIVE'});});
test('Last active agency administrator and central administrator are protected',()=>{const f=fixture();f.denied('b','upsertMember',{agencyId:'B',member:{email:'b@example.org',role:'VIEWER'}});f.denied('b','disableMember',{agencyId:'B',email:'b@example.org'});f.denied('centralAdmin','upsertMember',{agencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN'}});f.denied('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'VIEWER'}});f.denied('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN',status:'DISABLED'}});});

test('Central agency administrators cannot grant system privilege through registration',()=>{const f=fixture();f.denied('centralAdmin','systemSession');f.denied('centralAdmin','upsertMember',{agencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN'}});f.denied('centralAdmin','reviewRegistration',{agencyId:'CENTRAL',requestId:'REQ-0000000000000004',decision:'APPROVE',role:'ADMIN'});f.denied('root','reviewRegistration',{agencyId:'CENTRAL',requestId:'REQ-0000000000000004',decision:'APPROVE',role:'ADMIN'});f.denied('backup','systemSession');});
test('Only system administrator can enroll an allowlisted central identity',()=>{const f=fixture();f.ok('root','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'backup@example.org',role:'ADMIN',status:'ACTIVE'}});assert.equal(f.ok('backup','systemSession').systemRole,'ADMIN');f.denied('centralAdmin','disableMember',{agencyId:'CENTRAL',email:'backup@example.org'});f.denied('backup','systemSetMember',{targetAgencyId:'CENTRAL',member:{email:'root@example.org',role:'ADMIN',status:'ACTIVE',displayName:'Changed'}});});
test('Provisioning retries reuse the agency ID and do not duplicate the initial member',()=>{const f=fixture();const id='AGY-0000000000000003';f.tables.REGISTRATION_REQUESTS[3][15]=id;f.tables.AGENCIES.push([id,'New Hospital','founder@example.org','','OWNER_DRIVE','PROVISIONING','','']);f.denied('root','systemSetAgencyStatus',{targetAgencyId:id,status:'ACTIVE'});const result=f.ok('root','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE'});assert.equal(result.createdAgencyId,id);assert.equal(f.tables.AGENCIES.filter(r=>r[0]===id).length,1);assert.equal(f.tables.USERS.filter(r=>r[3]===id).length,1);assert.equal(f.tables.AGENCIES.find(r=>r[0]===id)[5],'ACTIVE');});
test('Existing project APIs retain agency, owner and role isolation',()=>{const f=fixture();const project=f.ok('a','saveProject',{agencyId:'A',project:{name:'Test',fileId:'validFile1234'}});assert.equal(f.ok('a','listProjects',{agencyId:'A'}).length,1);assert.equal(f.ok('a2','listProjects',{agencyId:'A'}).length,0);f.denied('viewer','saveProject',{agencyId:'A',project:{name:'Test',fileId:'validFile1234'}});f.denied('a','saveProject',{agencyId:'B',project:{name:'Test',fileId:'validFile1234'}});f.denied('a2','archiveProject',{agencyId:'A',projectId:project.id});});
test('System API role and status validation rejects forged privilege values',()=>{const f=fixture();f.denied('root','systemSetMember',{targetAgencyId:'B',member:{email:'x@example.org',role:'SYSTEM_ADMIN'}});f.denied('root','systemSetAgencyStatus',{targetAgencyId:'B',status:'PROVISIONING'});f.denied('outsider','systemReviewRegistration',{requestId:'REQ-0000000000000003',decision:'APPROVE'});});

test('Audit log is system-scoped and dangerous actions require typed confirmation',()=>{const f=fixture();f.denied('a','systemListAuditLog');const logs=f.ok('root','systemListAuditLog',{limit:20});assert.ok(Array.isArray(logs));f.ok('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'ACTIVE'}});f.denied('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'DISABLED'}});f.ok('root','systemSetMember',{targetAgencyId:'A',member:{email:'x@example.org',role:'VIEWER',status:'DISABLED'},confirmation:'x@example.org'});});

console.log('RBAC regression suite completed.');
