import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { http } from '../../src/api';
import { useAuth } from '../../src/auth';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

export default function Perfil() {
  const router = useRouter();
  const { user, profile, logout, refresh } = useAuth();
  const [displayName, setDN] = useState('');
  const [club, setClub] = useState('');
  const [category, setCat] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [ownPlayer, setOwnPlayer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDN(profile.display_name || '');
      setClub((profile as any).club || '');
      setCat((profile as any).category || '');
      setPhone((profile as any).phone || '');
      setCity((profile as any).city_zone || '');
      setBio((profile as any).bio || '');
      setOwnPlayer((profile as any).own_player_name || '');
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      await http.put('/profile/me', {
        display_name: displayName, club, category, phone, city_zone: city, bio,
        own_player_name: ownPlayer,
      });
      await refresh();
      notify('Guardado', 'Perfil actualizado');
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <View style={s.head}>
        <View style={s.avatar}><Text style={s.avatarTxt}>{(displayName || user?.username || '?')[0].toUpperCase()}</Text></View>
        <Text style={s.user}>@{user?.username}</Text>
        <Text style={s.email}>{user?.email}</Text>
        {user?.role === 'admin' ? <Text style={s.role}>👑 Administrador</Text> : null}
      </View>

      <Text style={s.label}>Nombre visible *</Text>
      <TextInput testID="prof-name" style={s.input} value={displayName} onChangeText={setDN} placeholder="Carlos" placeholderTextColor="#64748b" />

      <Text style={s.label}>Club</Text>
      <TextInput style={s.input} value={club} onChangeText={setClub} placeholder="CD Tenerife" placeholderTextColor="#64748b" />

      <Text style={s.label}>Categoría</Text>
      <TextInput style={s.input} value={category} onChangeText={setCat} placeholder="Alevín" placeholderTextColor="#64748b" />

      <Text style={s.label}>Teléfono / WhatsApp</Text>
      <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" placeholderTextColor="#64748b" />

      <Text style={s.label}>Zona</Text>
      <TextInput style={s.input} value={city} onChangeText={setCity} placeholder="La Laguna" placeholderTextColor="#64748b" />

      <Text style={s.label}>Nombre de tu jugador (para cromos especiales)</Text>
      <TextInput
        testID="prof-own-player"
        style={s.input}
        value={ownPlayer}
        onChangeText={setOwnPlayer}
        placeholder="Ej: Alejandro García"
        placeholderTextColor="#64748b"
      />
      <Text style={s.hint}>Así otros pueden saber qué cromo especial tuyo buscar.</Text>

      <Text style={s.label}>Bio</Text>
      <TextInput style={[s.input, { minHeight: 80 }]} value={bio} onChangeText={setBio} multiline placeholder="Sobre ti..." placeholderTextColor="#64748b" />

      <TouchableOpacity testID="prof-save" style={s.btn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#0b1220" /> : <Text style={s.btnTxt}>Guardar perfil</Text>}
      </TouchableOpacity>

      <TouchableOpacity testID="prof-logout" style={[s.btn, s.btnDanger]} onPress={onLogout}>
        <Text style={s.btnDangerTxt}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  head: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarTxt: { color: '#0b1220', fontSize: 32, fontWeight: '800' },
  user: { color: '#fff', fontSize: 18, fontWeight: '700' },
  email: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  role: { color: '#f59e0b', fontSize: 12, marginTop: 4, fontWeight: '700' },
  label: { color: '#cbd5e1', fontSize: 13, marginBottom: 6, marginTop: 14 },
  hint: { color: '#64748b', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15 },
  btn: { backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnTxt: { color: '#0b1220', fontWeight: '700' },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#f87171', marginTop: 12 },
  btnDangerTxt: { color: '#f87171', fontWeight: '700' },
});
