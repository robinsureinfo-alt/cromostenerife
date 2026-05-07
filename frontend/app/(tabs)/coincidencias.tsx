import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { http } from '../../src/api';

type Entry = { id: string; quantity?: number; card: { number: number; player_name?: string; card_type: string }; collection: { name: string } };
type Match = {
  user_id: string;
  display_name: string;
  club: string;
  cross_match: boolean;
  own_player_match?: boolean;
  they_have_you_want: Entry[];
  they_want_you_have: Entry[];
  they_have_your_player?: Entry[];
};

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function entryLabel(e: Entry): string {
  const ct = e.card.card_type;
  if (ct !== 'normal') {
    const icon = ct === 'ballondor' ? '🏆' : '⭐';
    return `${icon} ${e.card.player_name || 'Especial'}`;
  }
  return `#${e.card.number}${e.card.player_name ? ` · ${e.card.player_name}` : ''}`;
}

export default function Coincidencias() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const [selected, setSelected] = useState<Match | null>(null);
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());     // pides del otro
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set()); // les ofreces
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await http.get<Match[]>('/matches');
      setMatches(r.data);
    } catch { /* */ } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMatch = (m: Match) => {
    setSelected(m);
    // por defecto, marca todos los cromos disponibles (incluyendo los del jugador propio)
    const ownIds = (m.they_have_your_player || []).map((e) => e.id);
    setAskedIds(new Set([...m.they_have_you_want.map((e) => e.id), ...ownIds]));
    setOfferedIds(new Set(m.they_want_you_have.map((e) => e.id)));
    setMessage('');
  };

  const togAsk = (id: string) => {
    setAskedIds((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const togOffer = (id: string) => {
    setOfferedIds((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const submit = async () => {
    if (!selected) return;
    if (askedIds.size === 0 && offeredIds.size === 0) {
      return notify('Atención', 'Selecciona al menos un cromo.');
    }
    setSubmitting(true);
    try {
      await http.post('/exchanges', {
        receiver_id: selected.user_id,
        requested_entry_ids: Array.from(askedIds),
        offered_entry_ids: Array.from(offeredIds),
        message: message.trim(),
      });
      notify('¡Solicitud enviada!', `Pides ${askedIds.size} y ofreces ${offeredIds.size} cromos.`);
      setSelected(null);
      load();
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'No se pudo enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View style={[s.wrap, { justifyContent: 'center' }]}><ActivityIndicator color="#22c55e" /></View>;

  return (
    <View style={s.wrap}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor="#22c55e" />}
      >
        {matches.length === 0 ? (
          <Text style={s.empty}>Sin coincidencias todavía. Añade más cromos en Mis Cambios.</Text>
        ) : (
          matches.map((m) => (
            <View key={m.user_id} style={s.card} testID={`match-${m.user_id}`}>
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.user}>{m.display_name || 'Usuario'}</Text>
                  {m.club ? <Text style={s.club}>{m.club}</Text> : null}
                </View>
                {m.cross_match ? <View style={s.badge}><Text style={s.badgeTxt}>♻️ Cruzado</Text></View> : null}
                {!m.cross_match && m.own_player_match ? <View style={[s.badge, s.badgeOwn]}><Text style={[s.badgeTxt, s.badgeOwnTxt]}>⭐ Tu jugador</Text></View> : null}
              </View>

              {(m.they_have_your_player && m.they_have_your_player.length > 0) ? (
                <View style={s.block}>
                  <Text style={[s.blockTitle, s.blockTitleOwn]}>⭐ Tiene el cromo de tu jugador ({m.they_have_your_player.length}):</Text>
                  {m.they_have_your_player.slice(0, 5).map((e) => (
                    <Text key={e.id} style={s.itemOwn}>• {entryLabel(e)} ({e.collection.name})</Text>
                  ))}
                </View>
              ) : null}

              {m.they_have_you_want.length > 0 ? (
                <View style={s.block}>
                  <Text style={s.blockTitle}>Tienen lo que buscas ({m.they_have_you_want.length}):</Text>
                  {m.they_have_you_want.slice(0, 5).map((e) => (
                    <Text key={e.id} style={s.item}>• {entryLabel(e)} ({e.collection.name})</Text>
                  ))}
                  {m.they_have_you_want.length > 5 ? <Text style={s.more}>+{m.they_have_you_want.length - 5} más</Text> : null}
                </View>
              ) : null}

              {m.they_want_you_have.length > 0 ? (
                <View style={s.block}>
                  <Text style={s.blockTitle}>Quieren lo que tienes ({m.they_want_you_have.length}):</Text>
                  {m.they_want_you_have.slice(0, 5).map((e) => (
                    <Text key={e.id} style={s.item}>• {entryLabel(e)} ({e.collection.name})</Text>
                  ))}
                </View>
              ) : null}

              <TouchableOpacity testID={`open-${m.user_id}`} style={s.btn} onPress={() => openMatch(m)}>
                <Text style={s.btnTxt}>Proponer intercambio</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>Intercambio con {selected?.display_name}</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Ionicons name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {selected && selected.they_have_your_player && selected.they_have_your_player.length > 0 ? (
                <>
                  <Text style={[s.section, s.sectionOwn]}>⭐ Tu jugador ({(selected.they_have_your_player.filter((e) => askedIds.has(e.id)).length)}/{selected.they_have_your_player.length})</Text>
                  <View style={s.actionsMini}>
                    <TouchableOpacity onPress={() => setAskedIds((p) => { const s2 = new Set(p); (selected.they_have_your_player || []).forEach((e) => s2.add(e.id)); return s2; })}><Text style={s.miniLink}>Todos</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setAskedIds((p) => { const s2 = new Set(p); (selected.they_have_your_player || []).forEach((e) => s2.delete(e.id)); return s2; })}><Text style={s.miniLink}>Ninguno</Text></TouchableOpacity>
                  </View>
                  {selected.they_have_your_player.map((e) => {
                    const on = askedIds.has(e.id);
                    return (
                      <TouchableOpacity key={e.id} style={[s.checkRow, on && s.checkRowOn]} onPress={() => togAsk(e.id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#22c55e' : '#64748b'} />
                        <Text style={[s.checkTxt, on && s.checkTxtOn]}>{entryLabel(e)} <Text style={s.checkColl}>· {e.collection.name}</Text></Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {selected && selected.they_have_you_want.length > 0 ? (
                <>
                  <Text style={s.section}>Cromos que pides ({askedIds.size}/{selected.they_have_you_want.length})</Text>
                  <View style={s.actionsMini}>
                    <TouchableOpacity onPress={() => setAskedIds(new Set(selected.they_have_you_want.map((e) => e.id)))}><Text style={s.miniLink}>Todos</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setAskedIds(new Set())}><Text style={s.miniLink}>Ninguno</Text></TouchableOpacity>
                  </View>
                  {selected.they_have_you_want.map((e) => {
                    const on = askedIds.has(e.id);
                    return (
                      <TouchableOpacity key={e.id} style={[s.checkRow, on && s.checkRowOn]} onPress={() => togAsk(e.id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#22c55e' : '#64748b'} />
                        <Text style={[s.checkTxt, on && s.checkTxtOn]}>{entryLabel(e)} <Text style={s.checkColl}>· {e.collection.name}</Text></Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {selected && selected.they_want_you_have.length > 0 ? (
                <>
                  <Text style={s.section}>Cromos que ofreces ({offeredIds.size}/{selected.they_want_you_have.length})</Text>
                  <View style={s.actionsMini}>
                    <TouchableOpacity onPress={() => setOfferedIds(new Set(selected.they_want_you_have.map((e) => e.id)))}><Text style={s.miniLink}>Todos</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setOfferedIds(new Set())}><Text style={s.miniLink}>Ninguno</Text></TouchableOpacity>
                  </View>
                  {selected.they_want_you_have.map((e) => {
                    const on = offeredIds.has(e.id);
                    return (
                      <TouchableOpacity key={e.id} style={[s.checkRow, on && s.checkRowOn]} onPress={() => togOffer(e.id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#22c55e' : '#64748b'} />
                        <Text style={[s.checkTxt, on && s.checkTxtOn]}>{entryLabel(e)} <Text style={s.checkColl}>· {e.collection.name}</Text></Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              <Text style={s.section}>Mensaje (opcional)</Text>
              <TextInput
                style={[s.input, { minHeight: 60 }]}
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="Hola, ¿qué te parece?"
                placeholderTextColor="#64748b"
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity style={[s.btnFooter, s.btnGhost]} onPress={() => setSelected(null)}>
                  <Text style={s.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="send-exchange" style={[s.btnFooter, s.btnPrimary]} onPress={submit} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#0b1220" /> : (
                    <Text style={s.btnPrimaryTxt}>Enviar ({askedIds.size}↔{offeredIds.size})</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#111c2e', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1f2a44' },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  user: { color: '#fff', fontWeight: '700', fontSize: 16 },
  club: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: '#22c55e22', borderColor: '#22c55e', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { color: '#22c55e', fontSize: 11, fontWeight: '700' },
  badgeOwn: { backgroundColor: '#f59e0b22', borderColor: '#f59e0b' },
  badgeOwnTxt: { color: '#f59e0b' },
  block: { marginTop: 8, paddingLeft: 4 },
  blockTitle: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  blockTitleOwn: { color: '#f59e0b' },
  item: { color: '#94a3b8', fontSize: 13, marginVertical: 1 },
  itemOwn: { color: '#fbbf24', fontSize: 13, marginVertical: 1, fontWeight: '600' },
  more: { color: '#22c55e', fontSize: 12, marginTop: 2 },
  btn: { backgroundColor: '#22c55e', paddingVertical: 12, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  btnTxt: { color: '#0b1220', fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0f1a2e', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  section: { color: '#22c55e', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  sectionOwn: { color: '#f59e0b' },
  actionsMini: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  miniLink: { color: '#60a5fa', fontSize: 12, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#111c2e', borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: '#1f2a44' },
  checkRowOn: { borderColor: '#22c55e', backgroundColor: '#0f2a1f' },
  checkTxt: { color: '#cbd5e1', fontSize: 13, flex: 1 },
  checkTxtOn: { color: '#fff' },
  checkColl: { color: '#64748b', fontSize: 11 },
  input: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  btnFooter: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#22c55e' },
  btnPrimaryTxt: { color: '#0b1220', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#334155' },
  btnGhostTxt: { color: '#fff', fontWeight: '600' },
});
