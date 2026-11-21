import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { TournamentLobby } from '../src/tournament-lobby.js';
import { makeAthlete } from '../src/athlete.js';
import { cupVenueTheme } from '../src/cup-venue.js';

test('registration and round preview share their actual match athlete, venue, and court', t => {
  const context = new Proxy({}, {get: () => () => {}});
  globalThis.document = {createElement: () => ({getContext: () => context})};
  t.after(() => { delete globalThis.document; });
  const view = Object.create(CourtView.prototype);
  view.scene = new THREE.Scene();
  view.scene.background = new THREE.Color();
  view.scene.fog = new THREE.Fog(0,10,20);
  view.matchKey = new THREE.DirectionalLight();
  view.lobby = new TournamentLobby({loadAthlete:false});
  view.players = [0,1].map(i => makeAthlete(view.scene, i));
  view.venue = new THREE.Group(); view.lobby.scene.add(view.venue);
  view.mode = 'menu'; view.canvas = {dataset:{}};
  view.renderLobby = () => {};
  view.arena = new THREE.Group(); view.hallShell = new THREE.Group();

  const player = {eventId:'bay',centerCourt:false,selfName:'羽川',hand:'left'};
  view.setCupPreview(player);
  const firstHall = view.cupHall.group;
  assert.equal(view.arena.visible,false);
  assert.equal(view.hallShell.visible,false);
  assert.equal(view.lobby.cupAthlete,view.players[0]);
  assert.equal(view.lobby.athlete.root.visible,false);
  assert.equal(view.players[0].root.scale.x,-1);
  assert.deepEqual(view.players[0].cupKit,cupVenueTheme('bay').kits[0]);
  const bout = {...player,opponent:{id:6,name:'辛原',height:190}};
  view.setCupPreview(bout);
  assert.equal(view.players[0].root.parent,view.scene);
  assert.equal(view.lobby.cupAthlete,view.players[1]);
  assert.equal(view.players[1].root.scale.y,190/177);
  assert.equal(view.players[1].root.scale.x,1);
  assert.deepEqual(view.players[1].cupKit,cupVenueTheme('bay').kits[1]);
  assert.equal(view.players[1].root.parent,view.lobby.scene);
  assert.equal(view.cupHall.group,firstHall);
  for (const [width,height] of [[844,390],[568,320]]) {
    view.lobby.layoutCamera(width,height,false);
    const middle = view.players[1].root.position.clone().add(new THREE.Vector3(0,1,0)).project(view.lobby.camera);
    assert.ok(middle.x > .4 && middle.x < .75);
    // Check the nearest edge of the baseline judge's silhouette in the same camera.
    assert.ok(new THREE.Vector3(5.3, 1.15, 6.45).project(view.lobby.camera).x > 1);
  }
  view.setMode('menu');
  assert.equal(view.lobby.cupAthlete,view.players[1]);
  view.setCupVenue(bout);
  assert.equal(view.cupHall.group,firstHall);
  assert.equal(view.players[1].root.parent,view.scene);
  assert.equal(view.lobby.athlete.root.visible,true);
  assert.equal(view.lobby.cupAthlete,null);
  view.setCupVenue(null);
  assert.equal(firstHall.parent,null);
  assert.equal(view.arena.visible,true);
  assert.equal(view.hallShell.visible,true);
  assert.equal(view.players[1].root.scale.y,1);
  view.lobby.layoutCamera(844,390,false);
  assert.equal(view.lobby.camera.view.enabled,false);
  view.lobby.dispose();
});
