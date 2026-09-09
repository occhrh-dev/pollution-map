const SPREADSHEET_ID = '1uwRoszxycRvWP-_qA9g3FEvAHJ0PD_ocT4abbyhpecI';
const USER_ROLES = ['ADMIN', 'EDITOR', 'VIEWER'];
const EDIT_ROLES = ['ADMIN', 'EDITOR'];

function doGet() {
  return json_({ ok: true, data: { service: 'pollution-map-auth', status: 'ready' } });
}

function doPost(e) {
  try {
    const input = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(input.action || '');
    let data;
    if (action === 'login') data = login_(input);
    else if (action === 'session') data = session_(input);
    else if (action === 'listRegistrationAgencies') data = listRegistrationAgencies_();
    else if (action === 'requestAccess') data = requestAccess_(input);
    else if (action === 'listRegistrationRequests') data = listRegistrationRequests_(input);
    else if (action === 'reviewRegistration') data = reviewRegistration_(input);
    else if (action === 'listProjects') data = listProjects_(input);
    else if (action === 'saveProject') data = saveProject_(input);
    else if (action === 'archiveProject') data = archiveProject_(input);
    else if (action === 'getSettings') data = getSettings_(input);
    else if (action === 'saveSettings') data = saveSettings_(input);
    else if (action === 'listMembers') data = listMembers_(input);
    else if (action === 'upsertMember') data = upsertMember_(input);
    else if (action === 'disableMember') data = disableMember_(input);
    else throw apiError_('ไม่รู้จักคำสั่งที่เรียกใช้', 'BAD_REQUEST');
    return json_({ ok: true, data: data });
  } catch (error) {
    return json_({ ok: false, error: error.message || 'ระบบทำงานไม่สำเร็จ', code: error.code || 'SERVER_ERROR' });
  }
}

function login_(input) {
  const claims = verifyCredential_(input.credential);
  const users = activeUsersForClaims_(claims);
  if (!users.length) {
    appendAudit_(claims.email, '', 'LOGIN', 'USER', claims.sub, 'DENIED', 'บัญชียังไม่ได้รับสิทธิ์หรือถูกระงับ');
    throw apiError_('บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน', 'ACCESS_DENIED');
  }
  const agencies = users.map(function (user) {
    const agency = agencyById_(user.agency_id);
    if (!agency || agency.status !== 'ACTIVE') return null;
    claimPendingUserId_(user, claims.sub);
    updateLastLogin_(user._row);
    return { id: agency.agency_id, name: agency.agency_name, role: user.role, rootFolderId: agency.root_folder_id || '' };
  }).filter(Boolean);
  if (!agencies.length) throw apiError_('หน่วยงานของบัญชีนี้ถูกระงับ', 'ACCESS_DENIED');
  appendAudit_(claims.email, agencies[0].id, 'LOGIN', 'USER', claims.sub, 'SUCCESS', 'เข้าสู่ระบบด้วย Google');
  return { user: { id: claims.sub, email: claims.email, name: claims.name || '' }, agencies: agencies };
}

function session_(input) {
  const auth = authorize_(input, []);
  return { user: auth.user, membership: { role: auth.role }, agency: auth.agency };
}

function listRegistrationAgencies_() {
  return rows_('AGENCIES').filter(function (row) {
    return row.status === 'ACTIVE';
  }).map(function (row) {
    return { id: row.agency_id, name: row.agency_name };
  });
}

