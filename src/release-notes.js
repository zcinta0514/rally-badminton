// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-10-15-court-palettes',
  title: '地胶配色更新',
  summary: '四种球场地胶配色可选，比赛里随时切换，选择会记住。',
  items: Object.freeze([
    '比赛屏右上角新增独立「配色」入口：经典绿、赛事蓝、紫罗兰、玫瑰粉四种地胶，点一下立即切换。',
    '紫罗兰对齐巴黎奥运会场馆的紫色调，玫瑰粉取自浅玫粉球馆方向；入口圆点显示当前正在使用的颜色。',
    '配色与音量一样只影响你自己的画面、本机保存；设置面板里的旧配色下拉已合并到新入口。',
  ]),
});
