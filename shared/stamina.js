const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => value * value * (3 - 2 * value);

export const STAMINA_TUNING = Object.freeze({
  runCost: 4.2, chargeCost: .35,
  pointRecoverySeconds: 2,
  shotCost: Object.freeze({ serve: 1.2, clear: 4.2, drop: 2.6, smash: 9 }),
});
const DEFAULT_FATIGUE = Object.freeze({ onset: .55, speedFloor: .65, accelerationFloor: .8, controlWeight: .3 });

/** Shared by movement, interception and contact quality; no rendering or RNG. */
export function staminaEffects(player, role) {
  const profile = role.fatigue || DEFAULT_FATIGUE;
  const ratio = clamp(player.stamina / role.maxStamina);
  const severity = smooth(clamp((profile.onset - ratio) / profile.onset));
  return { ratio, severity, speedScale: 1 - (1 - profile.speedFloor) * severity,
    accelerationScale: 1 - (1 - profile.accelerationFloor) * severity, controlWeight: profile.controlWeight };
}

export function movementStaminaRate(role, speed) {
  const intensity = clamp(speed / role.speed);
  return STAMINA_TUNING.runCost * role.runCost * intensity * intensity;
}

export function shotStaminaCost(role, shot, charge = 0, serving = false) {
  const type = serving ? 'serve' : shot;
  const base = STAMINA_TUNING.shotCost[type] ?? STAMINA_TUNING.shotCost.clear;
  return base * (role.shotCost?.[type] ?? 1) * (1 + STAMINA_TUNING.chargeCost * clamp(charge) ** 2);
}
