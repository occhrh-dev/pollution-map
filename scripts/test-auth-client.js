const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const values = new Map([['pollution-map-google-credential-v1', 'test-credential']]);
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
let responseData;
let request;
const context = {
  window: { POLLUTION_MAP_CONFIG: {
    googleClientId: 'test.apps.googleusercontent.com',
    appsScriptWebAppUrl: 'https://script.google.com/macros/s/test/exec'
  } },
  sessionStorage: storage,
  localStorage: storage,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: responseData }) };
  }
};
vm.runInNewContext(fs.readFileSync('auth-client.js', 'utf8'), context, { filename: 'auth-client.js' });

(async () => {
  responseData = [{ id: 'PRJ-1', name: 'Test project' }];
  const projects = await context.window.PollutionMapAuth.listProjects('AGY-1');
  assert.equal(projects.length, 1);
  assert.equal(request.action, 'listProjects');
  assert.equal(request.agencyId, 'AGY-1');

  responseData = { projects: [{ id: 'PRJ-1' }] };
  await assert.rejects(
    context.window.PollutionMapAuth.listProjects('AGY-1'),
    /ระบบกลางส่งรายการโครงการผิดรูปแบบ/
  );
  assert.equal(storage.getItem('pollution-map-google-credential-v1'), 'test-credential');
  console.log('Project-list response checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
