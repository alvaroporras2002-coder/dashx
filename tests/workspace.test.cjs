const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(script => script.includes('const STORAGE_KEY = "dashwork_state_v1"'));
assert.ok(main, 'The final HTML contains its main application script');
const script = main.replace(/^\s*init\(\);\s*$/m, '\n/* Boot disabled only in the test harness. */\n');
const frozenNow = Date.parse('2026-11-02T18:00:00.000Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [frozenNow])); }
  static now() { return frozenNow; }
}

function harness() {
  const elements = new Map();
  const storage = new Map();
  const listeners = new Map();
  const noOp = () => {};
  const fakeElement = id => ({
    id, value:'', innerHTML:'', textContent:'', hidden:false, disabled:false,
    style:{setProperty:noOp,removeProperty:noOp}, dataset:{},
    classList:{add:noOp,remove:noOp,toggle:noOp,contains:()=>false},
    addEventListener:noOp,removeEventListener:noOp,setAttribute:noOp,getAttribute:()=>null,
    querySelector:()=>null,querySelectorAll:()=>[],appendChild:noOp,remove:noOp,
    closest:()=>null,focus:noOp,scrollIntoView:noOp,checkValidity:()=>true,
    click:noOp,getBoundingClientRect:()=>({width:100,height:100,top:0,left:0})
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id,fakeElement(id)); return elements.get(id); },
    querySelector:()=>null,querySelectorAll:()=>[],
    createElement:tag=>fakeElement(tag),
    addEventListener(type,handler) { if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler); },
    documentElement:fakeElement('html'),body:fakeElement('body'),hidden:false,activeElement:null
  };
  const window = {
    document,addEventListener:noOp,removeEventListener:noOp,scrollTo:noOp,open:noOp,
    matchMedia:()=>({matches:false,addEventListener:noOp}),
    location:{href:'https://example.test/dashx/',origin:'https://example.test'},
    navigator:{clipboard:{writeText:async()=>{}},userAgent:'Node integration test'},
    indexedDB:null,requestAnimationFrame:noOp
  };
  const context = vm.createContext({
    Date:FixedDate,document,window,location:window.location,navigator:window.navigator,
    console,URL,URLSearchParams,Blob,Intl,TextEncoder,TextDecoder,
    CSS:{escape:value=>String(value)},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    sessionStorage:{getItem:()=>null,setItem:noOp,removeItem:noOp},
    setTimeout:()=>1,clearTimeout:noOp,setInterval:()=>1,clearInterval:noOp,
    requestAnimationFrame:noOp,cancelAnimationFrame:noOp,confirm:()=>true,alert:noOp,
    performance:{now:()=>0},crypto:{randomUUID:()=> 'test-uuid'},
    Audio:function(){this.play=async()=>{}},Notification:function(){},
    getComputedStyle:()=>({getPropertyValue:()=>''}),
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')
  });
  vm.runInContext(script, context, {filename:'index.html#main',timeout:5000});
  const run = expression => vm.runInContext(expression,context,{timeout:5000});
  const fixture = {
    selectedUid:'a', settings:{userTz:'America/Costa_Rica',safeStart:'09:00',safeEnd:'20:00'},
    profile:{username:'Test AM',role:'Account Manager',avatar:'',avatarHistory:[]},
    merchants:[
      {uid:'a',store_name:'Alpha <test>',business_name:'Alpha',store_id:'101',business_id:'201',market_name:'Toronto',timezone:'America/Toronto',photo_coverage:25,dm_name:'A Manager',dm_email:'a@example.test',dm_phone:'+1 416 555 0101',archived:false},
      {uid:'b',store_name:'Beta',business_name:'Beta',store_id:'102',business_id:'202',market_name:'Vancouver',timezone:'America/Vancouver',photo_coverage:80,dm_name:'B Manager',dm_email:'b@example.test',dm_phone:'+1 604 555 0102',archived:false},
      {uid:'c',store_name:'Gamma',business_name:'Gamma',store_id:'103',business_id:'203',market_name:'Toronto',timezone:'',photo_coverage:null,dm_name:'',dm_email:'',dm_phone:'',archived:false},
      {uid:'archived',store_name:'Archived',store_id:'104',archived:true}
    ],
    merchantStates:{a:{promoStatus:'Discussed',cofundingStatus:'Requested'},b:{promoStatus:'Sold',cofundingStatus:'Approved'},c:{promoStatus:'Not tracked',cofundingStatus:'Not tracked'}},
    calls:[
      {id:'attempt-a',uid:'a',completedAt:'2026-11-02T16:00:00.000Z',state:'no_answer',disposition:'No Answer',durationSec:100,creditedSec:160},
      {id:'old-b',uid:'b',completedAt:'2026-10-30T16:00:00.000Z',state:'completed',disposition:'Completed Call',durationSec:80,creditedSec:140},
      {id:'unmatched',uid:'',completedAt:'2026-11-02T17:00:00.000Z',state:'completed',disposition:'Left Voicemail',durationSec:20,creditedSec:80}
    ],
    photos:[{id:'photo-a',uid:'a',timestamp:'2026-11-02T17:00:00.000Z',photosAdded:3,coverageBefore:25,coverageAfter:25}],
    videos:[{id:'video-a',uid:'a',timestamp:'2026-11-02T17:00:00.000Z',count:2,status:'In review',note:'Two clips'}],
    sales:[{id:'sale-a',uid:'a',timestamp:'2026-11-02T17:00:00.000Z',type:'Smart campaign',status:'Active',campaign:'Campaign A'}],
    credits:[{id:'credit-a',uid:'a',timestamp:'2026-11-02T17:00:00.000Z',amount:50,status:'Submitted'}],
    cases:[{id:'case-a',uid:'a',displayId:'CASE-A',externalCaseNumber:'SF-123',status:'Open',caseType:'am',am:{category:'Other'},caseUrl:'https://example.test/cases/123',createdDate:'2026-11-01',updatedAt:'2026-11-02T17:00:00.000Z',merchant:{name:'Alpha <test>'},statusHistory:[]}],
    followups:[
      {id:'fu-overdue',uid:'a',date:'2026-11-01',time:'10:00',reason:'General Follow-up',summary:'Review case SF-123',nextAction:'Check status',priority:'High',status:'Pending',tags:['case:case-a'],createdAt:'2026-10-30T17:00:00.000Z',updatedAt:'2026-10-30T17:00:00.000Z'},
      {id:'fu-today',uid:'b',date:'2026-11-02',time:'14:00',reason:'Relationship Touch',summary:'Call Beta',priority:'Medium',status:'Pending',tags:[],createdAt:'2026-11-01T17:00:00.000Z',updatedAt:'2026-11-01T17:00:00.000Z'},
      {id:'fu-next',uid:'c',date:'2026-11-03',time:'10:00',reason:'Photo Follow-up',summary:'Review photos',priority:'Low',status:'Pending',tags:[],createdAt:'2026-11-01T17:00:00.000Z',updatedAt:'2026-11-01T17:00:00.000Z'}
    ],
    unmatchedCalls:[{id:'match-1',callId:'unmatched',company:'Unknown',reason:'Needs review'}],
    ui:{workHubFilters:{},cleanMerchantOpen:false,cleanCrmVersion:1,workHubTab:'overview',logsTab:'calls'}
  };
  context.fixture = fixture;
  run('state = mergeState({...createDefaultState(),...fixture,settings:{...createDefaultState().settings,...fixture.settings},profile:{...createDefaultState().profile,...fixture.profile},ui:{...createDefaultState().ui,...fixture.ui}});');
  return {run,context,elements,listeners,storage,fixture};
}

