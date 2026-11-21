import { CUP_TARGETS } from '../shared/game.js';
export { CUP_TARGETS };

export const CUP_EVENTS = Object.freeze([
  { id: 'bay', name: '开拍海湾挑战赛', size: 32, venue: '海湾日光馆', centerVenue: '海湾中心球场' },
  { id: 'crown', name: '开拍冠军杯', size: 64, venue: '都会星夜馆', centerVenue: '都会冠军球场' },
]);

// Each pool follows the local name order. All combinations are fictional athletes.
const namingPools = [
  ['中国', ['林', '唐', '方', '陆', '陈', '沈', '江', '顾'], ['泽宇', '嘉禾', '以宁', '闻舟', '奕辰', '书言', '云帆', '时安'], ''],
  ['中国', ['许', '黎', '孙', '叶', '梁', '杜', '宋', '季'], ['安澜', '亦舒', '清越', '知夏', '予晴', '嘉音', '凌川', '明远'], ''],
  ['日本', ['森川', '藤野', '北原', '岛崎', '西田', '松原'], ['悠斗', '遥香', '健太', '真帆', '美咲', '直树'], ''],
  ['丹麦', ['埃米尔', '米克尔', '卡斯珀', '弗蕾娅', '莉内', '阿斯特丽德'], ['尼尔森', '达尔', '霍尔姆', '林德', '索伦森', '贝克'], '·'],
  ['印度', ['阿琼', '罗汉', '阿迪蒂', '妮娅', '基兰', '维韦克'], ['梅塔', '拉奥', '库马尔', '森', '沙阿', '奈尔'], '·'],
  ['印度尼西亚', ['阿迪', '里安', '妮萨', '阿尤', '拉玛', '迪娜'], ['普拉塔玛', '维贾亚', '库苏马', '萨普特拉', '维博沃', '桑托索'], '·'],
  ['法国', ['雨果', '路易', '阿黛尔', '克洛伊', '西蒙', '莉亚'], ['莫雷尔', '杜瓦尔', '佩兰', '马丁', '布兰', '勒鲁'], '·'],
];

const styles = [
  { style: '后场重杀', role: 'power', height: 187, power: 12, speed: -6, control: -3 },
  { style: '快速突击', role: 'swift', height: 176, power: 1, speed: 11, control: -5 },
  { style: '拉吊控制', role: 'balanced', height: 179, power: -5, speed: 0, control: 12 },
  { style: '防守反击', role: 'balanced', height: 183, power: 1, speed: 4, control: 7 },
  { style: '抢网变速', role: 'swift', height: 172, power: -6, speed: 8, control: 8 },
];