function requestAccess_(input) {
  const claims = verifyCredential_(input.credential);
  const agencyId = cleanText_(input.agencyId, 120);
  const displayName = cleanText_(input.displayName || claims.name || claims.email, 160);
  const agency = agencyById_(agencyId);
  if (!agency || agency.status !== 'ACTIVE') throw apiError_('ไม่พบหน่วยงานที่เลือก', 'BAD_REQUEST');

  const alreadyActive = activeUsersForClaims_(claims).some(function (row) {
    return row.agency_id === agencyId;
  });
  if (alreadyActive) throw apiError_('บัญชีนี้มีสิทธิ์ในหน่วยงานนี้อยู่แล้ว', 'ALREADY_MEMBER');

  const existingPending = rows_('REGISTRATION_REQUESTS').find(function (row) {
    return normalizeEmail_(row.email) === claims.email && row.requested_agency_id === agencyId && row.status === 'PENDING';
  });
  if (existingPending) {
    return { id: existingPending.request_id, status: 'PENDING', email: claims.email, agencyId: agencyId };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const requestId = newId_('REQ');
    sheet_('REGISTRATION_REQUESTS').appendRow([
      requestId,
      claims.email,
      displayName,
      agencyId,
      'PENDING',
      new Date(),
      '',
      '',
      '',
      ''
    ]);
    appendAudit_(claims.email, agencyId, 'REGISTRATION_REQUEST', 'USER', requestId, 'SUCCESS', displayName);
    return { id: requestId, status: 'PENDING', email: claims.email, agencyId: agencyId };
  } finally {
    lock.releaseLock();
  }
}

function listRegistrationRequests_(input) {
  const auth = authorize_(input, ['ADMIN']);
  return rows_('REGISTRATION_REQUESTS').filter(function (row) {
    return row.requested_agency_id === auth.agency.id;
  }).map(function (row) {
    return {
      id: row.request_id,
      email: row.email,
      displayName: row.display_name,
      agencyId: row.requested_agency_id,
      status: row.status,
      requestedAt: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at || ''),
      reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : String(row.reviewed_at || ''),
      reviewedBy: row.reviewed_by || '',
      assignedRole: row.assigned_role || '',
      note: row.note || ''
    };
  }).sort(function (a, b) {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    return String(b.requestedAt).localeCompare(String(a.requestedAt));
  });
}

function reviewRegistration_(input) {
  const auth = authorize_(input, ['ADMIN']);
  const requestId = cleanText_(input.requestId, 120);
  const decision = String(input.decision || '').toUpperCase();
  const role = String(input.role || 'VIEWER').toUpperCase();
  const note = cleanText_(input.note || '', 500);
  if (['APPROVE', 'REJECT'].indexOf(decision) < 0) throw apiError_('ผลการพิจารณาไม่ถูกต้อง', 'BAD_REQUEST');
  if (decision === 'APPROVE' && USER_ROLES.indexOf(role) < 0) throw apiError_('บทบาทไม่ถูกต้อง', 'BAD_REQUEST');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const request = rows_('REGISTRATION_REQUESTS').find(function (row) {
      return row.request_id === requestId && row.requested_agency_id === auth.agency.id;
    });
    if (!request) throw apiError_('ไม่พบคำขอลงทะเบียน', 'NOT_FOUND');
    if (request.status !== 'PENDING') throw apiError_('คำขอนี้ถูกพิจารณาแล้ว', 'ALREADY_REVIEWED');

    const reviewedAt = new Date();
    if (decision === 'APPROVE') {
      const email = normalizeEmail_(request.email);
      const current = rows_('USERS').find(function (row) {
        return normalizeEmail_(row.email) === email && row.agency_id === auth.agency.id;
      });
      const values = [
        current ? current.user_id : 'PENDING:' + email,
        email,
        cleanText_(request.display_name || email, 160),
        auth.agency.id,
        role,
        'ACTIVE',
        current ? current.registered_at : reviewedAt,
        current ? current.last_login_at : ''
      ];
      if (current) sheet_('USERS').getRange(current._row, 1, 1, values.length).setValues([values]);
      else sheet_('USERS').appendRow(values);
    }

    const requestSheet = sheet_('REGISTRATION_REQUESTS');
    requestSheet.getRange(request._row, headerIndex_('REGISTRATION_REQUESTS', 'status')).setValue(decision === 'APPROVE' ? 'APPROVED' : 'REJECTED');
    requestSheet.getRange(request._row, headerIndex_('REGISTRATION_REQUESTS', 'reviewed_at')).setValue(reviewedAt);
    requestSheet.getRange(request._row, headerIndex_('REGISTRATION_REQUESTS', 'reviewed_by')).setValue(auth.user.email);
    requestSheet.getRange(request._row, headerIndex_('REGISTRATION_REQUESTS', 'assigned_role')).setValue(decision === 'APPROVE' ? role : '');
    requestSheet.getRange(request._row, headerIndex_('REGISTRATION_REQUESTS', 'note')).setValue(note);

    appendAudit_(auth.user.email, auth.agency.id, decision === 'APPROVE' ? 'REGISTRATION_APPROVE' : 'REGISTRATION_REJECT', 'USER', request.email, 'SUCCESS', decision === 'APPROVE' ? role : note);
    return { id: requestId, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', role: decision === 'APPROVE' ? role : '' };
  } finally {
    lock.releaseLock();
  }
}

