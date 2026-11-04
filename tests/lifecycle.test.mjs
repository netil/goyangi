import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
// Node 24+: node --test tests/lifecycle.test.mjs
// Runs only the real hooks' event handling. Engine and JSX rendering integration is checked separately.
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const source = fs.readFileSync(root + '/hooks/register.tsx', 'utf8');
// Drawing the panel (drawPanel) is JSX and can't run with type stripping alone. Only event handling is checked, so it's cut out.
const panelStart = source.indexOf('async function drawPanel(');
const withoutPanel = panelStart < 0 ? source : source.slice(0, panelStart) + source.slice(source.indexOf('export const register', panelStart));
let prefix = withoutPanel.slice(0, withoutPanel.indexOf("  on('ui.render'")) + '\n}';
prefix = prefix.replace("import { atom, read, update } from 'claude-code'", `const atom = (key, init) => ({...key, init});
const read = async ($, a) => $.values.has(a.key) ? $.values.get(a.key) : a.init;
const update = async ($, a, fn) => { const v = fn($.values.has(a.key) ? $.values.get(a.key) : a.init); $.values.set(a.key, v); return v; };`);
prefix = prefix.replaceAll("'./state'", JSON.stringify(new URL('../hooks/state.ts', import.meta.url).href));
const js = stripTypeScriptTypes(prefix);
const flush = () => new Promise(r => setImmediate(r));
async function setup() {
 const mod = await import('data:text/javascript;base64,' + Buffer.from(js + '\n//' + Math.random()).toString('base64'));
 const hooks = {};
 const on = (name, ...args) => { hooks[name] = args.at(-1); return { catch() {} }; };
 mod.register(on, {});
 const $ = {values:new Map(), session:{usage:async()=>({startedAt:1,cost:{usd:0},context:{percent:0},rateLimits:[]})}, ui:{toast(){},open:async()=>{}},store:{set:async()=>{},get:async()=>undefined},command:{register:async()=>{}},env:{get:async()=>undefined},process:{run:async()=>({stdout:""})},clock:{every:(_,fn)=>{$.timer=fn}}};
 return {$,hooks};
}
test('a delayed cost lookup updates only its original turn and archive', async () => {
 const {$,hooks:h}=await setup();
 const start=id=>h['turn.start']($,{turnId:id,text:id},async()=>({}));
 await start('t1');
 let calls=0, release;
 $.session.usage=async()=>{if(++calls===2) await new Promise(r=>release=r);return {startedAt:1,cost:{usd:calls===1?0:1},context:{percent:0},rateLimits:[]}};
 const g=h['turn.step']($,{turnId:'t1',index:0,model:'m'},async function*(){return {usage:{input_tokens:10,output_tokens:2},stopReason:'end_turn',toolUses:[]}});
 await g.next();
 await h['turn.complete']($,{turnId:'t1',reason:'answer',durationMs:1},async()=>({}));
 await flush();
 await start('t2');
 release();await flush();
 const t=$.values.get('tree');
 assert.equal(t.turns[0].cost,1);
 assert.equal(t.turns[1].cost,undefined);assert.equal(t.turn.steps,0);
 const step=$.values.get('archive').t1.flow.find(x=>x.kind==='step');
 assert.equal(typeof step.endedAt,'number');
 assert.equal(step.tokIn,10);assert.equal(step.cost,1);
});
for (const reason of ['answer', 'error']) test(`agent ended before the spawn result: ${reason}`, async () => {
 const {$,hooks:h}=await setup();
 await h['turn.start']($,{turnId:'t1',text:'q'},async()=>({}));
 await h['agent.spawn']($,{subagentType:'Explore',description:'test'},async()=>{
  await h['turn.complete']($,{agentId:'a',reason},async()=>({}));
  await flush();return {agentId:'a',model:'m'};
 });
 await flush();const t=$.values.get('tree');
 const agent=t.flow.find(x=>x.kind==='agent');
 assert.equal(t.agents[0].status,reason==='answer'?'done':'failed');
 assert.equal(agent.endedAt,t.agents[0].endedAt);
 assert.equal(typeof agent.endedAt,'number');assert.equal(agent.ok,reason==='answer');
});
test('an agent that expires with no further events stops the animation', async () => {
 const {$,hooks:h}=await setup();
 await h['session.start']($,{},async()=>({}));
 await h['agent.spawn']($,{subagentType:'Explore',description:'test'},async()=>({agentId:'a'}));await flush();
 const real=Date.now;Date.now=()=>real()+11*60_000;
 try { await $.timer();await flush();assert.equal($.values.get('tick'),undefined); } finally { Date.now=real; }
 await h['turn.start']($,{turnId:'new',text:'q'},async()=>({}));
 await $.timer();await flush();assert.equal($.values.get('tick'),1);
});

