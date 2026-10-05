import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('power coach can sustain hard 21-point play without spending most rallies exhausted',()=>{
  const report=JSON.parse(execFileSync(process.execPath,
    ['scripts/check-coach-stamina.js','hard:balanced:power:quick:21'],
    {cwd:new URL('../',import.meta.url),encoding:'utf8',maxBuffer:1024*1024}));
  assert.equal(report.completed,12);assert.deepEqual(report.timeouts,[]);
  const coach=report.rows[0].coach;
  assert.ok(coach.zonesPercent[0]<25,'under 10% stamina for less than one quarter of rally time');
  assert.ok(coach.zeroPercent<8,'zero reserves remain temporary, not the default');
  assert.ok(coach.shots.smash>0,'retains offensive returns');
  assert.ok(coach.bonus.clear>0&&coach.bonus.drop>0,'both control shots yield actual eligible recovery');
});
