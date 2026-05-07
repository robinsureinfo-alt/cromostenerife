import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { http } from '../../src/api';
import { useAuth } from '../../src/auth';

type Col = {
  id: string; name: string; season: string; total_cards?: number; description?: string;
  status: 'pending' | 'approved' | 'rejected';
  creator?: { username?: string; email?: string };
  created_at: string;
};
type Overview = {
  pending_collections: number; approved_collections: number; rejected_collections: number;
  total_users: number; completed_exchanges: number; pending_exchanges: number;
};

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function confirm(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(msg) : false);
  }
  return new Promise((resolve) => {
    Alert.alert('Confirmar', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}

export default function Admin() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [items, setItems] = useState<Col[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const [editing, setEditing] = useState<Col | null>(null);
  const [eName, setEName] = useState('');
  const [eSeason, setESeason] = useState('');
  const [eTotal, setETotal] = useState('');
  const [eDesc, setEDesc] = useState('');

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSeason, setNewSeason] = useState('');
  const [newTotal, setNewTotal] = useState('100');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async () => {
    try {
      const params = filter === 'all' ? '' : `?status_filter=${filter}`;
      const [oR, lR] = await Promise.all([
        http.get<Overview>('/admin/overview'),
        http.get<Col[]>(`/admin/collections${params}`),
      ]);
      setOverview(oR.data);
      setItems(lR.data);
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'No se pudo cargar');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    try { await http.post(`/admin/collections/${id}/approve`); await load(); }
    catch (e: any) { notify('Error', e?.response?.data?.detail || 'Acción fallida'); }
  };
  const reject = async (id: string) => {
    try { await http.post(`/admin/collections/${id}/reject`); await load(); }
    catch (e: any) { notify('Error', e?.response?.data?.detail || 'Acción fallida'); }
  };
  const remove = async (c: Col) => {
    if (!(await confirm(`¿Eliminar "${c.name} · ${c.season}"? Se borran también sus cromos.`))) return;
    try { await http.delete(`/admin/collections/${c.id}`); await load(); }
    catch (e: any) { notify('Error', e?.response?.data?.detail || 'Acción fallida'); }
  };
  const openEdit = (c: Col) => {
    setEditing(c);
    setEName(c.name); setESeason(c.season);
    setETotal(String(c.total_cards || 0)); setEDesc(c.description || '');
  };
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await http.put(`/admin/collections/${editing.id}`, {
        name: eName.trim(), season: eSeason.trim(),
        total_cards: parseInt(eTotal, 10) || 0, description: eDesc,
      });
      setEditing(null);
      await load();
    } catch (e: any) { notify('Error', e?.response?.data?.detail || 'Error'); }
  };
  const createNew = async () => {
    if (!newName.trim() || !newSeason.trim()) return notify('Atención', 'Nombre y temporada obligatorios.');
    try {
      await http.post('/admin/collections', {
        name: newName.trim(), season: newSeason.trim(),
        total_cards: parseInt(newTotal, 10) || 0, description: newDesc,
      });
      setCreating(false);
      setNewName(''); setNewSeason(''); setNewTotal('100'); setNewDesc('');
      await load();
    } catch (e: any) { notify('Error', e?.response?.data?.detail || 'Error'); }
  };

  if (user?.role !== 'admin') {
    return <View style={[s.wrap, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={s.empty}>🔒 Solo administradores</Text>
    </View>;
  }

  if (loading) return <View style={[s.wrap, { justifyContent: 'center' }]}><ActivityIndicator color="#22c55e" /></View>;

  const STATUS_COLORS: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#f87171' };

  return (
    <View style={s.wrap}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor="#22c55e" />}
      >
        {overview ? (
          <View style={s.statsGrid}>
            <Stat label="Pendientes" value={overview.pending_collections} color="#f59e0b" />
            <Stat label="Aprobadas" value={overview.approved_collections} color="#22c55e" />
            <Stat label="Rechazadas" value={overview.rejected_collections} color="#f87171" />
            <Stat label="Usuarios" value={overview.total_users} color="#60a5fa" />
            <Stat label="Cambios pend." value={overview.pending_exchanges} color="#a855f7" />
            <Stat label="Cambios OK" value={overview.completed_exchanges} color="#22c55e" />
          </View>
        ) : null}

        <View style={s.tabs}>
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <TouchableOpacity key={f} testID={`flt-${f}`} style={[s.tab, filter === f && s.tabActive]} onPress={() => setFilter(f)}>
              <Text style={[s.tabTxt, filter === f && s.tabTxtActive]}>
                {f === 'pending' ? '⏳ Pendientes' : f === 'approved' ? '✅ Aprobadas' : f === 'rejected' ? '❌ Rechazadas' : 'Todas'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity testID="admin-new-col" style={s.newBtn} onPress={() => setCreating(true)}>
          <Ionicons name="add-circle" size={20} color="#0b1220" />
          <Text style={s.newBtnTxt}>Crear colección oficial</Text>
        </TouchableOpacity>

        {items.length === 0 ? (
          <Text style={s.empty}>Sin colecciones {filter !== 'all' ? `en estado ${filter}` : ''}.</Text>
        ) : (
          items.map((c) => (
            <View key={c.id} style={s.card} testID={`admin-col-${c.id}`}>
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.colName}>{c.name}</Text>
                  <Text style={s.colSub}>{c.season} · {c.total_cards || 0} cromos</Text>
                  <Text style={s.colCreator}>Por: @{c.creator?.username || '?'}</Text>
                </View>
                <View style={[s.badge, { borderColor: STATUS_COLORS[c.status], backgroundColor: STATUS_COLORS[c.status] + '22' }]}>
                  <Text style={[s.badgeTxt, { color: STATUS_COLORS[c.status] }]}>
                    {c.status === 'pending' ? 'Pendiente' : c.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                  </Text>
                </View>
              </View>

              {c.description ? <Text style={s.colDesc}>{c.description}</Text> : null}

              <View style={s.actions}>
                {c.status !== 'approved' ? (
                  <TouchableOpacity testID={`appr-${c.id}`} style={[s.actBtn, s.actAppr]} onPress={() => approve(c.id)}>
                    <Ionicons name="checkmark-circle" size={16} color="#0b1220" />
                    <Text style={s.actApprTxt}>Aprobar</Text>
                  </TouchableOpacity>
                ) : null}
                {c.status !== 'rejected' ? (
                  <TouchableOpacity testID={`rej-${c.id}`} style={[s.actBtn, s.actRej]} onPress={() => reject(c.id)}>
                    <Ionicons name="close-circle" size={16} color="#f87171" />
                    <Text style={s.actRejTxt}>Rechazar</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity testID={`edit-${c.id}`} style={[s.actBtn, s.actEdit]} onPress={() => openEdit(c)}>
                  <Ionicons name="pencil" size={16} color="#60a5fa" />
                  <Text style={s.actEditTxt}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`del-${c.id}`} style={[s.actBtn, s.actDel]} onPress={() => remove(c)}>
                  <Ionicons name="trash" size={16} color="#f87171" />
                  <Text style={s.actDelTxt}>Borrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal editar */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Editar colección</Text>
            <Text style={s.label}>Nombre</Text>
            <TextInput style={s.input} value={eName} onChangeText={setEName} placeholderTextColor="#64748b" />
            <Text style={s.label}>Temporada</Text>
            <TextInput style={s.input} value={eSeason} onChangeText={setESeason} placeholderTextColor="#64748b" />
            <Text style={s.label}>Total cromos</Text>
            <TextInput style={s.input} value={eTotal} onChangeText={setETotal} keyboardType="numeric" placeholderTextColor="#64748b" />
            <Text style={s.label}>Descripción</Text>
            <TextInput style={[s.input, { minHeight: 60 }]} value={eDesc} onChangeText={setEDesc} multiline placeholderTextColor="#64748b" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setEditing(null)}>
                <Text style={s.btnGhostTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={saveEdit}>
                <Text style={s.btnPrimaryTxt}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal crear */}
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Nueva colección oficial</Text>
            <Text style={s.label}>Nombre</Text>
            <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="LaLiga Tenerife Base" placeholderTextColor="#64748b" />
            <Text style={s.label}>Temporada</Text>
            <TextInput style={s.input} value={newSeason} onChangeText={setNewSeason} placeholder="2025-2026" placeholderTextColor="#64748b" />
            <Text style={s.label}>Total cromos</Text>
            <TextInput style={s.input} value={newTotal} onChangeText={setNewTotal} keyboardType="numeric" placeholderTextColor="#64748b" />
            <Text style={s.label}>Descripción</Text>
            <TextInput style={[s.input, { minHeight: 60 }]} value={newDesc} onChangeText={setNewDesc} multiline placeholderTextColor="#64748b" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setCreating(false)}>
                <Text style={s.btnGhostTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="admin-create-submit" style={[s.btn, s.btnPrimary]} onPress={createNew}>
                <Text style={s.btnPrimaryTxt}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.stat, { borderColor: color + '55' }]}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 40 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stat: { backgroundColor: '#111c2e', borderWidth: 1, borderRadius: 10, padding: 12, flexBasis: '31%', flexGrow: 1, minWidth: 100 },
  statVal: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tab: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#111c2e', borderWidth: 1, borderColor: '#1f2a44' },
  tabActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  tabTxt: { color: '#cbd5e1', fontSize: 12 },
  tabTxtActive: { color: '#0b1220', fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22c55e', paddingVertical: 12, borderRadius: 10, marginBottom: 12 },
  newBtnTxt: { color: '#0b1220', fontWeight: '700' },
  card: { backgroundColor: '#111c2e', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1f2a44' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  colName: { color: '#fff', fontWeight: '700', fontSize: 16 },
  colSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  colCreator: { color: '#64748b', fontSize: 11, marginTop: 2 },
  colDesc: { color: '#cbd5e1', fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { fontWeight: '700', fontSize: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  actAppr: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  actApprTxt: { color: '#0b1220', fontSize: 12, fontWeight: '700' },
  actRej: { borderColor: '#f87171' },
  actRejTxt: { color: '#f87171', fontSize: 12, fontWeight: '600' },
  actEdit: { borderColor: '#60a5fa' },
  actEditTxt: { color: '#60a5fa', fontSize: 12, fontWeight: '600' },
  actDel: { borderColor: '#f87171', backgroundColor: '#3b1010' },
  actDelTxt: { color: '#f87171', fontSize: 12, fontWeight: '600' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0f1a2e', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  label: { color: '#cbd5e1', fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#22c55e' },
  btnPrimaryTxt: { color: '#0b1220', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#334155' },
  btnGhostTxt: { color: '#fff', fontWeight: '600' },
});
