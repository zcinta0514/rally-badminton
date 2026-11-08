// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-11-08-hell-dive',
  title: '地狱人机强化与鱼跃救球',
  summary: '地狱人机进攻更密集，难接低球用完整鱼跃扑救；仍是你2分、对手5分获胜。',
  items: Object.freeze([
    '幻影球与蓄力重炮可连续出现，对手移动、反应更快，保持无限体力。',
    '普通跑位难接的低球才触发鱼跃：蹬地伸拍、侧身落地、撑地收腿、起身回位。',
    '鱼跃不限制总次数，两次至少间隔4秒；普通可接球继续跑位，起身过程中不能再次扑救。',
    '保留玻璃击球按钮、竖屏安全区修复及其他比赛模式；玩家2分、对手5分规则不变。',
  ]),
});
