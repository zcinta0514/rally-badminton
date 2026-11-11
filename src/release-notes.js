// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-11-11-tournament-lobby',
  title: '在球馆，即刻上场',
  summary: '全新球馆首页：场边候场，选择对手，开始比赛。',
  items: Object.freeze([
    '首页采用实时球馆场景，加入场边候场、看台和全新灯光。',
    '从「单人对战」进入普通人机或地狱挑战；好友对战仍可建房和加入。',
    '首页可直接调整声音与触感；页面切换尊重系统的减少动态效果设置。',
    '打法、计分、联机和击球操控沿用已有规则。',
  ]),
});
