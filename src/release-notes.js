// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-11-07-hell-challenge',
  title: '地狱人机挑战上线',
  summary: '挑战拥有三种技能的强力人机：你先得2分获胜，对手先得5分获胜。',
  items: Object.freeze([
    '首页新增地狱人机入口，卡片底边带轻微火焰；原三步训练入口移除，保留新手入门。',
    '幻影球一真三假，蓄力重炮提前锁线，极限救球每回合最多两次；技能可连续出现，对手无限体力。',
    '玩家先得2分、对手先得5分立即获胜，无需净胜；玩家每分回满体力，再次挑战保留打法。',
    '保留普通人机、好友对战、按键位置编辑和球场配色；地狱挑战不改变其他模式规则。',
  ]),
});
