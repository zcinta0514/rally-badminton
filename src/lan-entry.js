// Navigate to the player's own game host. No address is saved or sent to an API.
export function normalizeLanAddress(value) {
  const address = typeof value === 'string' ? value.trim() : '';
  if (!address || /^[A-Z2-9]{5}$/i.test(address) || address.startsWith('//')) {
    throw new Error('请填写电脑显示的局域网游戏地址；房间码要进入该地址后再输入。');
  }
  let url;
  try { url = new URL(address.includes('://') ? address : `http://${address}`); }
  catch { throw new Error('游戏地址无效，请复制电脑显示的完整地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('请使用不含账号密码的 HTTP 或 HTTPS 游戏地址。');
  }
  return url.href;
}
