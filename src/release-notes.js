// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-11-09-net-contact',
  title: '球网反馈更新',
  summary: '球碰到网时，触点附近会凹陷、波动，并响起对应的声音。',
  items: Object.freeze([
    '轻触与重撞的声音、波动强度不同，网布和网带也有各自的反馈。',
    '擦到网带可能减速过网继续回合，也可能回落；下网后球会短暂贴网，再回弹滑落。',
    '连续触网会叠加波动，逐渐衰减停稳；暂停时球和球网一起停住。',
    '好友对战双方请更新游戏后重新建房，使用相同的触网规则。',
  ]),
});
