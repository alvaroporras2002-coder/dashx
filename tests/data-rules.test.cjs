const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const fixes = html.slice(html.indexOf('// Keep these helpers in the same script scope'), html.indexOf('// Dense daily workspace.'));
assert.ok(fixes.includes('function crmCallIdentity'), 'Test the helpers embedded in the shipped HTML');

// Execute the production functions, without booting or mocking the browser app.
function productionFunction(name) {
  const start = html.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `Production function ${name} exists`);
  const end = html.indexOf('\n  function ', start + 1);
  assert.notEqual(end, -1, `Production function ${name} has a following declaration`);
  return html.slice(start, end);
}

function workspace() {
  let sequence = 0;
  const context = vm.createContext({
    state: { settings: { userTz: 'America/Costa_Rica' }, calls: [], unmatchedCalls: [], importHistory: [], merchants: [], merchantStates: {} },
    uid: prefix => `${prefix}_${++sequence}`,
    snapshotForUndo: () => ({}),
    matchCallToMerchant: call => ({ uid: call.prospectCompany === 'Known Merchant' ? 'mx_1' : '', method: 'test assignment', confidence: 100 }),
    scheduleSave: () => {}, renderApp: () => {}, toast: () => {}
  });
  const mapStart = html.indexOf('  const CALL_HEADER_MAP = ');
  const mapEnd = html.indexOf('\n  const TIMEZONE_ALIASES', mapStart);
  vm.runInContext(html.slice(mapStart, mapEnd), context);
  const names = ['normalizeHeader','digits','numberValue','unique','dateKeyInZone','callsFor','parseCSV','rowsToObjects','parseCallDate','callPhones','normalizeCall','importCallsText'];
  names.forEach(name => vm.runInContext(productionFunction(name), context));
  vm.runInContext(fixes, context);
  return context;
}

test('monthly coverage uses the Costa Rica calendar boundary and any call result', () => {
  const app = workspace();
  const merchant = { uid: 'mx_1' };
  app.state.calls.push({ id:'oct', uid:'mx_1', completedAt:'2026-11-01T05:59:59.000Z', disposition:'No Answer' });
  assert.equal(app.merchantContactedThisMonth(merchant, new Date('2026-11-02T18:00:00Z')), false);
  app.state.calls.push({ id:'nov', uid:'mx_1', completedAt:'2026-11-01T06:00:00.000Z', state:'failed', disposition:'No Answer', durationSec:0 });
  assert.equal(app.merchantContactedThisMonth(merchant, new Date('2026-11-02T18:00:00Z')), true);
  assert.equal(app.merchantIsUntouched(merchant, new Date('2026-11-02T18:00:00Z')), false);
  assert.equal(app.merchantCalledRecently(merchant, new Date('2026-12-02T18:00:00Z')), false);
});

test('a manual Called status and an unmatched call do not inflate merchant coverage', () => {
  const app = workspace();
  app.state.merchantStates.mx_1 = { status:'Called', statusDate:'2026-11-02' };
  app.state.calls.push({ id:'unmatched', uid:'', completedAt:'2026-11-02T18:00:00Z' });
  assert.equal(app.merchantContactedThisMonth({uid:'mx_1'}, new Date('2026-11-02T18:00:00Z')), false);
});

test('invalid dates are rejected and valid Outreach timezone dates are preserved', () => {
  const app = workspace();
  assert.equal(app.crmValidCallRowDate({completed_at:'2026-02-30T12:00:00Z'}), '');
  assert.equal(app.crmValidCallRowDate({completed_at:'not a date',created_at:'2026-11-02T12:00:00Z'}), '');
  assert.equal(app.crmValidCallRowDate({}), '');
  assert.equal(app.crmValidCallRowDate({created_at:'Nov 2 2026 12:00:00 PM CST'}), '2026-11-02T18:00:00.000Z');
  assert.equal(app.crmValidCallRowDate({completed_at:'Feb 29 2024 12:00:00 AM EST'}), '2024-02-29T05:00:00.000Z');
  assert.equal(app.crmValidCallRowDate({completed_at:'Feb 29 2026 12:00:00 AM EST'}), '');
});

test('fallback identity is stable across reimports and note edits, and separates attempts', () => {
  const app = workspace();
  const call = { created_at:'2026-11-02T18:00:00Z',completed_at:'2026-11-02T18:01:00Z',from:'+1 555 000 1111',to:'+1 555 000 2222',prospect_id:'prospect_1' };
  assert.equal(app.crmCallIdentity({...call,id:' 42 '}), '42');
  assert.equal(app.crmCallIdentity(call), app.crmCallIdentity({...call,note:'Updated note',disposition:'No Answer',duration_seconds:'30'}));
  assert.notEqual(app.crmCallIdentity(call), app.crmCallIdentity({...call,completed_at:'2026-11-02T18:02:00Z'}));
});

test('the production CSV importer deduplicates repeated IDs without adding credited time', () => {
  const app = workspace();
  const csv = 'ID,State,Created At,Completed At,Duration in Seconds,Prospect Company\ncall-1,completed,2026-11-02T18:00:00Z,2026-11-02T18:02:00Z,120,Known Merchant\ncall-1,completed,2026-11-02T18:00:00Z,2026-11-02T18:02:00Z,120,Known Merchant';
  const first = app.importCallsText(csv, 'outreach.csv');
  assert.equal(first.imported, 1);
  assert.equal(first.duplicates, 1);
  assert.equal(first.creditedSec, 180);
  const second = app.importCallsText(csv, 'outreach.csv');
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates, 2);
  assert.equal(second.creditedSec, 0);
  assert.equal(app.state.calls.length, 1);
  assert.equal(app.state.calls[0].uid, 'mx_1');
  assert.equal(app.state.calls[0].creditedSec, 180);
});

test('CSV rows without IDs deduplicate across imports while distinct attempts remain separate', () => {
  const app=workspace();
  const csv='State,Created At,Completed At,Duration in Seconds,Prospect Company,To\ncompleted,2026-11-02T18:00:00Z,2026-11-02T18:02:00Z,120,Known Merchant,15550002222\nno_answer,2026-11-02T18:05:00Z,2026-11-02T18:05:20Z,20,Known Merchant,15550002222';
  assert.equal(app.importCallsText(csv).imported,2);
  assert.equal(app.importCallsText(csv).imported,0);
  assert.equal(app.state.calls.length,2);
  assert.equal(app.state.calls.reduce((sum,c)=>sum+c.creditedSec,0),200);
});

test('an invalid date aborts the CSV before adding any rows or import history', () => {
  const app=workspace();
  const csv='ID,State,Completed At,Duration in Seconds\nvalid,completed,2026-11-02T18:00:00Z,30\ninvalid,completed,not-a-date,30';
  assert.throws(()=>app.importCallsText(csv),/CSV row 3/);
  assert.equal(app.state.calls.length,0);
  assert.equal(app.state.importHistory.length,0);
});

test('future calls do not count as contact attempts until their actual time', () => {
  const app=workspace();
  app.state.calls.push({id:'future',uid:'mx_1',completedAt:'2026-11-20T18:00:00Z'});
  assert.equal(app.merchantContactedThisMonth({uid:'mx_1'},new Date('2026-11-02T18:00:00Z')),false);
});
