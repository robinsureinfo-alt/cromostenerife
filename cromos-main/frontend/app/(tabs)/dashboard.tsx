import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { http } from '../../src/api';
import { useAuth } from '../../src/auth';

type Stats = {
  busco_count: number;
  repetido_count: number;
  pending_exchanges: number;
  received_requests: number;
  unread_notifications: number;
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await http.get<Stats>('/dashboard');
      setStats(r.data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[s.wrap, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor="#22c55e" />}
    >
      <Text style={s.hello} testID="dashboard-hello">¡Hola, {profile?.display_name || user?.username}! 👋</Text>
      <Text style={s.sub}>{profile?.club ? profile.club : 'Completa tu perfil para empezar'}</Text>

      <View style={s.grid}>
        <Card label="Busco" value={stats?.busco_count ?? 0} color="#3b82f6" testID="stat-busco" />
        <Card label="Repetidos" value={stats?.repetido_count ?? 0} color="#22c55e" testID="stat-repetido" />
        <Card label="Pendientes" value={stats?.pending_exchanges ?? 0} color="#f59e0b" testID="stat-pending" />
        <Card label="Recibidas" value={stats?.received_requests ?? 0} color="#a855f7" testID="stat-received" />
      </View>

      <View style={s.tip}>
        <Text style={s.tipTitle}>💡 ¿Cómo funciona?</Text>
        <Text style={s.tipText}>
          1. Añade tus cromos: lo que <Text style={s.bold}>buscas</Text> y los que tienes <Text style={s.bold}>repetidos</Text>.{'\n'}
          2. Ve a <Text style={s.bold}>Match</Text> para ver coincidencias.{'\n'}
          3. Solicita un intercambio. El contacto se desbloquea cuando el otro acepta.
        </Text>
      </View>
    </ScrollView>
  );
}

function Card({ label, value, color, testID }: { label: string; value: number; color: string; testID?: string }) {
  return (
    <View style={[s.card, { borderColor: color + '55' }]} testID={testID}>
      <Text style={[s.cardVal, { color }]}>{value}</Text>
      <Text style={s.cardLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  hello: { color: '#fff', fontSize: 24, fontWeight: '700' },
  sub: { color: '#94a3b8', fontSize: 14, marginTop: 4, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  card: {
    backgroundColor: '#111c2e', borderWidth: 1, borderRadius: 12, padding: 16,
    flexBasis: '47%', flexGrow: 1, minWidth: 140,
  },
  cardVal: { fontSize: 32, fontWeight: '800' },
  cardLabel: { color: '#cbd5e1', fontSize: 14, marginTop: 4 },
  tip: { backgroundColor: '#0f1a2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 12, padding: 16 },
  tipTitle: { color: '#22c55e', fontWeight: '700', fontSize: 16, marginBottom: 8 },
  tipText: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  bold: { color: '#fff', fontWeight: '700' },
});
