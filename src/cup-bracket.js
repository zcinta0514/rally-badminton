import { roundLabel } from './cup-draw.js';

const CARD_WIDTH = 162;
const CARD_HEIGHT = 50;
const COLUMN_STEP = 198;
const ROW_STEP = 66;
const PADDING = 9;

const html = value => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);

// A later-round slot is sourced only from its two immediate feeders. This
// matters on elimination, when other winners exist but no next round was played.
export function bracketRounds(cup) {
  const rounds = [];
  for (let count = cup.players.length / 2; count >= 1; count /= 2) {
    const r = rounds.length;
    const previous = rounds[r - 1];
    const round = Array.from({length: count}, (_, i) => {
      const recorded = cup.rounds[r]?.[i];
      const match = recorded || {a: previous[2*i].winner, b: previous[2*i+1].winner, winner: null};
      return {...match, recorded: Boolean(recorded), x: PADDING + r * COLUMN_STEP,
        y: PADDING + ((i + 0.5) * 2 ** r) * ROW_STEP, key: r + '-' + i};
    });
    rounds.push(round);
  }
  return rounds;
}

function slot(cup, id, winner, final) {
  if (id == null) return '<div class="cb-slot cb-empty">待定</div>';
  const won = winner === id;
  const outcome = won ? (final ? '冠军' : '胜') : '';
  const label = html(cup.players[id].name);
  return '<div class="cb-slot' + (won ? ' cb-won' : '') + (id === 0 ? ' cb-self' : '') + '">' +
    '<span title="' + label + '">' + label + '</span>' + (id === 0 ? '<small>我</small>' : '') +
    (outcome ? '<b>' + outcome + '</b>' : '') + '</div>';
}

export function bracketMarkup(cup) {
  const rounds = bracketRounds(cup);
  const width = PADDING * 2 + (rounds.length - 1) * COLUMN_STEP + CARD_WIDTH;
  const height = PADDING * 2 + rounds[0].length * ROW_STEP;
  const origin = rounds[0].findIndex(m => m.a === 0 || m.b === 0);
  const titles = [], cards = [], connectors = [], options = [];
  for (const [r, round] of rounds.entries()) {
    const myIndex = Math.floor(origin / 2 ** r);
    const label = roundLabel(round.length * 2);
    titles.push('<span style="left:' + round[0].x + 'px">' + label + '</span>');
    options.push('<option value="' + r + '-' + myIndex + '"' + (r === cup.roundIndex ? ' selected' : '') + '>' + label + '</option>');
    for (const [i, match] of round.entries()) {
      const mine = match.a === 0 || match.b === 0;
      const current = mine && r === cup.roundIndex;
      cards.push('<div role="group" aria-label="' + label + '第' + (i+1) + '场" class="cb-match' +
        (mine ? ' cb-mine' : '') + (current ? ' cb-current' : '') + '" data-node="' + match.key + '"' +
        (current ? ' data-cb-current' : '') + ' style="left:' + match.x + 'px;top:' + (match.y-CARD_HEIGHT/2) + 'px">' +
        slot(cup,match.a,match.winner,round.length===1) + slot(cup,match.b,match.winner,round.length===1) + '</div>');
      const next = rounds[r+1]?.[Math.floor(i/2)];
      if (!next) continue;
      const start = match.x + CARD_WIDTH;
      const endY = next.y + (i % 2 ? 1 : -1) * CARD_HEIGHT / 4;
      const d = 'M' + start + ' ' + match.y + ' H' + ((start+next.x)/2) + ' V' + endY + ' H' + next.x;
      connectors.push('<path data-from="' + match.key + '" data-to="' + next.key + '" class="' +
        (match.winner===0?'cb-route':match.winner==null?'cb-pending':'cb-decided') + '" d="' + d + '"/>');
    }
  }
  return '<div class="cup-bracket" style="--cb-card-width:' + CARD_WIDTH + 'px;--cb-card-height:' + CARD_HEIGHT + 'px">' +
    '<div class="cb-tools"><label>轮次 <select class="cb-jump">' + options.join('') +
    '</select></label><button type="button" class="cb-locate">定位我的对阵</button></div>' +
    '<div class="cb-scroll" tabindex="0" role="region" aria-label="完整淘汰签表，可上下左右滚动">' +
    '<div class="cb-sheet" style="width:' + width + 'px"><div class="cb-labels">' + titles.join('') + '</div>' +
    '<div class="cb-map" style="height:' + height + 'px"><svg aria-hidden="true" focusable="false" width="' +
    width + '" height="' + height + '">' + connectors.join('') + '</svg>' + cards.join('') + '</div></div></div></div>';
}

export function mountBracket(container) {
  const bracket = container.querySelector('.cup-bracket');
  if (!bracket) return;
  const viewport = bracket.querySelector('.cb-scroll');
  const jump = bracket.querySelector('.cb-jump');
  const current = bracket.querySelector('[data-cb-current]');
  function center(node) {
    if (!node || !viewport.clientHeight) return;
    const box = viewport.getBoundingClientRect(), match = node.getBoundingClientRect();
    const header = bracket.querySelector('.cb-labels').offsetHeight;
    viewport.scrollLeft += match.left - box.left - (viewport.clientWidth - match.width)/2;
    viewport.scrollTop += match.top - box.top - (header + viewport.clientHeight - match.height)/2;
  }
  function locate() {
    if (current) jump.value = current.dataset.node;
    center(current);
  }
  bracket.querySelector('.cb-locate').addEventListener('click', locate);
  jump.addEventListener('change', () => center(bracket.querySelector('[data-node="' + jump.value + '"]')));
  requestAnimationFrame(locate);
}
