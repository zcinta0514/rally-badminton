// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-02-score-deuce',
  title: '比分规则修正',
  summary: '单局快赛打到关键平分时继续加球，领先两分才获胜。',
  items: Object.freeze([
    '5、11、21 分快赛均需达到目标分并净胜 2 分，分别在 10、20、30 分封顶。',
    '9 平、19 平、29 平时，下一分直接决定胜负。',
    '比赛中会提示加球和最后一分；标准计分与暂停超时规则保持不变。',
  ]),
});
