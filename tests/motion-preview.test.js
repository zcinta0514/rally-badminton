import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMotionClip, MOTION_CASES } from '../src/preview/motion-clips.js';

test('motion review clips exercise the labeled live shot or movement on both hands', () => {
  const shots = {
    jump:'smash', standing:'smash', clear:'clear', drop:'drop', shortServe:'drop', longServe:'clear',
    cross:'drop', lift:'clear', defense:'drop', feed:'clear', rescue:'clear',
  };
  for (const hand of ['left','right']) {
    for (const kind of Object.keys(MOTION_CASES)) {
      const frames = buildMotionClip(kind, hand);
      assert.ok(frames.length > 120, kind);
      assert.ok(frames.every(f => f.player.hand === hand), kind);
      if (kind === 'ready') {
        assert.ok(frames.every(f => Math.abs(f.player.vx) + Math.abs(f.player.vz) < .01 && !f.player.action));
        continue;
      }
      if (kind === 'run' || kind === 'footwork') {
        const velocity = frames.map(f => kind === 'run' ? f.player.vx : f.player.vz);
        assert.ok(Math.abs(velocity[0]) < .01);
        assert.ok(Math.max(...velocity) > .8 && Math.min(...velocity) < -.8);
        assert.ok(Math.abs(velocity.at(-1)) < .01);
        continue;
      }
      const contact = frames.find(f => f.player.action?.stage === 'contact');
      assert.equal(contact?.player.action.type, shots[kind], kind);
      assert.deepEqual(contact.player.action.contact, {
        x:contact.shuttle.x, y:contact.shuttle.y, z:contact.shuttle.z,
      }, kind + ' uses the rules contact frame');
      if (kind.endsWith('Serve')) assert.equal(contact.player.action.serving, true);
      if (kind === 'jump') assert.ok(contact.player.action.jumpHeight > .25);
      if (kind === 'standing') assert.equal(contact.player.action.jumpHeight, 0);
      if (['cross','lift','defense','feed'].includes(kind)) assert.equal(contact.player.action.technique, kind);
      if (kind === 'rescue') assert.equal(contact.rescue.hit, true);
    }
  }
});