function listProjects_(input) {
  const auth = authorize_(input, []);
  return rows_('PROJECTS').filter(function (row) {
    return row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email && row.status !== 'ARCHIVED' && String(row.project_id).indexOf('CFG-') !== 0;
  }).map(projectOutput_).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function saveProject_(input) {
  const auth = authorize_(input, EDIT_ROLES);
  const project = input.project || {};
  const name = cleanText_(project.name, 180);
  const fileId = cleanFileId_(project.fileId);
  if (!name || !fileId) throw apiError_('ข้อมูลโครงการไม่ครบ', 'BAD_REQUEST');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = rows_('PROJECTS');
    let current = project.id ? all.find(function (row) { return row.project_id === project.id && row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email; }) : null;
    const id = current ? current.project_id : newId_('PRJ');
    const values = [id, auth.agency.id, name, auth.user.email, fileId, cleanText_(project.fileName || name + '.json', 220), 'ACTIVE', current ? current.created_at : new Date(), new Date()];
    if (current) sheet_('PROJECTS').getRange(current._row, 1, 1, values.length).setValues([values]);
    else sheet_('PROJECTS').appendRow(values);
    appendAudit_(auth.user.email, auth.agency.id, current ? 'PROJECT_UPDATE' : 'PROJECT_CREATE', 'PROJECT', id, 'SUCCESS', name);
    return { id: id, fileId: fileId };
  } finally { lock.releaseLock(); }
}

function archiveProject_(input) {
  const auth = authorize_(input, ['ADMIN']);
  const current = rows_('PROJECTS').find(function (row) { return row.project_id === input.projectId && row.agency_id === auth.agency.id && normalizeEmail_(row.owner_email) === auth.user.email; });
  if (!current || String(current.project_id).indexOf('CFG-') === 0) throw apiError_('ไม่พบโครงการ', 'NOT_FOUND');
  sheet_('PROJECTS').getRange(current._row, headerIndex_('PROJECTS', 'status')).setValue('ARCHIVED');
  sheet_('PROJECTS').getRange(current._row, headerIndex_('PROJECTS', 'updated_at')).setValue(new Date());
  appendAudit_(auth.user.email, auth.agency.id, 'PROJECT_ARCHIVE', 'PROJECT', current.project_id, 'SUCCESS', current.project_name);
  return { id: current.project_id };
}

function getSettings_(input) {
  const auth = authorize_(input, []);
  const id = settingsId_(auth);
  const current = rows_('PROJECTS').find(function (row) { return row.project_id === id && row.agency_id === auth.agency.id && row.status !== 'ARCHIVED'; });
  return current ? projectOutput_(current) : null;
}

