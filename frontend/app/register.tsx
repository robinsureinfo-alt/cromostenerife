import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../src/auth';

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUser] = useState('');
  const [password, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!email.trim() || !username.trim() || !password) return setErr('Rellena todos los campos.');
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), username.trim(), password);
      // Tras registro, llevar al usuario directamente al Perfil para completar sus datos
      router.replace('/(tabs)/perfil');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Error al registrarte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.wrap}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.logo}>⚽ CromoFútbol</Text>
          <Text style={s.title}>Crear cuenta</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            testID="reg-email"
            style={s.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address"
            placeholder="tu@email.com" placeholderTextColor="#64748b"
          />

          <Text style={s.label}>Usuario</Text>
          <TextInput
            testID="reg-username"
            style={s.input} value={username} onChangeText={setUser}
            autoCapitalize="none"
            placeholder="usuario123" placeholderTextColor="#64748b"
          />

          <Text style={s.label}>Contraseña</Text>
          <TextInput
            testID="reg-password"
            style={s.input} value={password} onChangeText={setPwd} secureTextEntry
            placeholder="6+ chars, Mayús, minús, número" placeholderTextColor="#64748b"
          />

          {err ? <Text style={s.err}>{err}</Text> : null}

          <TouchableOpacity testID="reg-submit" style={s.btn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#0b1220" /> : <Text style={s.btnTxt}>Crear cuenta</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerTxt}>¿Ya tienes cuenta? </Text>
            <Link href="/login" style={s.link}>Entra</Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  scroll: { padding: 24, paddingTop: 48 },
  logo: { color: '#22c55e', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  label: { color: '#cbd5e1', fontSize: 14, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 16,
  },
  btn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, marginTop: 24, alignItems: 'center' },
  btnTxt: { color: '#0b1220', fontWeight: '700', fontSize: 16 },
  err: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, alignItems: 'center' },
  footerTxt: { color: '#94a3b8' },
  link: { color: '#22c55e', fontWeight: '600' },
});
