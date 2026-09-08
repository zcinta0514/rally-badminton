export function getLeaderboardURL(webSocketURL) {
  const url = new URL(webSocketURL);
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('比赛服务器地址无效');
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  return new URL('/api/leaderboard', url).href;
}

export function resultRecordText(record) {
  if (!record) return '等待服务器结算战绩…';
  if (record.status === 'saved') return '本场战绩已计入排行榜。';
  if (record.status === 'memory') return '已计入临时排行榜，服务器重启后可能丢失。';
  if (record.status === 'local') return '本场已计入本机好友战绩。';
  if (record.status === 'local-memory') return '本场已计入本机临时战绩，关闭页面后会丢失。';
  if (record.status === 'error') return '本场战绩保存失败，请稍后查看排行榜确认。';
  if (record.status === 'excluded') {
    if (record.reason === 'same_player') return '同一玩家的两个窗口对战，不计入排行榜。';
    if (record.reason === 'abandoned') return '比赛中断，未计入排行榜。';
    if (record.reason === 'missing_identity') return '本场未提供完整玩家身份，未计入排行榜。';
    return '本场战绩未计入排行榜。';
  }
  return '本场战绩保存中…';
}

export function createLeaderboard({ document, getURL, fetchImpl = globalThis.fetch }) {
  const $ = id => document.getElementById(id);
  let generation = 0, controller = null;
  function cancel() { generation++; controller?.abort(); controller = null; }
  function textElement(tag, text, className) {
    const element = document.createElement(tag); element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  async function load({ selfId } = {}) {
    cancel(); const current = generation;
    controller = new AbortController(); const request = controller;
    const timer = setTimeout(() => request.abort(), 8000);
    $('leaderboard-rows').replaceChildren(); $('leaderboard-table').hidden = true;
    $('leaderboard-status').textContent = '正在读取排行榜…';
    $('leaderboard-storage').textContent = '';
    $('leaderboard-retry').disabled = true;
    try {
      const response = await fetchImpl(getURL(), { signal: request.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Server unavailable');
      const data = await response.json();
      if (current !== generation) return;
      if (!Array.isArray(data.entries)) throw new Error('Invalid ranking');
      if (data.storage === 'unavailable') {
        $('leaderboard-status').textContent = '排行榜暂时不可用，请稍后重试。'; return;
      }
      for (const entry of data.entries.slice(0, 50)) {
        if (typeof entry.name !== 'string' || typeof entry.playerId !== 'string' ||
          ![entry.rank, entry.wins, entry.winRate, entry.points].every(Number.isFinite)) throw new Error('Invalid player');
        const row = document.createElement('tr'); row.dataset.self = String(Boolean(selfId && entry.playerId === selfId));
        const name = document.createElement('td');
        name.append(textElement('strong', entry.name), textElement('small', `${row.dataset.self === 'true' ? '你 · ' : ''}${entry.playerId}`));
        row.append(textElement('td', entry.rank), name, textElement('td', entry.wins),
          textElement('td', `${Math.round(entry.winRate * 100)}%`), textElement('td', entry.points));
        $('leaderboard-rows').append(row);
      }
      $('leaderboard-table').hidden = !data.entries.length;
      const local = data.storage === 'local' || data.storage === 'local-memory';
      $('leaderboard-status').textContent = (local ? '本机好友战绩 · ' : '') + (data.entries.length ? `前 ${Math.min(50, data.entries.length)} 位球友 · 完成好友对局后更新` : '暂无战绩。完成一场好友 1V1，即可上榜。');
      $('leaderboard-storage').textContent = local
        ? '仅保存本机参加的对局，与服务器榜单独立；统计最近 500 场完整好友对局。' + (data.storage === 'local-memory' ? '浏览器无法保存，关闭页面后新增战绩会丢失。' : '')
        : data.storage === 'memory' ? '当前是临时排行榜，服务器重启后可能丢失。' : '统计本服务器已完成的好友对局；人机练习和中途退出不计入。';
    } catch {
      if (current !== generation) return;
      $('leaderboard-rows').replaceChildren(); $('leaderboard-table').hidden = true;
      $('leaderboard-status').textContent = '无法连接排行榜。请检查网络或服务器后重试；离线仍可人机练习。';
    } finally {
      clearTimeout(timer);
      if (current === generation) { controller = null; $('leaderboard-retry').disabled = false; $('leaderboard-retry').hidden = false; }
    }
  }
  return { load, cancel };
}