function saveSettings_(input) {
  const auth = authorize_(input, EDIT_ROLES);
  const fileId = cleanFileId_(input.fileId);
  if (!fileId) throw apiError_('ไม่พบไฟล์ตั้งค่าชุมชน', 'BAD_REQUEST');
  const id = settingsId_(auth);
  const current = rows_('PROJECTS').find(function (row) { return row.project_id === id && row.agency_id === auth.agency.id; });
  const values = [id, auth.agency.id, '__COMMUNITY_SETTINGS__', auth.user.email, fileId, 'community-settings.json', 'ACTIVE', current ? current.created_at : new Date(), new Date()];
  if (current) sheet_('PROJECTS').getRange(current._row, 1, 1, values.length).setValues([values]);
  else sheet_('PROJECTS').appendRow(values);
  appendAudit_(auth.user.email, auth.agency.id, 'SETTINGS_UPDATE', 'AGENCY', auth.agency.id, 'SUCCESS', 'บันทึกผังชุมชน');
  return { id: id, fileId: fileId };
}

function listMembers_(input) {
  const auth = authorize_(input, ['ADMIN']);
  return rows_('USERS').filter(function (row) { return row.agency_id === auth.agency.id; }).map(function (row) {
    return { id: row.user_id, email: row.email, displayName: row.display_name, role: row.role, status: row.status };
  });
}

function upsertMember_(input) {
  const auth = authorize_(input, ['ADMIN']);
  const member = input.member || {};
  const email = normalizeEmail_(member.email);
  const role = String(member.role || '').toUpperCase();
  if (!email || USER_ROLES.indexOf(role) < 0) throw apiError_('อีเมลหรือบทบาทไม่ถูกต้อง', 'BAD_REQUEST');
  const current = rows_('USERS').find(function (row) { return normalizeEmail_(row.email) === email && row.agency_id === auth.agency.id; });
  const values = [current ? current.user_id : 'PENDING:' + email, email, cleanText_(member.displayName || email, 160), auth.agency.id, role, 'ACTIVE', current ? current.registered_at : new Date(), current ? current.last_login_at : ''];
  if (current) sheet_('USERS').getRange(current._row, 1, 1, values.length).setValues([values]);
  else sheet_('USERS').appendRow(values);
  appendAudit_(auth.user.email, auth.agency.id, current ? 'MEMBER_UPDATE' : 'MEMBER_ADD', 'USER', email, 'SUCCESS', role);
  return { email: email, role: role, status: 'ACTIVE' };
}

function disableMember_(input) {
  const auth = authorize_(input, ['ADMIN']);
  const email = normalizeEmail_(input.email);
  if (email === normalizeEmail_(auth.user.email)) throw apiError_('ไม่สามารถระงับบัญชีที่กำลังใช้งานอยู่', 'BAD_REQUEST');
  const current = rows_('USERS').find(function (row) { return normalizeEmail_(row.email) === email && row.agency_id === auth.agency.id; });
  if (!current) throw apiError_('ไม่พบสมาชิก', 'NOT_FOUND');
  sheet_('USERS').getRange(current._row, headerIndex_('USERS', 'status')).setValue('DISABLED');
  appendAudit_(auth.user.email, auth.agency.id, 'MEMBER_DISABLE', 'USER', email, 'SUCCESS', 'ระงับสมาชิก');
  return { email: email, status: 'DISABLED' };
}

function authorize_(input, roles) {
  const claims = verifyCredential_(input.credential);
  const agencyId = String(input.agencyId || '');
  const user = activeUsersForClaims_(claims).find(function (row) { return row.agency_id === agencyId; });
  if (!user) throw apiError_('ไม่มีสิทธิ์ในหน่วยงานนี้', 'ACCESS_DENIED');
  const agencyRow = agencyById_(agencyId);
  if (!agencyRow || agencyRow.status !== 'ACTIVE') throw apiError_('หน่วยงานถูกระงับ', 'ACCESS_DENIED');
  if (roles.length && roles.indexOf(user.role) < 0) throw apiError_('บทบาทนี้ไม่มีสิทธิ์ดำเนินการ', 'ACCESS_DENIED');
  claimPendingUserId_(user, claims.sub);
  return { user: { id: claims.sub, email: claims.email, name: claims.name || user.display_name || '' }, role: user.role, agency: { id: agencyRow.agency_id, name: agencyRow.agency_name, rootFolderId: agencyRow.root_folder_id || '' } };
}

