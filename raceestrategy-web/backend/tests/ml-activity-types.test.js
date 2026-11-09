import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVITY_TYPES, isActivityType, suggestActivityType, defaultTypeForName} from '../ml-activity-types.js';

test('las categorías son un conjunto cerrado y no se admiten etiquetas ajenas',()=>{
  assert.equal(ACTIVITY_TYPES.length,6);
  assert.equal(isActivityType('competicion'),true);
  for(const invalid of ['Carrera','',null,'other',{},'COMPETICION'])assert.equal(isActivityType(invalid),false);
});
test('las sugerencias se basan exclusivamente en el nombre',()=>{
  assert.equal(suggestActivityType('Series 5 x 400m'), 'series');
  assert.equal(suggestActivityType('Intervalos 8 × 500'), 'series');
  assert.equal(suggestActivityType('Calentamiento previo'), 'recuperacion');
  assert.equal(suggestActivityType('Recuperación fácil'), 'recuperacion');
  assert.equal(suggestActivityType('Tempo 10k'), 'tempo');
  assert.equal(suggestActivityType('Rodaje largo'), 'rodaje');
});
test('no sugiere competiciones: incluso una media maratón requiere confirmación',()=>{
  for(const name of ['Media maratón de Murcia 2025','Carrera popular 10k','Maratón oficial','PR 5km']) {
    assert.notEqual(suggestActivityType(name),'competicion');
    assert.deepEqual(defaultTypeForName(name),{activityType:'sin_clasificar',typeSource:'unset'});
  }
});
test('conserva la diferencia entre sugerencia y marca manual',()=>{
  assert.deepEqual(defaultTypeForName('Rodaje 7 km'),{activityType:'rodaje',typeSource:'suggested'});
  assert.deepEqual(defaultTypeForName('Entreno jueves'),{activityType:'sin_clasificar',typeSource:'unset'});
});
