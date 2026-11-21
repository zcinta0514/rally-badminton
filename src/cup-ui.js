import { bracketMarkup, mountBracket } from './cup-bracket.js';
import { getCupScoringRules } from '../shared/game.js';
import { normalizePlayerName } from './player-profile.js';
import { CUP_EVENTS, CUP_TARGETS, cupVenueForDraw, getCupOpponent, roundLabel } from './cup-draw.js';

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
  return `<button type="button" class="cup-event" data-cup="preview-${event.id}">
    <span><strong>${escapeText(event.name)}</strong><small>${escapeText(event.venue)} · ${event.size} 强 · ${Math.log2(event.size)} 轮</small></span>
    <span aria-hidden="true">›</span></button>`;
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

function duel(cup, event, score) {
  const rival = getCupOpponent(cup);
  const remaining = cup.rounds[cup.roundIndex].length * 2;
  const venue = remaining <= 4 ? event.centerVenue : event.venue;
  const stat = (name, value) => `<div><dt>${name}</dt><dd>${escapeText(value)}</dd></div>`;
  const round = cup.rounds[cup.roundIndex];
  const myPair = round.findIndex(m => m.a === 0 || m.b === 0);
  const adjacent = round[myPair ^ 1];
  const nextPair = adjacent ? `<p class="cup-next"><strong>下轮对手</strong> ${escapeText(cup.players[adjacent.a].name)} / ${escapeText(cup.players[adjacent.b].name)} 中的胜者</p>` : '';
  const previous = cup.rounds[cup.roundIndex - 1]?.find(m => m.winner === 0);
  const arrival = previous ? `<p class="cup-arrival"><strong>${escapeText(cup.players[0].name)}</strong> 战胜 ${escapeText(cup.players[previous.a || previous.b].name)}，晋级${roundLabel(remaining)}。</p>` : '';
  return heading(event.name, `${venue} · ${roundLabel(remaining)} · ${cup.target ?? 5} 分单局`) +
    `${arrival}<div class="cup-duel"><section><small>本轮对手　${escapeText(rival.country)}</small><h3>${escapeText(rival.name)}</h3>
    <p>${escapeText(rival.style)}　·　${escapeText(rival.height)} cm</p></section>
    <dl>${stat('实力', rival.rating)}${stat('力量', rival.power)}${stat('速度', rival.speed)}${stat('控球', rival.control)}</dl></div>
    <div class="cup-actions">${button('play', score ? '继续比赛 · ' + score.map(escapeText).join(' : ') + ' ↗' : '进入球场 ↗', 'cup-primary')}${button('draw', '查看签表')}</div>${nextPair}${road(cup)}${button('withdraw', '退赛', 'cup-quiet')}`;
}

function scoreHint(target) {
  const {cap, winBy} = getCupScoringRules(target);
  return `单局 ${target} 分，净胜 ${winBy} 分。先到 ${cap} 分直接胜出。`;
}

function registration(event, name) {
  const choices = CUP_TARGETS.map(target =>
    `<label><input type="radio" name="target" value="${target}"${target === 5 ? ' checked' : ''}><span>${target} 分</span></label>`).join('');
  return heading(event.name, `${event.venue} · ${event.size} 强单打`) +
    `<form id="cup-registration">
      <div class="cup-fields"><label class="cup-athlete-id">参赛 ID<input name="athlete" maxlength="16" autocomplete="nickname" value="${escapeText(name)}" placeholder="输入参赛名"></label>
        <fieldset><legend>本届分制</legend><div class="cup-score-options">${choices}</div></fieldset></div>
      <div class="cup-rules"><p id="cup-score-rule" aria-live="polite">${scoreHint(5)}</p>
      <p>连赢 ${Math.log2(event.size)} 场夺冠，单败淘汰。</p>
      <p>本届分制固定。退出游戏可续赛，退赛后须重新报名。</p></div>
      <div class="cup-actions"><button type="submit" class="cup-primary" data-cup="create" data-action="save">确认参赛 ↗</button></div>
    </form>`;
}

