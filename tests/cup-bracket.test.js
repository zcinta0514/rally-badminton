import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCup, advanceCup } from '../src/cup-draw.js';
import { bracketRounds, bracketMarkup } from '../src/cup-bracket.js';

for (const [id,size] of [['bay',32],['crown',64]]) {
  test(id + ' complete bracket maps every feeder to the correct downstream slot', () => {
    let draw = createCup(id, '<我的&签>', 1987);
    for (let r = 0; r < Math.log2(size); r++) {
      const rounds = bracketRounds(draw), markup = bracketMarkup(draw);
      assert.equal(rounds.flat().length,size - 1);
      assert.equal((markup.match(/<path /g)||[]).length,size - 2);
      assert.equal((markup.match(/data-cb-current/g)||[]).length,1);
      assert.equal((markup.match(/class="cb-route"/g)||[]).length,r);
      assert.ok(markup.includes('&lt;我的&amp;签&gt;'));
      assert.ok(!markup.includes('<我的&签>'));
      for (const [i,round] of rounds.entries()) {
        for (const [j,node] of round.entries()) {
          const model = draw.rounds[i]?.[j];
          if (model) assert.deepEqual([node.a,node.b,node.winner],[model.a,model.b,model.winner]);
          if (i) {
            const [first,second] = rounds[i-1].slice(j*2,j*2+2);
            assert.deepEqual([node.a,node.b],[first.winner,second.winner]);
            assert.equal(node.y,(first.y+second.y)/2);
            for (const child of [first,second]) assert.ok(markup.includes('data-from="'+child.key+'" data-to="'+node.key+'"'));
          }
        }
      }
      const mine = rounds[r].find(node=>node.a===0||node.b===0);
      assert.ok(markup.includes('data-node="'+mine.key+'" data-cb-current'));
      const loss = advanceCup(draw,false);
      const lossRounds = bracketRounds(loss);
      const downstream = lossRounds[r+1];
      if (downstream) {
        assert.ok(downstream.every(node=>node.a != null && node.b != null && node.winner===null));
        assert.ok(downstream.every(node=>node.a!==0 && node.b!==0));
      }
      draw = advanceCup(draw,true);
    }
    assert.equal(draw.status,'champion');
    assert.match(bracketMarkup(draw),/<b>冠军<\/b>/);
  });
}