test('manual call notes require all eleven responses, and a new video upload defaults to review', () => {
  const app=harness();
  const before=app.run('state.calls.length');
  app.run('state.merchantStates.a.outreachCallDraft={};saveManualCall()');
  assert.equal(app.run('state.calls.length'),before);
  app.run('state.merchantStates.a.outreachCallDraft={0:"Solve an Issue"};saveManualCall()');
  assert.equal(app.run('state.calls.length'),before);
  const markup=app.run('renderCleanVideo(selectedMerchant())');
  assert.match(markup,/<option value="In review" selected>/);
});

test('integrated main script renders every daily page and all six merchant sections', () => {
  const app=harness();
  assert.equal(app.run('typeof renderGlobalCases'),'function','Cases renderer is integrated');
  for(const renderer of ['renderDashboard','renderWorkHub','renderGlobalCases','renderActivity','renderResources','renderSettings']) {
    const result=app.run(`${renderer}()`);
    assert.equal(typeof result,'string',renderer);
    assert.ok(result.length>100,`${renderer} has substantive markup`);
    assert.ok(!/\bundefined\b/.test(result),`${renderer} does not render undefined fields`);
  }
  for(const view of ['dashboard','workhub','cases','activity','resources','settings']) {
    app.run(`state.ui.cleanMerchantOpen=false;state.currentView=${JSON.stringify(view)};renderApp({animate:false});`);
    assert.ok(app.elements.get('viewHost').innerHTML.length>100,`renderApp routes ${view}`);
  }
  app.run('setView("cases")');
  assert.equal(app.run('state.currentView'),'cases','Cases is registered for navigation');
  for(const tab of ['overview','note','photo','ads','cases','details']) {
    app.run(`state.ui.cleanMerchantOpen=true;state.ui.workHubTab=${JSON.stringify(tab)};`);
    assert.ok(app.run('renderWorkHub()').includes('Alpha &lt;test&gt;'),`merchant section ${tab} renders with escaped identity`);
  }
});

test('not-contacted queue uses this month and any attempt; 100% coverage leaves no called merchants in the queue', () => {
  const app=harness();
  assert.equal(app.run('merchantContactedThisMonth(getMerchant("a"))'),true,'No-answer attempt counts');
  assert.equal(app.run('merchantContactedThisMonth(getMerchant("b"))'),false,'Previous month does not count');
  assert.equal(app.run('JSON.stringify(crmMerchantQueue().map(m=>m.uid))'),'["c","b"]');
  app.run('state.calls.push({id:"b-month",uid:"b",completedAt:"2026-11-02T16:00:00Z"},{id:"c-month",uid:"c",completedAt:"2026-11-02T16:00:00Z"});');
  assert.equal(app.run('crmMerchantQueue().length'),0);
  assert.ok(app.run('renderWorkHub()').includes('No merchants match these filters'));
});

