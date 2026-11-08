// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-11-08-smash-motion',
  title: '杀球动作更新',
  summary: '普通与起跳杀球更连贯舒展，转髋带动挥拍，落地后自然恢复。',
  items: Object.freeze([
    '杀球先由肘部前送，再带动手和拍头挥出；髋部先转，胸肩随后跟上。',
    '引拍、随挥与落地缓冲连续衔接，较低触点采用更紧凑的发力动作。',
    '修复远触点下的肘腕翻转与腕部拉长尖刺，保留原有触球判定和其他球种动作。',
    '保留地狱人机强化与完整鱼跃救球、玻璃击球按钮、竖屏安全区及其他比赛模式。',
  ]),
});
