import { CUP_EVENTS, getCupOpponent, roundLabel } from './cup-draw.js';

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function button(action, label, kind = '') {
  return `<button type="button" data-cup="${action}" class="${kind}">${label}</button>`;
}

function heading(title, note = '') {
  return `<h2 id="cup-title">${escapeText(title)}</h2>${note ? `<p class="cup-note">${escapeText(note)}</p>` : ''}`;
}

function eventCard(event) {
  return `<button type="button" class="cup-card" data-event="${event.id}" data-cup="preview-${event.id}">
    <span class="cup-illustration" aria-hidden="true"><i></i></span>
    <span class="cup-card-copy"><small>${event.size} 强单打 · ${Math.log2(event.size)} 轮</small>
    <strong>${escapeText(event.name)}</strong><span>${escapeText(event.venue)}　↗</span></span></button>`;
}

function road(cup, expanded = false) {
  const matches = cup.rounds.flatMap(matches => {
    const match = matches.find(m => (m.a === 0 || m.b === 0) && m.winner != null);
    if (!match) return [];
    const rival = cup.players[match.a === 0 ? match.b : match.a];
    return [`<li><span>${roundLabel(matches.length * 2)}</span><strong>${escapeText(rival.name)}</strong><b>${match.winner === 0 ? '胜' : '负'}</b></li>`];
  });
  return matches.length ? `<details class="cup-road"${expanded ? ' open' : ''}><summary>我的晋级记录 · ${matches.length} 场</summary><ul>${matches.join('')}</ul></details>` : '';
}

function drawSheet(cup, index) {
  const round = cup.rounds[index];
  const tabs = cup.rounds.map((r, i) => button('round-' + i, roundLabel(r.length * 2), index === i ? 'cup-selected' : '')).join('');
  const pair = (id, winner) => {
    const player = cup.players[id];
    return `<span class="${winner === id && id != null ? 'cup-winner' : ''}">${id != null && player ? escapeText(player.name) : '待定'}${id === 0 ? '（你）' : ''}</span>`;
  };
  const rows = round.map(m => `<li class="${m.a === 0 || m.b === 0 ? 'cup-mine' : ''}">${pair(m.a, m.winner)}<small>对</small>${pair(m.b, m.winner)}</li>`).join('');
  return heading('赛事签表') + `<div class="cup-actions cup-rounds">${tabs}</div><ul class="cup-pairs">${rows}</ul>` + button('hub', '← 返回赛事');
}

function duel(cup, event, score) {
  const rival = getCupOpponent(cup);
  const remaining = cup.rounds[cup.roundIndex].length * 2;
  const venue = remaining <= 4 ? event.centerVenue : event.venue;
  const stat = (name, value) => `<div><dt>${name}</dt><dd>${escapeText(value)}</dd></div>`;
  const round = cup.rounds[cup.roundIndex];
  const myPair = round.findIndex(m => m.a === 0 || m.b === 0);
  const adjacent = round[myPair ^ 1];
  const nextPair = adjacent ? `<p class="cup-next"><strong>同区对阵</strong> ${escapeText(cup.players[adjacent.a].name)} 对 ${escapeText(cup.players[adjacent.b].name)}，若你晋级，下轮将迎战其中的胜者。</p>` : '';
  const previous = cup.rounds[cup.roundIndex - 1]?.find(m => m.winner === 0);
  const arrival = previous ? `<p class="cup-arrival"><strong>${escapeText(cup.players[0].name)}</strong> 战胜 ${escapeText(cup.players[previous.a || previous.b].name)}，晋级${roundLabel(remaining)}。</p>` : '';
  return heading(event.name, `${venue} · ${roundLabel(remaining)}`) +
    `${arrival}<div class="cup-duel"><section><small>本轮对手 · ${escapeText(rival.country)}</small><h3>${escapeText(rival.name)}</h3>
    <p>${escapeText(rival.style)}　·　${escapeText(rival.height)} cm</p></section>
    <dl>${stat('实力', rival.rating)}${stat('力量', rival.power)}${stat('速度', rival.speed)}${stat('控球', rival.control)}</dl></div>
    <div class="cup-actions">${button('play', score ? '继续比赛 · ' + score.map(escapeText).join(' : ') + ' ↗' : '进入球场 ↗', 'cup-primary')}${button('draw', '查看签表')}${button('withdraw', '主动退赛', 'cup-quiet')}</div>${nextPair}${road(cup)}`;
}

