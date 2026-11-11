// Presentation only. Navigation and match clocks never wait for an animation.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.getElementById('menu');
let entryAnimation, reveal;
let screen = document.body.dataset.screen;
function clearMotion() {
  entryAnimation?.cancel(); entryAnimation=null;
  reveal?.remove(); reveal=null;
}
new MutationObserver(() => {
  entryAnimation?.cancel();
  if (reducedMotion.matches || document.hidden || menu.hidden) return;
  entryAnimation=menu.animate([
    {opacity:.5,transform:'translateX(-7px)'},
    {opacity:1,transform:'translateX(0)'},
  ],{duration:180,easing:'ease-out'});
}).observe(menu,{attributes:true,attributeFilter:['data-entry']});
new MutationObserver(() => {
  const next=document.body.dataset.screen;
  if (next===screen) return;
  clearMotion(); screen=next;
  if (reducedMotion.matches || document.hidden || document.body.dataset.entering==='true') return;
  reveal=document.createElement('div');
  reveal.className='lobby-reveal';reveal.setAttribute('aria-hidden','true');
  const layer=reveal;
  layer.addEventListener('animationend',()=>{layer.remove();if(reveal===layer)reveal=null;},{once:true});
  document.body.append(layer);
}).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
reducedMotion.addEventListener('change',clearMotion);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMotion();});
