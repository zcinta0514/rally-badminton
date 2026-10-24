// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-24-gameplay-rhythm',
  title: '球路节奏与接球更新',
  summary: '参考真实比赛调整球路减速和移动节奏，让提前输入与上网接球更连贯。',
  items: Object.freeze([
    '高远球区分发球与回合节奏，缩短后场高远的不合理滞空；球出拍后逐渐减速，保留高弧线和后场深度。',
    '起步、转向和制动按录像参考校准，保留三种打法的速度与体力差异；移动更重视节奏衔接。',
    '适度延长提前击球输入的保留时间，改善上网接吊球与合理站位接杀；迟启动、明显失位与勉强低位救球仍有代价。',
    '联机球路与落点提示同步使用新规则，好友双方请联网更新后重新建房。',
  ]),
});
