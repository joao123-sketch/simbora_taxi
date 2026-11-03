import assert from 'node:assert/strict';
import { test } from 'node:test';

import { confirmState, nearestCity, proposalLimit, tripEvents, type TripSnapshot } from './intercity';

const trip = '2026-11-10T15:00:00Z';
const hoursBefore = (h: number) => new Date(new Date(trip).getTime() - h * 3600_000);

test('proposalLimit: 30% de 100 é 30', () => {
  assert.equal(proposalLimit(100, 0.3), 30);
});

test('proposalLimit arredonda para 2 casas', () => {
  assert.equal(proposalLimit(33.33, 0.3), 10);
  assert.equal(proposalLimit(10.55, 0.3), 3.17);
});

test('confirmState: viagem já confirmada não precisa de confirmação', () => {
  assert.equal(confirmState(trip, '2026-11-09T10:00:00Z', hoursBefore(20)), 'not_needed');
});

test('confirmState: mais de 12h antes ainda é cedo', () => {
  assert.equal(confirmState(trip, null, hoursBefore(20)), 'too_early');
  assert.equal(confirmState(trip, null, hoursBefore(12.01)), 'too_early');
});

test('confirmState: de 12h até 2h antes dá para confirmar', () => {
  assert.equal(confirmState(trip, null, hoursBefore(12)), 'open');
  assert.equal(confirmState(trip, null, hoursBefore(2.01)), 'open');
});

test('confirmState: com 2h ou menos o prazo acabou', () => {
  assert.equal(confirmState(trip, null, hoursBefore(2)), 'expired');
  assert.equal(confirmState(trip, null, hoursBefore(1)), 'expired');
});

const cities = [
  { id: 2, name: 'São Benedito', state: 'CE', active: true, lat: -4.05, lng: -40.86 },
  { id: 3, name: 'Ubajara', state: 'CE', active: true, lat: -3.85, lng: -40.92 },
];

test('nearestCity devolve a cidade mais próxima do ponto', () => {
  assert.equal(nearestCity({ lat: -3.86, lng: -40.91 }, cities)?.id, 3);
  assert.equal(nearestCity({ lat: -4.06, lng: -40.85 }, cities)?.id, 2);
});

test('nearestCity sem cidades devolve null', () => {
  assert.equal(nearestCity({ lat: 0, lng: 0 }, []), null);
});

const open: TripSnapshot = { status: 'requested', proposals: 0, confirmedAt: null, voided: false };

test('tripEvents: sem estado anterior não avisa nada', () => {
  assert.deepEqual(tripEvents(null, open, 'passenger'), []);
});

test('tripEvents: o mesmo estado não avisa nada', () => {
  assert.deepEqual(tripEvents(open, open, 'passenger'), []);
  assert.deepEqual(tripEvents(open, open, 'driver'), []);
});

test('tripEvents passageiro: nova proposta', () => {
  const events = tripEvents(open, { ...open, proposals: 1 }, 'passenger');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Nova proposta');
});

test('tripEvents passageiro: pedido que vence sem ninguém aceitar', () => {
  const events = tripEvents(open, { ...open, status: 'cancelled' }, 'passenger');
  assert.equal(events.length, 1);
  assert.match(events[0].title, /Ninguém aceitou/);
});

test('tripEvents passageiro: viagem sem efeito por falta de confirmação', () => {
  const accepted: TripSnapshot = { status: 'accepted', proposals: 0, confirmedAt: null, voided: false };
  const events = tripEvents(accepted, { ...accepted, status: 'cancelled', voided: true }, 'passenger');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Viagem sem efeito');
});

test('tripEvents passageiro: motorista cancelou a viagem aceita', () => {
  const accepted: TripSnapshot = { status: 'accepted', proposals: 0, confirmedAt: null, voided: false };
  const events = tripEvents(accepted, { ...accepted, status: 'cancelled' }, 'passenger');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Viagem cancelada');
});

test('tripEvents motorista: proposta escolhida pelo passageiro', () => {
  const events = tripEvents(open, { ...open, status: 'accepted' }, 'driver');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Sua proposta foi escolhida');
});

test('tripEvents motorista: viagem sem efeito libera o horário', () => {
  const accepted: TripSnapshot = { status: 'accepted', proposals: 0, confirmedAt: null, voided: false };
  const events = tripEvents(accepted, { ...accepted, status: 'cancelled', voided: true }, 'driver');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Viagem sem efeito');
  assert.match(events[0].body, /horário foi liberado/);
});

test('tripEvents motorista: passageiro confirmou a viagem', () => {
  const accepted: TripSnapshot = { status: 'accepted', proposals: 0, confirmedAt: null, voided: false };
  const events = tripEvents(accepted, { ...accepted, confirmedAt: '2026-11-10T08:00:00Z' }, 'driver');
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Viagem confirmada');
});