function randomStream(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function entrants(size, random, playerName, eventId) {
  const pools = namingPools.map(([country, first, second, sep]) =>
    shuffled(first.flatMap(a => second.map(b => ({ country, name: a + sep + b }))), random)
      .filter(person => person.name !== playerName));
  const countries = shuffled(Array.from({ length: size - 1 }, (_, i) => i % pools.length), random);
  return [{ id: 0, name: playerName, country: '本机' }, ...countries.map((pool, i) => {
    const build = styles[Math.floor(random() * styles.length)];
    const rating = Math.round(94 - 52 * i / (size - 2) + random() * 4 + (eventId === 'crown' ? 2 : 0));
    const stat = bias => Math.min(99, Math.max(30, Math.round(rating + bias + random() * 8 - 4)));
    return { id: i + 1, ...pools[pool].pop(), style: build.style, role: build.role,
      rating, difficulty: rating < 62 ? 'easy' : rating < 82 ? 'medium' : 'hard',
      height: build.height + Math.floor(random() * 15) - 7,
      power: stat(build.power), speed: stat(build.speed), control: stat(build.control) };
  })];
}

function pair(slots) {
  return Array.from({ length: slots.length / 2 }, (_, i) => ({
    a: slots[i * 2], b: slots[i * 2 + 1], winner: null,
  }));
}

export function createCup(eventId, playerName = '你', seed = Math.floor(Math.random() * 0x100000000), target = 5) {
  const event = CUP_EVENTS.find(item => item.id === eventId);
  if (!event) throw new RangeError('未知赛事');
  if (!CUP_TARGETS.includes(target)) throw new RangeError('杯赛分制无效');
  seed = seed >>> 0;
  const random = randomStream(seed);
  const name = String(playerName || '你').trim().slice(0, 32) || '你';
  const players = entrants(event.size, random, name, eventId);
  // Spread seeds across halves and quarters. Shuffle each remaining seeding band.
  let slots = [0, 1];
  while (slots.length < event.size) {
    const band = shuffled(Array.from({ length: slots.length }, (_, i) => slots.length + i), random);
    slots = slots.flatMap((id, i) => random() < 0.5 ? [id, band[i]] : [band[i], id]);
  }
  return { version: 1, id: eventId + '-' + seed, eventId, seed, target, status: 'active',
    roundIndex: 0, players, rounds: [pair(slots)] };
}

export function roundLabel(remaining) {
  return ({ 2: '决赛', 4: '半决赛', 8: '八强赛' })[remaining] || remaining + '强赛';
}

export function getCupOpponent(cup) {
  if (cup.status !== 'active') return null;
  const match = cup.rounds[cup.roundIndex].find(m => m.a === 0 || m.b === 0);
  return cup.players[match.a === 0 ? match.b : match.a];
}

export function cupVenueForDraw(cup) {
  return {
    eventId: cup.eventId,
    centerCourt: cup.rounds[cup.roundIndex].length <= 2,
    opponent: getCupOpponent(cup),
    selfName: cup.players[0].name,
  };
}

export function advanceCup(cup, won) {
  if (cup.status !== 'active') return cup;
  if (typeof won !== 'boolean') throw new TypeError('需要玩家比赛结果');
  const random = randomStream(cup.seed ^ Math.imul(cup.roundIndex + 1, 0x9e3779b1));
  const completed = cup.rounds[cup.roundIndex].map(({ a, b }) => {
    let winner;
    if (a === 0 || b === 0) winner = won ? 0 : (a || b);
    else {
      const difference = cup.players[a].rating - cup.players[b].rating;
      const probability = 1 / (1 + Math.exp(-difference / 8));
      winner = random() < probability ? a : b;
    }
    return { a, b, winner };
  });
  const rounds = [...cup.rounds.slice(0, cup.roundIndex), completed];
  if (!won || completed.length === 1) return { ...cup, rounds, status: won ? 'champion' : 'eliminated' };
  rounds.push(pair(completed.map(match => match.winner)));
  return { ...cup, rounds, roundIndex: cup.roundIndex + 1 };
}

export function isValidCup(cup) {
  const size = CUP_EVENTS.find(event => event.id === cup?.eventId)?.size;
  if (!size || cup.version !== 1 || !Number.isInteger(cup.seed) || cup.seed !== (cup.seed >>> 0)
      || (cup.target !== undefined && !CUP_TARGETS.includes(cup.target))
      || cup.id !== cup.eventId + '-' + cup.seed || !Array.isArray(cup.players) || cup.players.length !== size
      || !Array.isArray(cup.rounds) || !Number.isInteger(cup.roundIndex) || cup.roundIndex < 0
      || cup.roundIndex >= Math.log2(size) || cup.rounds.length !== cup.roundIndex + 1
      || !['active', 'eliminated', 'champion'].includes(cup.status)) return false;
  if (!cup.players.every((p, id) => p?.id === id && typeof p.name === 'string' && p.name.trim()
      && typeof p.country === 'string' && (id === 0 || (styles.some(s => s.style === p.style && s.role === p.role)
      && ['easy', 'medium', 'hard'].includes(p.difficulty) && Number.isInteger(p.height) && p.height >= 150 && p.height <= 210
      && [p.rating, p.power, p.speed, p.control].every(n => Number.isInteger(n) && n >= 0 && n <= 100))))) return false;

  let priorWinners;
  for (const [index, round] of cup.rounds.entries()) {
    if (!Array.isArray(round) || round.length !== size / (2 ** (index + 1))) return false;
    const pending = index === cup.roundIndex && cup.status === 'active';
    const seen = new Set();
    for (const [i, match] of round.entries()) {
      if (!match) return false;
      for (const [offset, id] of [match.a, match.b].entries()) {
        if (!Number.isInteger(id) || id < 0 || id >= size || seen.has(id)
            || (priorWinners && id !== priorWinners[i * 2 + offset])) return false;
        seen.add(id);
      }
      if (pending ? match.winner !== null : match.winner !== match.a && match.winner !== match.b) return false;
    }
    if (!seen.has(0)) return false;
    priorWinners = round.map(m => m.winner);
  }
  if (cup.status === 'champion') return priorWinners.length === 1 && priorWinners[0] === 0;
  return cup.status !== 'eliminated' || !priorWinners.includes(0);
}
