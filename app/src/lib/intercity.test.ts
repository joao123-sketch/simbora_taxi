import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cityAt, confirmState, locateCity, extraFromTotal, nearestCity, proposalLimit, proposalRange, tripEvents, type TripSnapshot } from './intercity';

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
  { id: 2, name: 'São Benedito', state: 'CE', active: true, lat: -4.05, lng: -40.86, radius_km: 8 },
  { id: 3, name: 'Ubajara', state: 'CE', active: true, lat: -3.85, lng: -40.92, radius_km: 8 },
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

test('proposalRange: 30% para cima e para baixo do valor calculado', () => {
  assert.deepEqual(proposalRange(100, 0.3), { min: 70, max: 130 });
  assert.deepEqual(proposalRange(10.55, 0.3), { min: 7.38, max: 13.72 });
});

test('proposalRange: o valor mínimo nunca fica abaixo de 1 centavo', () => {
  assert.equal(proposalRange(0.01, 1).min, 0.01);
});

test('extraFromTotal: diferença entre o valor pedido e o calculado, com sinal', () => {
  assert.equal(extraFromTotal(100, 120), 20);
  assert.equal(extraFromTotal(100, 80.5), -19.5);
  assert.equal(extraFromTotal(100, 100), 0);
});

// cityAt: a cidade ativa mais próxima cujo raio cobre o ponto
const ipu = { id: 10, name: 'Ipu', state: 'CE', active: true, lat: -4.32, lng: -40.71, radius_km: 8 };
const ipueiras = { id: 11, name: 'Ipueiras', state: 'CE', active: true, lat: -4.39, lng: -40.71, radius_km: 8 };

test('cityAt: no centro da cidade devolve ela', () => {
  assert.equal(cityAt({ lat: -4.32, lng: -40.71 }, [ipu, ipueiras])?.id, 10);
});

test('cityAt: fora do raio de todas devolve null', () => {
  assert.equal(cityAt({ lat: -3.0, lng: -39.0 }, [ipu, ipueiras]), null);
});

test('cityAt: com raios que se sobrepõem vale a mais próxima, não a primeira da lista', () => {
  // Ponto a ~2 km de Ipueiras e ~5,5 km de Ipu: as duas cobrem, vence Ipueiras.
  assert.equal(cityAt({ lat: -4.372, lng: -40.71 }, [ipu, ipueiras])?.id, 11);
});

test('cityAt: cidade desativada nunca é devolvida', () => {
  assert.equal(cityAt({ lat: -4.32, lng: -40.71 }, [{ ...ipu, active: false }]), null);
});

test('cityAt: o limite do raio vale (<=) e passou dele não vale', () => {
  // 1 grau de latitude = 111,19 km: 7,9 km ~ 0,0711 grau, 8,1 km ~ 0,0729 grau.
  assert.equal(cityAt({ lat: -4.32 + 0.0711, lng: -40.71 }, [ipu])?.id, 10);
  assert.equal(cityAt({ lat: -4.32 + 0.0729, lng: -40.71 }, [ipu]), null);
});

// locateCity: leva em conta a imprecisão da posição (celular sem GPS fino erra por vários km)
test('locateCity: posição dentro do raio devolve a cidade, sem bloquear', () => {
  assert.deepEqual(locateCity({ lat: -4.32, lng: -40.71 }, 0.02, [ipu, ipueiras]), { city: ipu, outside: false });
});

test('locateCity: posição grosseira fora do raio, mas com erro que alcança a cidade, não bloqueia', () => {
  // ~11 km ao norte de Ipu (raio 8 km) com erro de 5 km: pode estar dentro.
  const result = locateCity({ lat: -4.32 + 0.1, lng: -40.71 }, 5, [ipu]);
  assert.equal(result.outside, false);
  assert.equal(result.city?.id, 10);
});

test('locateCity: fora do raio mesmo descontando o erro bloqueia', () => {
  // ~11 km de Ipu com erro de 50 m: está fora de verdade.
  assert.deepEqual(locateCity({ lat: -4.32 + 0.1, lng: -40.71 }, 0.05, [ipu]), { city: null, outside: true });
});

test('locateCity: sem saber o erro, vale a posição como veio', () => {
  assert.deepEqual(locateCity({ lat: -4.32 + 0.1, lng: -40.71 }, null, [ipu]), { city: null, outside: true });
});

test('locateCity: na dúvida entre duas cidades, fica a mais próxima', () => {
  // Fora das duas (Ipu a ~12,2 km, Ipueiras a ~20 km), erro de 15 km alcança as duas.
  assert.equal(locateCity({ lat: -4.21, lng: -40.71 }, 15, [ipueiras, ipu]).city?.id, 10);
});

test('locateCity: cidade desativada não entra nem na dúvida', () => {
  assert.deepEqual(locateCity({ lat: -4.32, lng: -40.71 }, 30, [{ ...ipu, active: false }]), { city: null, outside: true });
});
