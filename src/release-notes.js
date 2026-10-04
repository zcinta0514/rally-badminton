// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-04-stamina-audio-settings',
  title: '体力、球场声音与比赛设置更新',
  summary: '体力显示移到球员脚下，三种打法的消耗、恢复与疲劳表现更清楚。',
  items: Object.freeze([
    '双方脚下显示体力；只在回合中持续低强度调整时恢复，发球、分间和暂停均不恢复。',
    '均衡、灵巧、力量三种打法有不同体力取舍；疲劳影响移动速度和击球稳定性。',
    '击球、脚步与观众录音增加变化；局内设置可调整各类音量，并查看本场规则和局点、赛点提示。',
    '场馆保持稳定基础照明。好友对打双方需更新后重新建房，旧版无法加入新规则房间。',
  ]),
});
