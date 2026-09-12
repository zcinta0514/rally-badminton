import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Small event-capable DOM fixture; browser layout and native modal focus trapping
// are checked separately in the page. Tests exercise the module's public UI API.
class Element extends EventTarget {
  constructor(tag, document) { super(); this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this._text='';this.className=''; }
  append(...nodes) { for(const node of nodes){node.parentElement=this;this.children.push(node);} }
  prepend(...nodes) { for(const node of nodes)node.parentElement=this;this.children.unshift(...nodes); }
  insertBefore(node, before) { node.parentElement=this;const index=this.children.indexOf(before);if(index<0)this.children.push(node);else this.children.splice(index,0,node); }
  replaceChildren(...nodes) { this.children=[];this._text='';this.append(...nodes); }
  set textContent(value) { this._text=String(value);this.children=[]; }
  get textContent() { return this._text+this.children.map(node=>node.textContent).join(''); }
  setAttribute(name,value) { this.attributes[name]=String(value);if(name==='id')this.id=value; }
  removeAttribute(name) { delete this.attributes[name]; }
  matches(selector) { if(selector.includes(' '))return this.matches(selector.split(' ').at(-1));if(selector==='dialog[open]')return this.tagName==='DIALOG'&&this.open;if(selector==='.dialog:not([hidden])')return this.className.split(' ').includes('dialog')&&!this.hidden;if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));return this.tagName===selector.toUpperCase(); }
  querySelectorAll(selector) { const selectors=selector.split(',').map(part=>part.trim());return this.children.flatMap(child=>[...(selectors.some(part=>child.matches(part))?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  contains(node) { return node===this||this.children.some(child=>child.contains(node)); }
  focus() { this.ownerDocument.activeElement=this; }
  showModal() { this.open=true;this.focus(); }
  close() { if(!this.open)return;this.open=false;this.dispatchEvent(new Event('close')); }
  click() { if(!this.disabled)this.dispatchEvent(new Event('click')); }
}
function fixture({values=new Map(),blocked=false}={}) {
  const document=new EventTarget();
  const storage={getItem:key=>{if(blocked)throw Error('denied');return values.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('denied');values.set(key,value);}};
  document.defaultView={localStorage:storage,matchMedia:()=>({matches:false})};
  document.createElement=tag=>new Element(tag,document);document.body=document.createElement('body');document.body.dataset.screen='menu';
  document.querySelectorAll=selector=>document.body.querySelectorAll(selector);document.querySelector=selector=>document.body.querySelector(selector);document.getElementById=id=>document.querySelector(`#${id}`);
  const add=(tag,id,parent=document.body,classes='')=>{const node=document.createElement(tag);node.id=id;node.className=classes;parent.append(node);return node;};
  const menu=add('main','menu');add('div','menu-footer',menu,'menu-foot');
  const backdrop=add('div','dialog-backdrop');backdrop.hidden=true;
  const help=add('section','help-dialog',backdrop,'dialog help-dialog');help.hidden=true;
  const other=add('section','friends-dialog',backdrop,'dialog');other.hidden=true;
  const loading=add('div','loading');loading.hidden=true;
  const opener=add('button','help');opener.focus();
  return {document,storage,values,help,other,backdrop,loading,opener,el:id=>document.getElementById(id)};
}
const moduleURL=new URL('../src/onboarding.js',import.meta.url);
async function setup(options={}) {
  const source=await import(moduleURL.href);const f=fixture(options);let practice=0;let allowed=true;
  const api=source.initOnboarding({document:f.document,storage:f.storage,canOpen:()=>allowed,onStartPractice:()=>practice++});
  return {...f,api,source,setAllowed:value=>{allowed=value;},get practice(){return practice;}};
}

test('onboarding module provides an entry point',async()=>{
  const exists=await readFile(moduleURL,'utf8').then(()=>true,()=>false);
  assert.equal(exists,true,'the first-run onboarding feature is not implemented');
});

test('automatic teaching waits for loading and other dialogs without consuming first-run eligibility',async()=>{
  const f=await setup();f.loading.hidden=false;assert.equal(f.api.maybeShow(),false);
  f.loading.hidden=true;f.other.hidden=false;f.backdrop.hidden=false;assert.equal(f.api.maybeShow(),false);
  f.other.hidden=true;f.backdrop.hidden=true;f.setAllowed(false);assert.equal(f.api.maybeShow(),false);
  f.setAllowed(true);assert.equal(f.api.maybeShow(),true);assert.equal(f.api.isOpen,true);
});

test('skipping or Escape marks this tutorial as seen and restores the original focus without starting play',async()=>{
  const values=new Map();const f=await setup({values});f.api.maybeShow();f.el('onboarding-skip').click();
  assert.equal(f.api.isOpen,false);assert.equal(f.document.activeElement,f.opener);assert.equal(f.practice,0);
  const reloaded=await setup({values});assert.equal(reloaded.api.maybeShow(),false);
  reloaded.api.open();const cancel=new Event('cancel',{cancelable:true});reloaded.el('onboarding-dialog').dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented,true);assert.equal(reloaded.api.isOpen,false);assert.equal(reloaded.practice,0);
});

test('three pages advance and go back; only the explicit practice action starts play',async()=>{
  const f=await setup();f.api.open();assert.match(f.el('onboarding-title').textContent,/先选/);assert.equal(f.el('onboarding-back').hidden,true);
  f.el('onboarding-next').click();assert.match(f.el('onboarding-title').textContent,/左手/);
  f.el('onboarding-back').click();assert.match(f.el('onboarding-title').textContent,/先选/);
  f.el('onboarding-next').click();f.el('onboarding-next').click();assert.match(f.el('onboarding-title').textContent,/右手/);
  assert.equal(f.practice,0);assert.equal(f.el('onboarding-practice').hidden,false);f.el('onboarding-practice').click();
  assert.equal(f.practice,1);assert.equal(f.api.isOpen,false);
});

test('replay from help preserves the underlying help dialog and never opens during a match',async()=>{
  const f=await setup();f.help.hidden=false;f.backdrop.hidden=false;
  assert.equal(f.api.maybeShow(),false);f.el('onboarding-replay').click();assert.equal(f.api.isOpen,true);
  f.api.close();assert.equal(f.help.hidden,false);assert.equal(f.backdrop.hidden,false);
  f.document.body.dataset.screen='match';assert.equal(f.api.open(),false);assert.equal(f.api.maybeShow(),false);
});

test('the text hint preference defaults on and persists independently from seen tutorial state',async()=>{
  const values=new Map();const f=await setup({values});assert.equal(f.el('operation-hints').checked,true);
  f.el('operation-hints').checked=false;f.el('operation-hints').dispatchEvent(new Event('change'));
  assert.equal(f.document.body.dataset.operationHints,'off');const reloaded=await setup({values});
  assert.equal(reloaded.el('operation-hints').checked,false);assert.equal(reloaded.document.body.dataset.operationHints,'off');assert.equal(reloaded.api.maybeShow(),true);
});

test('storage denial keeps teaching and hints usable and suppresses repeat prompts for this session',async()=>{
  const f=await setup({blocked:true});assert.equal(f.api.maybeShow(),true);f.api.close();assert.equal(f.api.maybeShow(),false);
  f.el('operation-hints').checked=false;assert.doesNotThrow(()=>f.el('operation-hints').dispatchEvent(new Event('change')));
  assert.equal(f.document.body.dataset.operationHints,'off');assert.equal(f.api.open(),true);
});

test('onboarding never navigates or changes the invitation URL',async()=>{
  const f=await setup();const invitation='https://rally.test/?room=ABCDE';
  Object.defineProperty(f.document.defaultView,'location',{get:()=>({href:invitation}),set:()=>assert.fail('tutorial must not navigate')});
  f.api.open();f.api.close();assert.equal(f.document.defaultView.location.href,invitation);
});

test('a queued native close event cannot reset a newly reopened tutorial',async()=>{
  const f=await setup();const modal=f.el('onboarding-dialog');
  modal.close=()=>{modal.open=false;queueMicrotask(()=>modal.dispatchEvent(new Event('close')));};
  f.api.open();f.api.close();f.api.open();await Promise.resolve();
  assert.equal(modal.open,true);assert.equal(f.api.isOpen,true);
});