test('selected date, photo coverage, campaign, co-funding, call-window and due filters compose correctly', () => {
  const app=harness();
  const queue = filters => {
    app.context.filters=filters;
    return JSON.parse(app.run('state.ui.workHubFilters={view:"all",...filters};JSON.stringify(crmMerchantQueue().map(m=>m.uid).sort())'));
  };
  assert.deepEqual(queue({photoCoverage:'under50'}),['a']);
  assert.deepEqual(queue({photoCoverage:'50plus'}),['b']);
  assert.deepEqual(queue({photoCoverage:'nodata'}),['c']);
  assert.deepEqual(queue({lastInteraction:'today'}),['a']);
  assert.deepEqual(queue({lastInteraction:'oldermonth'}),['b']);
  assert.deepEqual(queue({lastInteraction:'none'}),['c']);
  assert.deepEqual(queue({campaign:'Discussed',cofunding:'Requested'}),['a']);
  assert.deepEqual(queue({campaign:'Discussed',cofunding:'Approved'}),[]);
  assert.deepEqual(queue({localTimeBand:'safe'}),['a','b']);
  assert.deepEqual(queue({due:'overdue'}),['a']);
  assert.deepEqual(queue({due:'today'}),['b']);
});

test('Today displays real call/photo/video figures and follow-ups, without scores or recommendations', () => {
  const app=harness();
  const stats=JSON.parse(app.run('JSON.stringify(dayStats("2026-11-02"))'));
  assert.equal(stats.attempts,2);assert.equal(stats.creditedSec,240);assert.equal(stats.photosAdded,3);
  const page=app.run('renderDashboard()');
  assert.ok(page.includes('2 follow-ups due'));
  assert.ok(page.includes('33%'));
  assert.ok(page.includes('Videos today'));
  assert.ok(page.includes('Review case SF-123'));
  assert.ok(!/Next best action|opportunity score|health score/i.test(page));
});

test('backup export and restore preserve identifiers and every operational collection, including videos', () => {
  const app=harness();
  app.run('globalThis.packageUnderTest=JSON.parse(JSON.stringify(buildWorkspacePackage()));globalThis.restoredUnderTest=mergeState(normalizeImportedWorkspaceData(packageUnderTest));');
  for(const collection of ['merchants','calls','photos','videos','sales','credits','cases','followups','unmatchedCalls','resources','links']) {
    assert.equal(app.run(`JSON.stringify(restoredUnderTest.${collection})`),app.run(`JSON.stringify(state.${collection})`),`${collection} survives backup roundtrip`);
  }
  assert.equal(app.run('restoredUnderTest.selectedUid'),'a');
  assert.equal(app.run('restoredUnderTest.merchantStates.a.cofundingStatus'),'Requested');
  assert.equal(app.run('restoredUnderTest.followups[0].tags[0]'),'case:case-a');
});

test('recording photos preserves coverage unless the actual percentage is supplied', () => {
  const app=harness();
  app.run('renderApp=()=>{};toast=()=>{};');
  app.elements.set('photoCountNow',{value:'5'});
  app.elements.set('confirmedPhotoCoverage',{value:''});
  app.elements.set('photoStatus',{value:'Needs Photos'});
  app.elements.set('photoNotes',{value:'Added five item photos'});
  app.run('savePhotoLog()');
  assert.equal(app.run('getMerchant("a").photo_coverage'),25);
  assert.equal(app.run('state.photos[0].photosAdded'),5);
  assert.equal(app.run('state.photos[0].coverageBefore'),25);
  assert.equal(app.run('state.photos[0].coverageAfter'),25);
  app.elements.get('confirmedPhotoCoverage').value='43.5';
  app.run('savePhotoLog()');
  assert.equal(app.run('getMerchant("a").photo_coverage'),43.5);
  assert.equal(app.run('state.photos[0].coverageAfter'),43.5);
});

test('case next review links to the case follow-up and global edit uses the case merchant', () => {
  const app=harness();
  assert.equal(app.run('cleanCaseReview(state.cases[0]).id'),'fu-overdue');
  const page=app.run('renderGlobalCases()');
  assert.ok(page.includes('SF-123'));assert.ok(page.includes('fu-overdue'));
  app.run('state.selectedUid="b";globalThis.editedCase=null;openCaseEditor=id=>{editedCase={id,uid:state.selectedUid};};bindCleanCases();');
  const target={closest:selector=>selector==='[data-crm-edit-case]'?{dataset:{crmEditCase:'case-a'}}:null};
  // The delegated handler is the only registered click handler that uses crmEditCase.
  const handler=app.listeners.get('click').find(fn=>String(fn).includes('crmEditCase'));
  assert.ok(handler);handler({target});
  assert.equal(app.run('editedCase.id'),'case-a');assert.equal(app.run('editedCase.uid'),'a');
});
