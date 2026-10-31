// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-31-court-white-ui',
  title: '界面与击球反馈更新',
  summary: '全场统一为球场白主题，主菜单与文案重做，并加入可关闭的击球触感。',
  items: Object.freeze([
    '首页、开局、好友房间、暂停、结算、操作说明、排行榜与设置统一为球场白配色；主菜单改为比赛、训练、好友三项入口。',
    '按键保持原有位置、顺序和命中区域，新增按下、满蓄力与出拍的视觉反馈；支持振动的设备在击球和杀球时会轻振，可在比赛设置中关闭。',
    '比赛内提示改为正式比赛口径，移除单打限定，为后续模式留出空间。',
    '竖屏安装版按系统安全区排版，顶部与底部不再被状态栏或 Home 条遮挡；本次不改变比赛规则，好友无需因更新重新建房。',
  ]),
});
