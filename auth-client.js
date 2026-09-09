(function () {
  'use strict';

  const CREDENTIAL_KEY = 'pollution-map-google-credential-v1';
  const SESSION_KEY = 'pollution-map-google-session-v1';
  const DRIVE_TOKEN_KEY = 'pollution-map-drive-token-v1';
  const config = () => window.POLLUTION_MAP_CONFIG || {};

  function configured() {
    const current = config();
    return /\.apps\.googleusercontent\.com$/i.test(current.googleClientId || '') &&
      /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(current.appsScriptWebAppUrl || '');
  }

  function readJson(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  function credential() { return sessionStorage.getItem(CREDENTIAL_KEY) || ''; }
  function session() { return readJson(SESSION_KEY); }
  function setLogin(googleCredential, loginSession) {
    sessionStorage.setItem(CREDENTIAL_KEY, googleCredential);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loginSession));
  }
  function clearLogin() {
    sessionStorage.removeItem(CREDENTIAL_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DRIVE_TOKEN_KEY);
  }

  async function api(action, payload = {}) {
    if (!configured()) throw new Error('ยังไม่ได้ตั้งค่า Google Login');
    const response = await fetch(config().appsScriptWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, credential: credential(), ...payload }),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`เซิร์ฟเวอร์ตอบกลับ ${response.status}`);
    const result = await response.json();
    if (!result.ok) {
      if (result.code === 'AUTH_REQUIRED') clearLogin();
      const error = new Error(result.error || 'ดำเนินการไม่สำเร็จ');
      error.code = result.code || 'API_ERROR';
      throw error;
    }
    return result.data;
  }

  function savedDriveToken() {
    const saved = readJson(DRIVE_TOKEN_KEY);
    if (!saved || !saved.accessToken || Date.now() >= Number(saved.expiresAt || 0) - 60000) return null;
    return saved;
  }

  function waitForGoogle(timeoutMs = 10000) {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('โหลดบริการ Google ไม่สำเร็จ')); }
      }, 100);
    });
  }

  async function requestDriveToken() {
    const saved = savedDriveToken();
    if (saved) return saved.accessToken;
    await waitForGoogle();
    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config().googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: response => {
          if (response.error || !response.access_token) { reject(new Error('ไม่ได้รับสิทธิ์ Google Drive')); return; }
          const token = { accessToken: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000 };
          sessionStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(token));
          resolve(token.accessToken);
        },
        error_callback: () => reject(new Error('หน้าต่างขอสิทธิ์ Google Drive ถูกปิด'))
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  async function driveFetch(url, options = {}) {
    const token = await requestDriveToken();
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    if (response.status === 401) { sessionStorage.removeItem(DRIVE_TOKEN_KEY); throw new Error('สิทธิ์ Google Drive หมดอายุ กรุณาลองอีกครั้ง'); }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch (_) {}
      throw new Error(detail || `Google Drive ตอบกลับ ${response.status}`);
    }
    return response;
  }

  async function ensureAgencyFolder(agencyId, agencyName) {
    const cacheKey = `pollution-map-drive-folder-${agencyId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
    const safeId = String(agencyId).replace(/'/g, "\\'");
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='pollutionMapAgency' and value='${safeId}' }`);
    const list = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)&pageSize=10`);
    const matches = (await list.json()).files || [];
    let folderId = matches[0]?.id;
    if (!folderId) {
      const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Pollution Map - ${agencyName || agencyId}`, mimeType: 'application/vnd.google-apps.folder', appProperties: { pollutionMapAgency: String(agencyId) } })
      });
      folderId = (await created.json()).id;
    }
    localStorage.setItem(cacheKey, folderId);
    return folderId;
  }

  async function saveJsonFile({ fileId = '', fileName, data, agencyId, agencyName }) {
    const json = JSON.stringify(data);
    if (fileId) {
      const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: json
      });
      return response.json();
    }
    const folderId = await ensureAgencyFolder(agencyId, agencyName);
    const boundary = `pollution_map_${Date.now().toString(36)}`;
    const metadata = { name: fileName, parents: [folderId], mimeType: 'application/json', appProperties: { pollutionMapAgency: String(agencyId) } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n--${boundary}--`;
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    });
    return response.json();
  }

  async function loadJsonFile(fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    return response.json();
  }
  async function trashDriveFile(fileId) {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true })
    });
  }

  window.PollutionMapAuth = {
    configured, credential, session, setLogin, clearLogin, api,
    requestDriveToken, saveJsonFile, loadJsonFile, trashDriveFile,
    hasDriveToken: () => !!savedDriveToken()
  };
})();