function verifyCredential_(credential) {
  if (!credential) throw apiError_('กรุณาเข้าสู่ระบบใหม่', 'AUTH_REQUIRED');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw apiError_('ผู้ดูแลยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID', 'SETUP_REQUIRED');
  const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, credential)).slice(0, 40);
  const cache = CacheService.getScriptCache();
  const cached = cache.get('idtoken:' + digest);
  if (cached) return JSON.parse(cached);
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw apiError_('บัญชีหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'AUTH_REQUIRED');
  const claims = JSON.parse(response.getContentText());
  if (claims.aud !== clientId || ['accounts.google.com', 'https://accounts.google.com'].indexOf(claims.iss) < 0 || String(claims.email_verified) !== 'true' || Number(claims.exp) * 1000 <= Date.now()) {
    throw apiError_('ข้อมูลยืนยันบัญชีไม่ถูกต้อง', 'AUTH_REQUIRED');
  }
  claims.email = normalizeEmail_(claims.email);
  cache.put('idtoken:' + digest, JSON.stringify(claims), 300);
  return claims;
}

function activeUsersForClaims_(claims) {
  return rows_('USERS').filter(function (row) {
    const userId = String(row.user_id || '');
    return row.status === 'ACTIVE' && (userId === claims.sub || (userId.indexOf('PENDING:') === 0 && normalizeEmail_(row.email) === claims.email));
  });
}

function claimPendingUserId_(user, sub) {
  if (String(user.user_id).indexOf('PENDING:') === 0) {
    sheet_('USERS').getRange(user._row, headerIndex_('USERS', 'user_id')).setValue(sub);
    user.user_id = sub;
  }
}

function updateLastLogin_(row) { sheet_('USERS').getRange(row, headerIndex_('USERS', 'last_login_at')).setValue(new Date()); }
function agencyById_(id) { return rows_('AGENCIES').find(function (row) { return row.agency_id === id; }); }

function rows_(name) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(function (row) { return row.some(function (value) { return value !== ''; }); }).map(function (row, index) {
    const result = { _row: index + 2 };
    headers.forEach(function (header, col) { result[header] = row[col]; });
    return result;
  });
}

function sheet_(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw apiError_('ไม่พบตาราง ' + name, 'SETUP_REQUIRED');
  return sheet;
}

function headerIndex_(sheetName, header) {
  const headers = sheet_(sheetName).getRange(1, 1, 1, sheet_(sheetName).getLastColumn()).getValues()[0].map(String);
  const index = headers.indexOf(header);
  if (index < 0) throw apiError_('ไม่พบคอลัมน์ ' + header, 'SETUP_REQUIRED');
  return index + 1;
}

function projectOutput_(row) {
  return { id: row.project_id, name: row.project_name, ownerEmail: row.owner_email, fileId: row.drive_file_id, fileName: row.file_name, status: row.status, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '') };
}

function settingsId_(auth) { return 'CFG-' + auth.agency.id + '-' + auth.user.id; }

function appendAudit_(email, agencyId, action, objectType, objectId, result, detail) {
  try { sheet_('AUDIT_LOG').appendRow([newId_('LOG'), new Date(), email, agencyId, action, objectType, objectId, result, cleanText_(detail, 500)]); }
  catch (_) {}
}

function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function cleanText_(value, max) { return String(value || '').trim().slice(0, max); }
function cleanFileId_(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : '';
}
function newId_(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase(); }
function apiError_(message, code) { const error = new Error(message); error.code = code; return error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
