// Presentation only: choices still take effect immediately in the game UI.
const menu = document.getElementById('menu');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const groups = [...menu.querySelectorAll('.segments')].map(element => {
  const line = document.createElement('span');
  line.className = 'selection-indicator';
  line.setAttribute('aria-hidden', 'true');
  element.append(line);
  return { element, line, target: null, animation: null };
});
let frame = 0, resizing = false;

function schedule(resize = false) {
  resizing ||= resize;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const group of groups) {
      const { element, line } = group;
      const selected = element.querySelector('button.selected');
      const bounds = element.getBoundingClientRect();
      if (!selected || !bounds.width || !bounds.height) {
        group.target = null;
        group.animation?.cancel();
        continue;
      }
      const button = selected.getBoundingClientRect();
      const target = { transform: `translateX(${button.left - bounds.left}px)`, width: `${button.width}px` };
      if (group.target?.transform === target.transform && group.target?.width === target.width) continue;
      const current = getComputedStyle(line);
      const from = { transform: current.transform, width: current.width };
      group.animation?.cancel();
      Object.assign(line.style, target);
      element.classList.add('selection-motion');
      if (group.target && !resizing && !reduced.matches) {
        group.animation = line.animate([from, target], {
          duration: 260, easing: 'cubic-bezier(.22,.61,.36,1)',
        });
      }
      group.target = target;
    }
    resizing = false;
  });
}

new MutationObserver(() => schedule()).observe(menu, { subtree: true, attributes: true,
  attributeFilter: ['class', 'aria-pressed', 'hidden', 'open', 'data-entry'] });
const resizeObserver = new ResizeObserver(() => schedule(true));
for (const { element } of groups) resizeObserver.observe(element);
reduced.addEventListener('change', () => {
  for (const group of groups) group.animation?.cancel();
  schedule(true);
});
schedule(true);
