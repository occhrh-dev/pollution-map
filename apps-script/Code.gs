const SPREADSHEET_ID = '1uwRoszxycRvWP-_qA9g3FEvAHJ0PD_ocT4abbyhpecI';
const USER_ROLES = ['ADMIN', 'EDITOR', 'VIEWER'];
const EDIT_ROLES = ['ADMIN', 'EDITOR'];

function doGet() {
  return json_({ok:true,data:{service:'pollution-map-auth',status:'ready'}});
}
function doPost(e) {
  try {
    const input = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const actions = {
      login:login_,session:session_,listRegistrationAgencies:listRegistrationAgencies_,requestAccess:requestAccess_,
      listRegistrationRequests:listRegistrationRequests_,reviewRegistration:reviewRegistration_,
      listProjects:listProjects_,saveProject:saveProject_,archiveProject:archiveProject_,
      getSettings:getSettings_,saveSettings:saveSettings_,listMembers:listMembers_,upsertMember:upsertMember_,disableMember:disableMember_,
      systemSession:systemSession_,systemListAgencies:systemListAgencies_,systemSetAgencyStatus:systemSetAgencyStatus_,
      systemListRegistrationRequests:systemListRegistrationRequests_,systemReviewRegistration:systemReviewRegistration_,
      systemListMembers:systemListMembers_,systemSetMember:systemSetMember_
    };
    const action = String(input.action || '');
    if (!Object.prototype.hasOwnProperty.call(actions,action)) throw apiError_('ไม่รู้จักคำสั่งที่เรียกใช้','BAD_REQUEST');
    return json_({ok:true,data:actions[action](input)});
  } catch(error) {
    return json_({ok:false,error:error.message || 'ระบบทำงานไม่สำเร็จ',code:error.code || 'SERVER_ERROR'});
  }
}

// A system administrator is an explicitly trusted Google identity AND an active
// administrator of the central registry. An agency role alone never grants this scope.
function systemAdminEmails_() {
  return configValue_('SYSTEM_ADMIN_EMAILS').split(',').map(normalizeEmail_).filter(Boolean);
}
function systemAdminIdentity_(claims) {
  if (systemAdminEmails_().indexOf(claims.email) < 0) return false;
  const id = configValue_('REGISTRATION_REVIEW_AGENCY_ID');
  const agency = agencyById_(id);
  return !!(id && agency && agency.status === 'ACTIVE' && activeUsersForClaims_(claims).some(function(row) {
    return row.agency_id === id && row.role === 'ADMIN';
  }));
}
function authorizeSystem_(input) {
  const claims = verifyCredential_(input.credential);
  if (!systemAdminIdentity_(claims)) throw apiError_('เฉพาะผู้ดูแลระบบส่วนกลาง','ACCESS_DENIED');
  return {id:claims.sub,email:claims.email,name:claims.name || ''};
}
function systemSession_(input) {
  return {user:authorizeSystem_(input),systemAdmin:true};
}
function systemListAgencies_(input) {
  authorizeSystem_(input);
  return rows_('AGENCIES').map(function(row) {
    return {id:row.agency_id,name:row.agency_name,ownerEmail:row.owner_email,status:row.status,storageMode:row.storage_mode};
  });
}
function systemSetAgencyStatus_(input) {
  const actor = authorizeSystem_(input);
  const id = cleanText_(input.targetAgencyId,120);
  const status = String(input.status || '').toUpperCase();
  if (['ACTIVE','SUSPENDED'].indexOf(status) < 0) throw apiError_('สถานะไม่ถูกต้อง','BAD_REQUEST');
  if (id === configValue_('REGISTRATION_REVIEW_AGENCY_ID')) throw apiError_('ไม่สามารถระงับหรือแก้สถานะหน่วยงานหลักของระบบ','ACCESS_DENIED');
  const lock = LockService.getScriptLock();lock.waitLock(20000);
  try {
    const row = agencyById_(id);
    if (!row) throw apiError_('ไม่พบหน่วยงาน','NOT_FOUND');
    if (['ACTIVE','SUSPENDED'].indexOf(row.status) < 0) throw apiError_('หน่วยงานยังอยู่ระหว่างจัดเตรียม','BAD_REQUEST');
    sheet_('AGENCIES').getRange(row._row,headerIndex_('AGENCIES','status')).setValue(status);
    sheet_('AGENCIES').getRange(row._row,headerIndex_('AGENCIES','updated_at')).setValue(new Date());
    appendAudit_(actor.email,id,'SYSTEM_AGENCY_STATUS','AGENCY',id,'SUCCESS',status);
    return {id:id,status:status};
  } finally {lock.releaseLock();}
}

