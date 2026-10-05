// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-05-coaches-stamina-entry',
  title: '陪练、体力与开打入口更新',
  summary: '选择自己的陪练，调整节奏恢复体力；好友对打先确认，再开赛。',
  items: Object.freeze([
    '人机准备页可分别选择自己和均衡、灵巧、力量陪练的打法，再选择强度与比赛形式。',
    '低体力仍有机会杀球；成功高远球和吊球后的低强度调整加快恢复，每分结束到下一次发球获得一次定量恢复。疲劳仍影响速度和稳定性。',
    '三种打法的体力取舍重新平衡；首页分为人机开打、三步训练、好友对打，设置各自独立。',
    '好友大厅显示双方打法与比分；双方确认规则后倒数3秒开打，父子局需双方明确同意。请双方更新并重新建房。',
  ]),
});
