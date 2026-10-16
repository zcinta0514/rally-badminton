import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { COURT_PALETTES } from '../src/court-palettes.js';

// The venue scene builds without a GPU; only the final draw is skipped.
function makeCourtView(palette) {
  const view = Object.create(CourtView.prototype);
  view.scene = new THREE.Scene();
  view.courtPalette = palette;
  view.makeCourt();
  return view;
}

test('the venue builds its floor from the requested palette', () => {
  const view = makeCourtView('purple');
  assert.equal(view.courtMaterials.court.color.getHex(), COURT_PALETTES.purple.court);
  assert.equal(view.courtMaterials.apron.color.getHex(), COURT_PALETTES.purple.apron);
  assert.equal(view.courtMaterials.edge.color.getHex(), COURT_PALETTES.purple.edge);
  assert.equal(view.courtMaterials.dark.color.getHex(), COURT_PALETTES.purple.dark);
});

test('switching the palette recolours the live materials without rebuilding the floor', () => {
  const view = makeCourtView('green');
  const floor = view.courtMaterials.court;
  assert.equal(view.setCourtPalette('pink'), 'pink');
  assert.equal(view.courtPalette, 'pink');
  assert.equal(view.courtMaterials.court, floor, 'the same mesh materials stay in place');
  assert.equal(floor.color.getHex(), COURT_PALETTES.pink.court);
  assert.equal(view.courtMaterials.apron.color.getHex(), COURT_PALETTES.pink.apron);
  assert.notEqual(COURT_PALETTES.pink.court, COURT_PALETTES.green.court);
});

test('an unknown palette name returns to the traditional green instead of throwing', () => {
  const view = makeCourtView('blue');
  assert.equal(view.setCourtPalette('chartreuse'), 'green');
  assert.equal(view.courtMaterials.court.color.getHex(), COURT_PALETTES.green.court);
});
