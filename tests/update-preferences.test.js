import test from 'node:test';
import assert from 'node:assert/strict';

const VERSION='0123456789abcdef', OTHER='fedcba9876543210';
const selection={version:VERSION,settings:{role:'power',difficulty:'hard',target:11,ruleset:'standard21',finale:'father-son'},sound:false};
function fixture(){const values=new Map();return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};}
const load=()=>import('../src/update-preferences.js');

test('an update also restores normalized local mix and light preferences once', async () => {
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load(); const f=fixture();
  saveUpdatePreferences({...selection,arena:{master:.25,hits:.8,movement:.1,crowd:.4,environment:0,lights:'soft'}},f.storage);
  const restored=restoreUpdatePreferences(VERSION,f.storage); assert.equal(restored.arena.master,.25); assert.equal('lights' in restored.arena,false);
  assert.equal(restoreUpdatePreferences(VERSION,f.storage),null);
});

test('an update snapshot keeps only match preferences and sound, and restores once for its target build',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load();const f=fixture();
  saveUpdatePreferences({...selection,playerKey:'private',room:'ABCDE'},f.storage);
  const saved=[...f.values.values()][0];assert.doesNotMatch(saved,/father-son|playerKey|private|ABCDE|finale/);
  assert.deepEqual(restoreUpdatePreferences(VERSION,f.storage),{settings:{role:'power',difficulty:'hard',target:11,ruleset:'standard21'},sound:false});
  assert.equal(f.values.size,0);assert.equal(restoreUpdatePreferences(VERSION,f.storage),null);
});

test('independent coach selection survives a safe update and invalid coaches are rejected',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load();
  for(const coachRole of ['balanced','swift','power']){
    const f=fixture();saveUpdatePreferences({...selection,settings:{...selection.settings,coachRole}},f.storage);
    const restored=restoreUpdatePreferences(VERSION,f.storage);
    assert.equal(restored.settings.role,'power');assert.equal(restored.settings.coachRole,coachRole);
  }
  const f=fixture();assert.throws(()=>saveUpdatePreferences({...selection,settings:{...selection.settings,coachRole:'unknown'}},f.storage));
});

test('friend preparation survives updates independently from AI settings and never preserves father-son selection',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load();const f=fixture();
  saveUpdatePreferences({...selection,settings:{...selection.settings,friendRole:'swift',friendTarget:5,friendRuleset:'quick'}},f.storage);
  const saved=restoreUpdatePreferences(VERSION,f.storage);
  assert.equal(saved.settings.role,'power');assert.equal(saved.settings.target,11);assert.equal(saved.settings.ruleset,'standard21');
  assert.equal(saved.settings.friendRole,'swift');assert.equal(saved.settings.friendTarget,5);assert.equal(saved.settings.friendRuleset,'quick');assert.equal('finale' in saved.settings,false);
  for(const change of [{friendRole:'unknown'},{friendTarget:7},{friendRuleset:'other'}])assert.throws(()=>saveUpdatePreferences({...selection,settings:{...selection.settings,...change}},fixture().storage));
});

test('ordinary starts remain unchanged and stale or malformed snapshots are discarded',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load();const f=fixture();
  assert.equal(restoreUpdatePreferences(VERSION,f.storage),null);
  saveUpdatePreferences(selection,f.storage);assert.equal(restoreUpdatePreferences(OTHER,f.storage),null);
  assert.equal(f.values.size,0,'a cancelled update cannot replay old choices during a later ordinary start');
  saveUpdatePreferences(selection,f.storage);const key=[...f.values.keys()][0];f.values.set(key,'{broken');
  assert.equal(restoreUpdatePreferences(VERSION,f.storage),null);assert.equal(f.values.size,0);
});

test('saving rejects invalid target versions, unknown choices, string scores and non-boolean sound',async()=>{
  const {saveUpdatePreferences}=await load();const f=fixture();
  const cases=[{...selection,version:''},{...selection,version:1234567890123456},{...selection,version:[VERSION]},{...selection,version:'https://evil.test'}, {...selection,sound:'false'}, {...selection,settings:null},
    ...[{role:'constructor'},{difficulty:'expert'},{target:'11'},{target:9},{ruleset:'unknown'}].map(change=>({...selection,settings:{...selection.settings,...change}}))];
  for(const value of cases)assert.throws(()=>saveUpdatePreferences(value,f.storage));
  assert.equal(f.values.size,0);
});

test('restoring validates stored fields before applying any of the preferences',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences}=await load();
  for(const mutate of [s=>s.sound='false',s=>s.settings.role='__proto__',s=>s.settings.difficulty='expert',s=>s.settings.target=22,s=>s.settings.ruleset='other',s=>s.schema=99]){
    const f=fixture();saveUpdatePreferences(selection,f.storage);const key=[...f.values.keys()][0],parsed=JSON.parse(f.values.get(key));mutate(parsed);f.values.set(key,JSON.stringify(parsed));
    assert.equal(restoreUpdatePreferences(VERSION,f.storage),null);assert.equal(f.values.size,0);
  }
});

test('storage failure or a silent dropped write rejects update preparation instead of pretending preferences are safe',async()=>{
  const {saveUpdatePreferences}=await load();
  for(const storage of [null,{}, {setItem(){throw Error('quota');},getItem(){return null;}},{setItem(){},getItem(){return null;}}]){
    assert.throws(()=>saveUpdatePreferences(selection,storage));
  }
});

test('storage denial keeps normal startup usable and failed consumption cannot repeatedly restore a snapshot',async()=>{
  const {saveUpdatePreferences,restoreUpdatePreferences,getUpdatePreferencesStorage}=await load();
  assert.equal(getUpdatePreferencesStorage({get sessionStorage(){throw Error('denied');}}),null);
  assert.equal(restoreUpdatePreferences(VERSION,null),null);
  assert.equal(restoreUpdatePreferences(VERSION,{getItem(){throw Error('denied');}}),null);
  const f=fixture();saveUpdatePreferences(selection,f.storage);
  assert.equal(restoreUpdatePreferences(VERSION,{...f.storage,removeItem(){throw Error('denied');}}),null);
  assert.equal(restoreUpdatePreferences(VERSION,{...f.storage,removeItem(){}}),null);
});