function login_(input) {
  const claims = verifyCredential_(input.credential);
  const users = activeUsersForClaims_(claims);
  if (!users.length) {
    appendAudit_(claims.email,'','LOGIN','USER',claims.sub,'DENIED','บัญชียังไม่ได้รับสิทธิ์หรือถูกระงับ');
    throw apiError_('บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน','ACCESS_DENIED');
  }
  const agencies = users.map(function(user) {
    const agency = agencyById_(user.agency_id);
    if (!agency || agency.status !== 'ACTIVE') return null;
    claimPendingUserId_(user,claims.sub);updateLastLogin_(user._row);
    return {id:agency.agency_id,name:agency.agency_name,role:user.role,rootFolderId:agency.root_folder_id || ''};
  }).filter(Boolean);
  if (!agencies.length) throw apiError_('หน่วยงานของบัญชีนี้ถูกระงับ','ACCESS_DENIED');
  appendAudit_(claims.email,agencies[0].id,'LOGIN','USER',claims.sub,'SUCCESS','เข้าสู่ระบบด้วย Google');
  return {user:{id:claims.sub,email:claims.email,name:claims.name || ''},agencies:agencies,systemAdmin:systemAdminIdentity_(claims)};
}
function session_(input) {
  const auth = authorize_(input,[]);
  return {user:auth.user,membership:{role:auth.role},agency:auth.agency,systemAdmin:systemAdminIdentity_(verifyCredential_(input.credential))};
}
function listRegistrationAgencies_() {
  return rows_('AGENCIES').filter(function(row){return row.status === 'ACTIVE';}).map(function(row){return {id:row.agency_id,name:row.agency_name};});
}
function registrationOutput_(row) {
  function date(value){return value instanceof Date ? value.toISOString() : String(value || '');}
  return {id:row.request_id,email:row.email,displayName:row.display_name,agencyId:row.requested_agency_id,
    status:row.status,requestedAt:date(row.requested_at),reviewedAt:date(row.reviewed_at),reviewedBy:row.reviewed_by || '',
    assignedRole:row.assigned_role || '',note:row.note || '',requestType:row.request_type || 'EXISTING_AGENCY',
    agencyName:row.requested_agency_name || '',province:row.province || '',details:row.details || '',createdAgencyId:row.created_agency_id || ''};
}
function requestAccess_(input) {
  const claims = verifyCredential_(input.credential);
  const type = String(input.requestType || 'EXISTING_AGENCY').toUpperCase();
  const name = cleanText_(input.displayName || claims.name || claims.email,160);
  if (!name || ['EXISTING_AGENCY','NEW_AGENCY'].indexOf(type) < 0) throw apiError_('ข้อมูลสมัครไม่ถูกต้อง','BAD_REQUEST');
  const lock = LockService.getScriptLock();lock.waitLock(20000);
  try {
    if (type === 'NEW_AGENCY') {
      const agencyName = cleanText_(input.agencyName,200);
      const province = cleanText_(input.province,100);
      const details = cleanText_(input.details,500);
      if (!agencyName || !province) throw apiError_('กรุณาระบุชื่อหน่วยงานและจังหวัด','BAD_REQUEST');
      if (rows_('AGENCIES').some(function(row){return normalizeName_(row.agency_name) === normalizeName_(agencyName);})) throw apiError_('มีหน่วยงานชื่อนี้อยู่แล้ว','AGENCY_EXISTS');
      const pending = rows_('REGISTRATION_REQUESTS').find(function(row){return row.status === 'PENDING' && row.request_type === 'NEW_AGENCY' && (normalizeEmail_(row.email) === claims.email || String(row.google_sub || '') === claims.sub);});
      if (pending) return {id:pending.request_id,status:'PENDING',requestType:'NEW_AGENCY'};
      const id = newId_('REQ');
      sheet_('REGISTRATION_REQUESTS').appendRow([id,claims.email,name,'','PENDING',new Date(),'','','','',claims.sub,'NEW_AGENCY',agencyName,province,details,'']);
      appendAudit_(claims.email,'','AGENCY_REGISTRATION_REQUEST','AGENCY',id,'SUCCESS',agencyName);
      return {id:id,status:'PENDING',requestType:'NEW_AGENCY'};
    }
    const agencyId = cleanText_(input.agencyId,120);
    const agency = agencyById_(agencyId);
    if (!agency || agency.status !== 'ACTIVE') throw apiError_('ไม่พบหน่วยงานที่เลือก','BAD_REQUEST');
    const members = rows_('USERS').filter(function(row){return row.agency_id === agencyId && (String(row.user_id) === claims.sub || normalizeEmail_(row.email) === claims.email);});
    if (members.some(function(row){return row.status === 'ACTIVE';})) throw apiError_('บัญชีนี้มีสิทธิ์อยู่แล้ว','ALREADY_MEMBER');
    if (members.some(function(row){return row.status === 'DISABLED';})) throw apiError_('บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแล','ACCOUNT_DISABLED');
    const pending = rows_('REGISTRATION_REQUESTS').find(function(row){return row.requested_agency_id === agencyId && row.status === 'PENDING' && (normalizeEmail_(row.email) === claims.email || String(row.google_sub || '') === claims.sub);});
    if (pending) return {id:pending.request_id,status:'PENDING',email:claims.email,agencyId:agencyId};
    const id = newId_('REQ');
    sheet_('REGISTRATION_REQUESTS').appendRow([id,claims.email,name,agencyId,'PENDING',new Date(),'','','','',claims.sub,'EXISTING_AGENCY','','','','']);
    appendAudit_(claims.email,agencyId,'REGISTRATION_REQUEST','USER',id,'SUCCESS',name);
    return {id:id,status:'PENDING',email:claims.email,agencyId:agencyId,requestType:'EXISTING_AGENCY'};
  } finally {lock.releaseLock();}
}
function requestSort_(a,b) {
  if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
  if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
  return String(b.requestedAt).localeCompare(String(a.requestedAt));
}
function listRegistrationRequests_(input) {
  const auth = authorize_(input,['ADMIN']);
  return rows_('REGISTRATION_REQUESTS').filter(function(row){return String(row.request_type || 'EXISTING_AGENCY').toUpperCase() === 'EXISTING_AGENCY' && row.requested_agency_id === auth.agency.id;}).map(registrationOutput_).sort(requestSort_);
}
function systemListRegistrationRequests_(input) {
  authorizeSystem_(input);
  return rows_('REGISTRATION_REQUESTS').filter(function(row){return row.request_type === 'NEW_AGENCY';}).map(registrationOutput_).sort(requestSort_);
}
function reviewRegistration_(input) {
  const auth = authorize_(input,['ADMIN']);
  return reviewRegistrationCore_(input,auth.user,false,auth.agency.id);
}
function systemReviewRegistration_(input) {
  const actor = authorizeSystem_(input);
  return reviewRegistrationCore_(input,actor,true,'');
}
function reviewRegistrationCore_(input,actor,system,agencyId) {
  const id = cleanText_(input.requestId,120);
  const decision = String(input.decision || '').toUpperCase();
  const role = String(input.role || 'VIEWER').toUpperCase();
  const note = cleanText_(input.note || '',500);
  if (['APPROVE','REJECT'].indexOf(decision) < 0) throw apiError_('ผลการพิจารณาไม่ถูกต้อง','BAD_REQUEST');
  const lock = LockService.getScriptLock();lock.waitLock(20000);
  try {
    const request = rows_('REGISTRATION_REQUESTS').find(function(row){return row.request_id === id;});
    if (!request) throw apiError_('ไม่พบคำขอ','NOT_FOUND');
    const type = String(request.request_type || 'EXISTING_AGENCY').toUpperCase();
    if (system ? type !== 'NEW_AGENCY' : type !== 'EXISTING_AGENCY' || request.requested_agency_id !== agencyId) throw apiError_('ไม่มีสิทธิ์พิจารณาคำขอนี้','ACCESS_DENIED');
    if (request.status !== 'PENDING') throw apiError_('คำขอนี้ถูกพิจารณาแล้ว','ALREADY_REVIEWED');
    const now = new Date();let assignedRole = '';let createdAgencyId = '';
    if (decision === 'APPROVE' && system) {
      const name = cleanText_(request.requested_agency_name,200);
      if (!name) throw apiError_('คำขอไม่มีชื่อหน่วยงาน','BAD_REQUEST');
      const email = normalizeEmail_(request.email);const sub = String(request.google_sub || '');
      if (!sub) throw apiError_('คำขอไม่มีข้อมูลยืนยันบัญชี Google','BAD_REQUEST');
      // Persist the provisioning ID first so retries cannot create a second agency.
      createdAgencyId = String(request.created_agency_id || '') || 'AGY-'+id.replace(/^REQ-/,'');
      if (!/^AGY-[A-Za-z0-9_-]{8,120}$/.test(createdAgencyId)) throw apiError_('รหัสหน่วยงานไม่ถูกต้อง','BAD_REQUEST');
      if (rows_('AGENCIES').some(function(row){return row.agency_id !== createdAgencyId && normalizeName_(row.agency_name) === normalizeName_(name);})) throw apiError_('มีหน่วยงานชื่อนี้อยู่แล้ว','AGENCY_EXISTS');
      const requestSheet = sheet_('REGISTRATION_REQUESTS');
      requestSheet.getRange(request._row,headerIndex_('REGISTRATION_REQUESTS','created_agency_id')).setValue(createdAgencyId);
      let agency = agencyById_(createdAgencyId);
      if (!agency) {
        sheet_('AGENCIES').appendRow([createdAgencyId,name,email,'','OWNER_DRIVE','PROVISIONING',now,now]);
        agency = agencyById_(createdAgencyId);
      }
      if (normalizeName_(agency.agency_name) !== normalizeName_(name)) throw apiError_('ข้อมูลหน่วยงานไม่ตรงกับคำขอ','BAD_REQUEST');
      const current = rows_('USERS').find(function(row){return row.agency_id === createdAgencyId && (normalizeEmail_(row.email) === email || String(row.user_id) === sub);});
      if (current && (normalizeEmail_(current.email) !== email || (String(current.user_id) !== sub && String(current.user_id) !== 'PENDING:'+email))) throw apiError_('ข้อมูลบัญชีเดิมไม่ตรงกับคำขอ','BAD_REQUEST');
      if (current && current.status === 'DISABLED') throw apiError_('บัญชีถูกระงับ กรุณาตรวจสอบข้อมูลก่อนดำเนินการ','ACCOUNT_DISABLED');
      if (!current) sheet_('USERS').appendRow([sub,email,cleanText_(request.display_name || email,160),createdAgencyId,'ADMIN','ACTIVE',now,'']);
      else if (current.status !== 'ACTIVE' || current.role !== 'ADMIN') sheet_('USERS').getRange(current._row,1,1,8).setValues([[sub,email,cleanText_(request.display_name || email,160),createdAgencyId,'ADMIN','ACTIVE',current.registered_at || now,current.last_login_at || '']]);
      assignedRole = 'ADMIN';
      if (agency.status === 'PROVISIONING') {
        sheet_('AGENCIES').getRange(agency._row,headerIndex_('AGENCIES','status')).setValue('ACTIVE');
        sheet_('AGENCIES').getRange(agency._row,headerIndex_('AGENCIES','updated_at')).setValue(now);
      } else if (agency.status !== 'ACTIVE') throw apiError_('หน่วยงานถูกระงับ กรุณาตรวจสอบก่อนดำเนินการ','ACCOUNT_DISABLED');
      appendAudit_(actor.email,createdAgencyId,'AGENCY_CREATE','AGENCY',createdAgencyId,'SUCCESS',name);
    } else if (decision === 'APPROVE') {
      if (USER_ROLES.indexOf(role) < 0) throw apiError_('บทบาทไม่ถูกต้อง','BAD_REQUEST');
      const email = normalizeEmail_(request.email);const sub = String(request.google_sub || '');
      const current = rows_('USERS').find(function(row){return row.agency_id === agencyId && (normalizeEmail_(row.email) === email || (sub && String(row.user_id) === sub));});
      if (current && current.status === 'DISABLED') throw apiError_('บัญชีนี้ถูกระงับ กรุณาจัดการสิทธิ์เดิมโดยตรง','ACCOUNT_DISABLED');
      if (current && current.status === 'ACTIVE') throw apiError_('บัญชีนี้มีสิทธิ์อยู่แล้ว','ALREADY_MEMBER');
      const values = [sub || 'PENDING:'+email,email,cleanText_(request.display_name || email,160),agencyId,role,'ACTIVE',now,''];
      if (current) sheet_('USERS').getRange(current._row,1,1,values.length).setValues([values]);else sheet_('USERS').appendRow(values);
      assignedRole = role;
    }
    sheet_('REGISTRATION_REQUESTS').getRange(request._row,5,1,5).setValues([[decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',now,actor.email,assignedRole,note]]);
    appendAudit_(actor.email,createdAgencyId || agencyId,system ? 'SYSTEM_REGISTRATION_REVIEW' : 'REGISTRATION_REVIEW',system ? 'AGENCY' : 'USER',id,'SUCCESS',decision);
    return {id:id,status:decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',role:assignedRole,createdAgencyId:createdAgencyId};
  } finally {lock.releaseLock();}
}

// Existing project and settings APIs retain their agency and owner isolation.
function listProjects_(input) {
  const auth = authorize_(input,[]);
  return rows_('PROJECTS').filter(function(row){return row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email && row.status !== 'ARCHIVED' && String(row.project_id).indexOf('CFG-') !== 0;}).map(projectOutput_).sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));});
}
function saveProject_(input) {
  const auth = authorize_(input,EDIT_ROLES);const project = input.project || {};
  const name = cleanText_(project.name,180);const fileId = cleanFileId_(project.fileId);
  if (!name || !fileId) throw apiError_('ข้อมูลโครงการไม่ครบ','BAD_REQUEST');
  const lock = LockService.getScriptLock();lock.waitLock(20000);
  try {
    const current = project.id ? rows_('PROJECTS').find(function(row){return row.project_id === project.id && row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email;}) : null;
    const id = current ? current.project_id : newId_('PRJ');
    const values = [id,auth.agency.id,name,auth.user.email,fileId,cleanText_(project.fileName || name+'.json',220),'ACTIVE',current ? current.created_at : new Date(),new Date()];
    if (current) sheet_('PROJECTS').getRange(current._row,1,1,values.length).setValues([values]);else sheet_('PROJECTS').appendRow(values);
    appendAudit_(auth.user.email,auth.agency.id,current ? 'PROJECT_UPDATE' : 'PROJECT_CREATE','PROJECT',id,'SUCCESS',name);
    return {id:id,fileId:fileId};
  } finally {lock.releaseLock();}
}
function archiveProject_(input) {
  const auth = authorize_(input,['ADMIN']);
  const current = rows_('PROJECTS').find(function(row){return row.project_id === input.projectId && row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email;});
  if (!current || String(current.project_id).indexOf('CFG-') === 0) throw apiError_('ไม่พบโครงการ','NOT_FOUND');
  sheet_('PROJECTS').getRange(current._row,headerIndex_('PROJECTS','status')).setValue('ARCHIVED');
  sheet_('PROJECTS').getRange(current._row,headerIndex_('PROJECTS','updated_at')).setValue(new Date());
  appendAudit_(auth.user.email,auth.agency.id,'PROJECT_ARCHIVE','PROJECT',input.projectId,'SUCCESS',current.project_name);
  return {id:input.projectId};
}
function getSettings_(input) {
  const auth = authorize_(input,[]);const id = settingsId_(auth);
  const current = rows_('PROJECTS').find(function(row){return row.project_id === id && row.agency_id === auth.agency.id && row.status !== 'ARCHIVED';});
  return current ? projectOutput_(current) : null;
}
function saveSettings_(input) {
  const auth = authorize_(input,EDIT_ROLES);const fileId = cleanFileId_(input.fileId);
  if (!fileId) throw apiError_('ไม่พบไฟล์ตั้งค่าชุมชน','BAD_REQUEST');
  const id = settingsId_(auth);
  const current = rows_('PROJECTS').find(function(row){return row.project_id === id && row.agency_id === auth.agency.id;});
  const values = [id,auth.agency.id,'__COMMUNITY_SETTINGS__',auth.user.email,fileId,'community-settings.json','ACTIVE',current ? current.created_at : new Date(),new Date()];
  if (current) sheet_('PROJECTS').getRange(current._row,1,1,values.length).setValues([values]);else sheet_('PROJECTS').appendRow(values);
  appendAudit_(auth.user.email,auth.agency.id,'SETTINGS_UPDATE','AGENCY',auth.agency.id,'SUCCESS','บันทึกผังชุมชน');
  return {id:id,fileId:fileId};
}
function listMembers_(input) {
  const auth = authorize_(input,['ADMIN']);
  return rows_('USERS').filter(function(row){return row.agency_id === auth.agency.id;}).map(memberOutput_);
}
function memberOutput_(row) {return {id:row.user_id,email:row.email,displayName:row.display_name,role:row.role,status:row.status};}
function protectedMemberEmail_(email,agencyId) {
  return agencyId === configValue_('REGISTRATION_REVIEW_AGENCY_ID') && systemAdminEmails_().indexOf(normalizeEmail_(email)) >= 0;
}
function ensureLastAdmin_(row,role,status) {
  if (!row || row.status !== 'ACTIVE' || row.role !== 'ADMIN' || (status === 'ACTIVE' && role === 'ADMIN')) return;
  const count = rows_('USERS').filter(function(item){return item.agency_id === row.agency_id && item.status === 'ACTIVE' && item.role === 'ADMIN';}).length;
  if (count <= 1) throw apiError_('ต้องเหลือผู้ดูแลหน่วยงานอย่างน้อยหนึ่งบัญชี','LAST_ADMIN');
}
function upsertMember_(input) {
  const auth = authorize_(input,['ADMIN']);
  return setMemberCore_(input.member || {},auth.agency.id,auth.user,false);
}
function disableMember_(input) {
  const auth = authorize_(input,['ADMIN']);
  return setMemberCore_({email:input.email,status:'DISABLED'},auth.agency.id,auth.user,false);
}
function systemListMembers_(input) {
  authorizeSystem_(input);
  const id = cleanText_(input.targetAgencyId,120);
  if (!agencyById_(id)) throw apiError_('ไม่พบหน่วยงาน','NOT_FOUND');
  return rows_('USERS').filter(function(row){return row.agency_id === id;}).map(memberOutput_);
}
function systemSetMember_(input) {
  const actor = authorizeSystem_(input);
  return setMemberCore_(input.member || {},cleanText_(input.targetAgencyId,120),actor,true);
}
function setMemberCore_(member,agencyId,actor,system) {
  const email = normalizeEmail_(member.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError_('อีเมลไม่ถูกต้อง','BAD_REQUEST');
  const lock = LockService.getScriptLock();lock.waitLock(20000);
  try {
    const agency = agencyById_(agencyId);
    if (!agency || (agency.status !== 'ACTIVE' && !system) || agency.status === 'PROVISIONING') throw apiError_('หน่วยงานไม่พร้อมใช้งาน','ACCESS_DENIED');
    const current = rows_('USERS').find(function(row){return normalizeEmail_(row.email) === email && row.agency_id === agencyId;});
    const protectedIdentity = protectedMemberEmail_(email,agencyId);
    if (protectedIdentity && !system) throw apiError_('บัญชีผู้ดูแลระบบส่วนกลางต้องจัดการผ่านศูนย์ผู้ดูแลระบบ','ACCESS_DENIED');
    if (email === actor.email && member.status === 'DISABLED') throw apiError_('ไม่สามารถระงับบัญชีตนเอง','BAD_REQUEST');
    const role = member.role ? String(member.role).toUpperCase() : current ? current.role : 'VIEWER';
    const status = member.status ? String(member.status).toUpperCase() : 'ACTIVE';
    if (USER_ROLES.indexOf(role) < 0 || ['ACTIVE','DISABLED'].indexOf(status) < 0) throw apiError_('บทบาทหรือสถานะไม่ถูกต้อง','BAD_REQUEST');
    if (status === 'DISABLED' && !current) throw apiError_('ไม่พบสมาชิก','NOT_FOUND');
    // The trusted identity registry is managed separately from ordinary memberships.
    // No member-edit API may demote or disable an allowlisted central administrator.
    if (protectedIdentity && (role !== 'ADMIN' || status !== 'ACTIVE')) throw apiError_('ไม่สามารถลดสิทธิ์หรือระงับผู้ดูแลระบบส่วนกลาง','ACCESS_DENIED');
    ensureLastAdmin_(current,role,status);
    const values = [current ? current.user_id : 'PENDING:'+email,email,cleanText_(member.displayName || (current && current.display_name) || email,160),agencyId,role,status,current ? current.registered_at : new Date(),current ? current.last_login_at : ''];
    if (current) sheet_('USERS').getRange(current._row,1,1,values.length).setValues([values]);else sheet_('USERS').appendRow(values);
    appendAudit_(actor.email,agencyId,system ? 'SYSTEM_MEMBER_UPDATE' : 'MEMBER_UPDATE','USER',email,'SUCCESS',role+' '+status);
    return {email:email,role:role,status:status};
  } finally {lock.releaseLock();}
}

function authorize_(input,roles) {
  const claims = verifyCredential_(input.credential);const agencyId = String(input.agencyId || '');
  const user = activeUsersForClaims_(claims).find(function(row){return row.agency_id === agencyId;});
  if (!user) throw apiError_('ไม่มีสิทธิ์ในหน่วยงานนี้','ACCESS_DENIED');
  const agency = agencyById_(agencyId);
  if (!agency || agency.status !== 'ACTIVE') throw apiError_('หน่วยงานถูกระงับ','ACCESS_DENIED');
  if (roles.length && roles.indexOf(user.role) < 0) throw apiError_('บทบาทนี้ไม่มีสิทธิ์ดำเนินการ','ACCESS_DENIED');
  claimPendingUserId_(user,claims.sub);
  return {user:{id:claims.sub,email:claims.email,name:claims.name || user.display_name || ''},role:user.role,agency:{id:agency.agency_id,name:agency.agency_name,rootFolderId:agency.root_folder_id || ''}};
}
function verifyCredential_(credential) {
  if (!credential) throw apiError_('กรุณาเข้าสู่ระบบใหม่','AUTH_REQUIRED');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw apiError_('ผู้ดูแลยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID','SETUP_REQUIRED');
  const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,credential)).slice(0,40);
  const cache = CacheService.getScriptCache();const cached = cache.get('idtoken:'+digest);
  if (cached) {
    const claims = JSON.parse(cached);
    if (Number(claims.exp)*1000 > Date.now()) return claims;
  }
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential),{muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw apiError_('บัญชีหมดอายุ กรุณาเข้าสู่ระบบใหม่','AUTH_REQUIRED');
  const claims = JSON.parse(response.getContentText());
  if (claims.aud !== clientId || ['accounts.google.com','https://accounts.google.com'].indexOf(claims.iss) < 0 || String(claims.email_verified) !== 'true' || Number(claims.exp)*1000 <= Date.now()) throw apiError_('ข้อมูลยืนยันบัญชีไม่ถูกต้อง','AUTH_REQUIRED');
  claims.email = normalizeEmail_(claims.email);cache.put('idtoken:'+digest,JSON.stringify(claims),300);
  return claims;
}
function activeUsersForClaims_(claims) {
  return rows_('USERS').filter(function(row){const id=String(row.user_id || '');return row.status === 'ACTIVE' && (id === claims.sub || (id.indexOf('PENDING:') === 0 && normalizeEmail_(row.email) === claims.email));});
}
function claimPendingUserId_(user,sub) {
  if (String(user.user_id).indexOf('PENDING:') === 0) {sheet_('USERS').getRange(user._row,headerIndex_('USERS','user_id')).setValue(sub);user.user_id=sub;}
}
function updateLastLogin_(row) {sheet_('USERS').getRange(row,headerIndex_('USERS','last_login_at')).setValue(new Date());}
function agencyById_(id) {return rows_('AGENCIES').find(function(row){return row.agency_id === id;});}
function configValue_(key) {const row=rows_('CONFIG').find(function(item){return String(item.config_key || '') === key;});return row ? String(row.config_value || '') : '';}
function rows_(name) {
  const sheet=sheet_(name);const values=sheet.getDataRange().getValues();if(values.length<2)return [];
  const headers=values[0].map(String);
  return values.slice(1).map(function(row,index){const result={_row:index+2};headers.forEach(function(header,col){result[header]=row[col];});return result;}).filter(function(row){return headers.some(function(header){return row[header] !== '';});});
}
function sheet_(name) {const sheet=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);if(!sheet)throw apiError_('ไม่พบตาราง '+name,'SETUP_REQUIRED');return sheet;}
function headerIndex_(name,header) {const headers=sheet_(name).getRange(1,1,1,sheet_(name).getLastColumn()).getValues()[0].map(String);const index=headers.indexOf(header);if(index<0)throw apiError_('ไม่พบคอลัมน์ '+header,'SETUP_REQUIRED');return index+1;}
function projectOutput_(row) {return {id:row.project_id,name:row.project_name,ownerEmail:row.owner_email,fileId:row.drive_file_id,fileName:row.file_name,status:row.status,updatedAt:row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')};}
function settingsId_(auth) {return 'CFG-'+auth.agency.id+'-'+auth.user.id;}
function appendAudit_(email,agencyId,action,objectType,objectId,result,detail) {try{sheet_('AUDIT_LOG').appendRow([newId_('LOG'),new Date(),email,agencyId,action,objectType,objectId,result,cleanText_(detail,500)]);}catch(_) {}}
function normalizeEmail_(value) {return String(value || '').trim().toLowerCase();}
function normalizeName_(value) {return String(value || '').trim().replace(/\s+/g,' ').toLowerCase();}
function cleanText_(value,max) {return String(value || '').trim().slice(0,max);}
function cleanFileId_(value) {const id=String(value || '').trim();return /^[A-Za-z0-9_-]{10,200}$/.test(id)?id:'';}
function newId_(prefix) {return prefix+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,16).toUpperCase();}
function apiError_(message,code) {const error=new Error(message);error.code=code;return error;}
function json_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