test('a cost lookup from before /clear doesn\'t update the new session', async () => {
 const {$,hooks:h}=await setup();
 await h['turn.start']($,{turnId:'old',text:'q'},async()=>({}));
 let calls=0, release;
 $.session.usage=async()=>{
  const call=++calls;
  if(call===2) await new Promise(r=>release=r);
  return {startedAt:call<3?1:2,cost:{usd:call===2?5:0},context:{percent:0},rateLimits:[]};
 };
 const g=h['turn.step']($,{turnId:'old',index:0,model:'m'},async function*(){return {usage:null,stopReason:'end_turn',toolUses:[]}});
 await g.next();
 await h['session.end']($,{reason:'clear'},async()=>({}));
 await h['turn.start']($,{turnId:'new',text:'q'},async()=>({}));
 release();await flush();
 const t=$.values.get('tree');
 assert.deepEqual(t.turns.map(x=>x.id),['new']);
 assert.equal(t.turns[0].cost,undefined);assert.equal(t.main.steps,0);
 assert.deepEqual($.values.get('archive'),{});
});

test('request completion is recorded even when the cost lookup fails or the model errors', async () => {
 const {$,hooks:h}=await setup();
 await h['turn.start']($,{turnId:'t1',text:'q'},async()=>({}));
 $.session.usage=async()=>{throw new Error('usage unavailable')};
 const g=h['turn.step']($,{turnId:'t1',index:0,model:'m'},async function*(){throw new Error('model failed')});
 await assert.rejects(g.next(),/model failed/);
 await flush();
 const t=$.values.get('tree');
 const step=t.flow.find(x=>x.kind==='step');
 assert.equal(step.ok,false);assert.equal(typeof step.endedAt,'number');
 assert.equal(t.main.status,'idle');assert.equal(t.turn.steps,1);
});

// The second turn completes before the first usage snapshot is delivered.
test('cost responses arriving in reverse order keep each turn\'s cost', async () => {
 const {$,hooks:h}=await setup();
 let total=0, defer=false, release;
 $.session.usage=async()=>{
  const snapshot=total;
  if(defer) { defer=false; await new Promise(r=>release=r); }
  return {startedAt:1,cost:{usd:snapshot},context:{percent:0},rateLimits:[]};
 };
 const start=id=>h['turn.start']($,{turnId:id,text:id},async()=>({}));
 const step=id=>h['turn.step']($,{turnId:id,index:0,model:'m'},async function*(){
  total=id==='t1'?1:3;
  if(id==='t1') defer=true;
  return {usage:null,stopReason:'end_turn',toolUses:[]};
 });
 await start('t1'); await step('t1').next();
 await h['turn.complete']($,{turnId:'t1',reason:'answer',durationMs:1},async()=>({}));
 await flush();
 await start('t2'); await step('t2').next(); await flush();
 release(); await flush();
 const costs=$.values.get('tree').turns.map(t=>t.cost);
 assert.equal($.values.get('archive').t1.flow.find(x=>x.kind==='step').cost,1);
 assert.equal($.values.get('tree').flow.find(x=>x.kind==='step').cost,2);
 assert.deepEqual(costs,[1,2]);
});

test('settlement after /clear doesn\'t wait for the previous session\'s pending lookups', async () => {
 const {$,hooks:h}=await setup();
 let total=0, defer=false, release;
 $.session.usage=async()=>{
  const snapshot=total;
  if(defer) { defer=false; await new Promise(r=>release=r); }
  return {startedAt:1,cost:{usd:snapshot},context:{percent:0},rateLimits:[]};
 };
 const start=id=>h['turn.start']($,{turnId:id,text:id},async()=>({}));
 const step=(id,cost)=>h['turn.step']($,{turnId:id,index:0,model:'m'},async function*(){
  total=cost;
  if(id==='old') defer=true;
  return {usage:null,stopReason:'end_turn',toolUses:[]};
 });
 await start('old'); await step('old',5).next();
 total=0;
 await h['session.end']($,{reason:'clear'},async()=>({}));
 await flush();
 await start('new'); await step('new',2).next();await flush();
 assert.equal($.values.get('tree').turns[0].cost,2);
 release();await flush();
 assert.equal($.values.get('tree').turns[0].cost,2);
});

test('an earlier failed cost lookup doesn\'t block the next settlement', async () => {
 const {$,hooks:h}=await setup();
 let calls=0;
 $.session.usage=async()=>{
  const call=++calls;
  if(call===2) throw new Error('usage unavailable');
  return {startedAt:1,cost:{usd:call===1?0:2},context:{percent:0},rateLimits:[]};
 };
 await h['turn.start']($,{turnId:'t1',text:'q'},async()=>({}));
 for(const index of [0,1]) {
  const g=h['turn.step']($,{turnId:'t1',index,model:'m'},async function*(){return {usage:null,stopReason:'end_turn',toolUses:[]}});
  await g.next();
 }
 await flush();
 assert.equal($.values.get('tree').turns[0].cost,2);
 assert.equal($.values.get('tree').turn.steps,2);
});