export function bindCupUI({ getRun, getScore, getDefaultName, onCreate, onPlay, onWithdraw, onFinish, onClose, onPreview }) {
  const dialog = document.getElementById('cup-dialog');
  const body = document.getElementById('cup-body');
  const toast = document.getElementById('toast');
  const toastParent = toast.parentNode;
  let preview;
  const back = dialog.querySelector('.cup-back');
  let renderedRun;

  function render(page = 'hub') {
    const cup = getRun();
    const event = CUP_EVENTS.find(e => e.id === (cup?.eventId || preview));
    renderedRun = cup;
    const entryName = normalizePlayerName(getDefaultName?.()) || '你';
    const venue = cup ? cupVenueForDraw(cup) : page === 'preview' && event
      ? {eventId:event.id, centerCourt:false, selfName:entryName, opponent:null}
      : null;
    onPreview(venue);
    let content;
    if (!cup && page === 'preview' && event) {
      content = registration(event, entryName);
    } else if (!cup) {
      content = heading('杯赛挑战') + `<div class="cup-events">${CUP_EVENTS.map(eventCard).join('')}</div>`;
    } else if (page === 'draw') {
      content = heading(event.name + ' · 签表') + bracketMarkup(cup);
    } else if (page === 'withdraw') {
      const stage = roundLabel(cup.rounds[cup.roundIndex].length * 2);
      content = heading('确认退赛？', `你已打到${stage}。退赛后，本届签表和进度将结束。`) +
        `<div class="cup-actions">${button('hub', '保留进度', 'cup-primary')}${button('confirm-withdraw', '确认退赛')}</div>`;
    } else if (cup.status === 'active') {
      content = duel(cup, event, getScore?.());
    } else {
      content = heading(cup.status === 'champion' ? '夺冠之路' : '止步' + roundLabel(cup.rounds[cup.roundIndex].length * 2), event.name) +
        road(cup, true) + `<div class="cup-actions">${button('draw', '查看签表')}${button('finish', '选择下一届赛事 ↗', 'cup-primary')}</div>`;
    }
    const backToHub = ['preview', 'withdraw', 'draw'].includes(page);
    back.dataset.cup = backToHub ? 'hub' : 'close';
    back.textContent = page === 'preview' ? '← 返回选赛' : backToHub ? '← 返回赛事' : '← 返回单人对战';
    dialog.dataset.page = page;
    dialog.dataset.event = event?.id || '';
    body.innerHTML = content;
    body.scrollTop = 0;
    if (dialog.open) body.focus({preventScroll:true});
    if (page === 'draw' && cup) mountBracket(body);
  }

  function close({enteringMatch=false} = {}) {
    if (!enteringMatch) onPreview(null);
    if (dialog.open) dialog.close();
    if (toast.parentNode === dialog) toastParent.append(toast);
  }

  function open() {
    preview = null;
    render();
    if (!dialog.open) dialog.showModal();
    if (toast.parentNode !== dialog) dialog.append(toast);
    body.focus({preventScroll:true});
  }

  document.getElementById('open-cup').addEventListener('click', open);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    back.click();
  });
  dialog.addEventListener('change', event => {
    if (event.target.name === 'target') {
      document.getElementById('cup-score-rule').textContent = scoreHint(Number(event.target.value));
    }
  });
  dialog.addEventListener('submit', event => {
    if (event.target.id !== 'cup-registration') return;
    event.preventDefault();
    if (!getRun()) {
      const fields = new FormData(event.target);
      const name = normalizePlayerName(fields.get('athlete')) || normalizePlayerName(getDefaultName?.()) || '你';
      onCreate(preview, name, Number(fields.get('target')));
      if (!getRun()) return;
    }
    render();
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
    } else {
      switch (action) {
        case 'play': if (onPlay()) close({enteringMatch:true}); break;
        case 'draw': render('draw'); break;
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