function ceremony(event) {
  const ribbons = Array.from({length: 18}, (_, i) =>
    `<i style="--x:${(i * 37) % 100}%;--delay:${i % 5 * 0.12}s;--turn:${60 + i * 21}deg"></i>`).join('');
  return `<div class="cup-award"><div class="cup-ribbons" aria-hidden="true">${ribbons}</div>
    <div class="cup-trophy" aria-hidden="true"><i></i></div>
    ${heading('冠军', event.name)}${button('hub', '跳过颁奖')}</div>`;
}

export function bindCupUI({ getRun, getScore, onCreate, onPlay, onWithdraw, onFinish, onClose }) {
  const dialog = document.getElementById('cup-dialog');
  const body = document.getElementById('cup-body');
  let timer;
  let preview;
  let seenChampion;
  let roundIndex = 0;
  let renderedRun;

  function render(page = 'hub') {
    clearTimeout(timer);
    const cup = getRun();
    const event = CUP_EVENTS.find(e => e.id === (cup?.eventId || preview));
    renderedRun = cup;
    let content;
    let awarding = false;
    if (!cup && page === 'preview' && event) {
      content = heading(event.name, event.venue) + `<div class="cup-rules"><strong>${event.size} 强 · 单打淘汰赛</strong>
        <p>连赢 ${Math.log2(event.size)} 场夺冠，输球即止步。四强起移师${escapeText(event.centerVenue)}。</p>
        <p>赛事进度自动保存在本机，关闭游戏后可继续。主动退赛会结束本届赛事。</p></div>
        <div class="cup-actions">${button('create', '确认参赛 ↗', 'cup-primary')}${button('hub', '重新选赛')}</div>`;
    } else if (!cup) {
      content = heading('杯赛挑战', '选择本届赛事') + `<div class="cup-cards">${CUP_EVENTS.map(eventCard).join('')}</div>`;
    } else if (page === 'draw') {
      content = drawSheet(cup, roundIndex);
    } else if (page === 'withdraw') {
      const stage = roundLabel(cup.rounds[cup.roundIndex].length * 2);
      content = heading('确认退赛？', `你已打到${stage}。退赛后，本届签表和进度将结束。`) +
        `<div class="cup-actions">${button('hub', '保留进度', 'cup-primary')}${button('confirm-withdraw', '确认退赛')}</div>`;
    } else if (cup.status === 'active') {
      content = duel(cup, event, getScore?.());
    } else if (cup.status === 'champion' && page === 'award') {
      awarding = true;
      content = ceremony(event);
      timer = setTimeout(() => { if (dialog.open) render(); }, 4400);
    } else {
      content = heading(cup.status === 'champion' ? '夺冠之路' : '止步' + roundLabel(cup.rounds[cup.roundIndex].length * 2), event.name) +
        road(cup, true) + `<div class="cup-actions">${button('draw', '查看签表')}${button('finish', '选择下一届赛事 ↗', 'cup-primary')}</div>`;
    }
    dialog.dataset.event = event?.id || '';
    dialog.classList.toggle('cup-awarding', awarding);
    body.innerHTML = content;
    body.scrollTop = 0;
    if (dialog.open) body.focus({preventScroll:true});
  }

  function close() {
    clearTimeout(timer);
    if (dialog.open) dialog.close();
  }

  function open() {
    const cup = getRun();
    preview = null;
    const award = cup?.status === 'champion' && seenChampion !== cup.id;
    if (award) seenChampion = cup.id;
    render(award ? 'award' : 'hub');
    if (!dialog.open) dialog.showModal();
    body.focus({preventScroll:true});
  }

  document.getElementById('open-cup').addEventListener('click', open);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
    onClose?.();
  });
  dialog.addEventListener('click', event => {
    const action = event.target.closest('button')?.dataset.cup;
    if (!action) return;
    const latest = getRun();
    if (action !== 'close' && (latest?.id !== renderedRun?.id ||
        latest?.roundIndex !== renderedRun?.roundIndex || latest?.status !== renderedRun?.status)) {
      render();
      return;
    }
    if (action.startsWith('preview-')) {
      preview = action.slice(8);
      render('preview');
    } else if (action.startsWith('round-')) {
      roundIndex = Number(action.slice(6));
      render('draw');
    } else {
      switch (action) {
        case 'create': onCreate(preview); render(); break;
        case 'play': close(); onPlay(); break;
        case 'draw': roundIndex = getRun()?.roundIndex || 0; render('draw'); break;
        case 'withdraw': render('withdraw'); break;
        case 'confirm-withdraw': onWithdraw(); preview = null; render(); break;
        case 'finish': onFinish(); preview = null; render(); break;
        case 'close': close(); onClose?.(); break;
        case 'hub': preview = null; render(); break;
      }
    }
  });
  return {open, close};
}
