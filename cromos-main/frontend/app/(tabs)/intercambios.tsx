import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Alert } from 'react-native';
import { http } from '../../src/api';
import { useAuth } from '../../src/auth';

type CardEntry = { card: { number: number; player_name?: string; card_type: string }; collection: { name: string } };
type Ex = {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
  requester_id: string;
  receiver_id: string;
  message: string;
  contact_unlocked: boolean;
  other: { user_id: string; username: string; display_name: string };
  requested_items?: CardEntry[];
  offered_items?: CardEntry[];
  // Compat antiguo
  requested?: CardEntry;
  offered?: CardEntry;
  contact?: { phone?: string; email?: string };
};

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

export default function Intercambios() {
  const { user } = useAuth();
  const [items, setItems] = useState<Ex[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await http.get<Ex[]>('/exchanges');
      setItems(r.data);
    } catch {} finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'accept' | 'reject') => {
    try {
      await http.post(`/exchanges/${id}/${action}`);
      await load();
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'Acción fallida');
    }
  };

  if (loading) return <View style={[s.wrap, { justifyContent: 'center' }]}><ActivityIndicator color="#22c55e" /></View>;

  const statusColor: Record<string, string> = {
    pending: '#f59e0b', accepted: '#22c55e', completed: '#22c55e',
    rejected: '#f87171', cancelled: '#94a3b8',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Pendiente', accepted: 'Aceptado', completed: 'Completado',
    rejected: 'Rechazado', cancelled: 'Cancelado',
  };

  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor="#22c55e" />}
    >
      {items.length === 0 ? (
        <Text style={s.empty}>Aún no tienes intercambios. Envía solicitudes desde Match.</Text>
      ) : (
        items.map((e) => {
          const isReceiver = e.receiver_id === user?.id;
          return (
            <View key={e.id} style={s.card} testID={`ex-${e.id}`}>
              <View style={s.head}>
                <Text style={s.user}>{e.other.display_name || e.other.username}</Text>
                <View style={[s.badge, { borderColor: statusColor[e.status], backgroundColor: statusColor[e.status] + '22' }]}>
                  <Text style={[s.badgeTxt, { color: statusColor[e.status] }]}>{statusLabel[e.status]}</Text>
                </View>
              </View>
              <Text style={s.subtle}>{isReceiver ? 'Recibida' : 'Enviada'}</Text>

              {(() => {
                const reqs = e.requested_items && e.requested_items.length > 0
                  ? e.requested_items
                  : (e.requested ? [e.requested] : []);
                const offs = e.offered_items && e.offered_items.length > 0
                  ? e.offered_items
                  : (e.offered ? [e.offered] : []);
                const cardLabel = (c: CardEntry) => {
                  const ct = c.card.card_type;
                  if (ct && ct !== 'normal') {
                    const ic = ct === 'ballondor' ? '🏆' : '⭐';
                    return `${ic} ${c.card.player_name || 'Especial'}`;
                  }
                  return `#${c.card.number}${c.card.player_name ? ` · ${c.card.player_name}` : ''}`;
                };
                return (
                  <>
                    {reqs.length > 0 ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={s.lineLbl}>Pide ({reqs.length}):</Text>
                        {reqs.slice(0, 4).map((c, i) => (
                          <Text key={i} style={s.line}>• {cardLabel(c)} ({c.collection.name})</Text>
                        ))}
                        {reqs.length > 4 ? <Text style={s.subtle}>+{reqs.length - 4} más</Text> : null}
                      </View>
                    ) : null}
                    {offs.length > 0 ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={s.lineLbl}>Ofrece ({offs.length}):</Text>
                        {offs.slice(0, 4).map((c, i) => (
                          <Text key={i} style={s.line}>• {cardLabel(c)} ({c.collection.name})</Text>
                        ))}
                        {offs.length > 4 ? <Text style={s.subtle}>+{offs.length - 4} más</Text> : null}
                      </View>
                    ) : null}
                  </>
                );
              })()}

              {e.contact ? (
                <View style={s.contact}>
                  <Text style={s.contactTitle}>📞 Contacto desbloqueado</Text>
                  {e.contact.email ? <Text style={s.contactLine}>Email: {e.contact.email}</Text> : null}
                  {e.contact.phone ? <Text style={s.contactLine}>Tel: {e.contact.phone}</Text> : null}
                </View>
              ) : null}

              {e.status === 'pending' && isReceiver ? (
                <View style={s.actions}>
                  <TouchableOpacity testID={`accept-${e.id}`} style={[s.btn, s.btnAccept]} onPress={() => act(e.id, 'accept')}>
                    <Text style={s.btnAcceptTxt}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`reject-${e.id}`} style={[s.btn, s.btnReject]} onPress={() => act(e.id, 'reject')}>
                    <Text style={s.btnRejectTxt}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#111c2e', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1f2a44' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  user: { color: '#fff', fontWeight: '700', fontSize: 16 },
  subtle: { color: '#64748b', fontSize: 11, marginTop: 2 },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { fontWeight: '700', fontSize: 11 },
  line: { color: '#cbd5e1', fontSize: 13, marginTop: 6 },
  lineLbl: { color: '#94a3b8', fontWeight: '600' },
  contact: { backgroundColor: '#0f2a1f', borderColor: '#22c55e', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  contactTitle: { color: '#22c55e', fontWeight: '700', marginBottom: 4 },
  contactLine: { color: '#cbd5e1', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnAccept: { backgroundColor: '#22c55e' },
  btnAcceptTxt: { color: '#0b1220', fontWeight: '700' },
  btnReject: { borderWidth: 1, borderColor: '#f87171' },
  btnRejectTxt: { color: '#f87171', fontWeight: '700' },
});
