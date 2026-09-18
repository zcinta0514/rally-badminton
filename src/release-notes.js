// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-09-18-player-experience',
  title: '这次更新了什么',
  summary: '更容易上手，也更容易看懂一拍是否稳妥。',
  items: Object.freeze([
    '新增「三步训练」：练到位、选线和回位。',
    '击球稳定性与下网风险提示更清楚，回球判断更直接。',
    '好友对打增加网络与性能状态提示，连接变差时更容易定位。',
  ]),
});
