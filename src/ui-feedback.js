// Menu-only decoration. Never intercept pointer input, capture a pointer or delay an action.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const layer = document.createElement('div');
layer.className = 'ui-flight-layer';
layer.setAttribute('aria-hidden', 'true');
document.body.append(layer);
let flight;
function clearFlight() { flight?.cancel(); flight = null; layer.replaceChildren(); }
const menuActions = new Set(['start-ai', 'open-friends', 'start-training', 'entry-back']);
document.addEventListener('click', event => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled || !menuActions.has(button.id) || document.body.dataset.screen !== 'menu' || reducedMotion.matches) return;
  clearFlight();
  const rect = button.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const shuttle = document.createElement('div');
  shuttle.className = 'ui-flight';
  shuttle.style.left = `${Math.min(innerWidth - 44, Math.max(24, rect.right - 42))}px`;
  shuttle.style.top = `${Math.max(20, rect.top + rect.height / 2 - 22)}px`;
  shuttle.innerHTML = '<svg viewBox="0 0 56 64" fill="none"><path d="M21 43 6 10 16 5 25 40 21 2 31 2 31 40 38 5 48 10 35 43Z" fill="#fffef7" stroke="#7f9982" stroke-width="1.3" stroke-linejoin="round"/><path d="M21 42H35L34 51C33 60 23 60 22 51Z" fill="#fffef7" stroke="#7f9982" stroke-width="1.3"/><path d="M22 45H34" stroke="#37694c" stroke-width="3"/></svg>';
  layer.append(shuttle);
  const animation = shuttle.animate([
    { opacity: 0, transform: 'translate(-85px,15px) rotate(-120deg) scale(.7)' },
    { opacity: 1, transform: 'translate(-28px,-12px) rotate(-103deg)', offset: .35 },
    { opacity: 1, transform: 'translate(2px,-18px) rotate(-90deg)', offset: .65 },
    { opacity: 0, transform: 'translate(32px,-10px) rotate(-70deg) scale(.8)' },
  ], { duration: 440, easing: 'cubic-bezier(.2,.6,.3,1)' });
  flight = animation;
  animation.finished.then(() => { shuttle.remove(); if (flight === animation) flight = null; }).catch(() => shuttle.remove());
}, { capture: true });
reducedMotion.addEventListener('change', clearFlight);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearFlight(); });
new MutationObserver(() => { if (document.body.dataset.screen !== 'menu') clearFlight(); })
  .observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
