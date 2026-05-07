import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Landing() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.wrap}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.logo}>⚽ CromoFútbol</Text>
          <Text style={s.tag}>Tenerife</Text>
          <Text style={s.title}>Intercambia cromos de fútbol base en Canarias</Text>
          <Text style={s.sub}>
            Lógica simple: tu &quot;Busco&quot; + el &quot;Repetido&quot; del otro = posible intercambio.
            Privacidad: contacto solo cuando aceptas.
          </Text>
          <TouchableOpacity testID="cta-register" style={s.btnPrimary} onPress={() => router.push('/register')}>
            <Text style={s.btnPrimaryTxt}>Crear cuenta gratis</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="cta-login" style={s.btnSecondary} onPress={() => router.push('/login')}>
            <Text style={s.btnSecondaryTxt}>Iniciar sesión</Text>
          </TouchableOpacity>
        </View>
        <View style={s.features}>
          {[
            { t: '🎯 Coincidencias', d: 'Detecta automáticamente los intercambios posibles.' },
            { t: '👨‍👩‍👧 Múltiples niños', d: 'Gestiona cromos de varios niños desde una cuenta.' },
            { t: '🔒 Privacidad', d: 'Tu contacto solo se comparte tras aceptar el intercambio.' },
            { t: '⭐ Especiales', d: 'Marca cromos Balón de Oro y especiales con prioridad.' },
          ].map((f) => (
            <View key={f.t} style={s.card}>
              <Text style={s.cardTitle}>{f.t}</Text>
              <Text style={s.cardDesc}>{f.d}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  scroll: { padding: 24, paddingBottom: 48 },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logo: { color: '#22c55e', fontSize: 36, fontWeight: '800' },
  tag: { color: '#94a3b8', fontSize: 14, letterSpacing: 4, marginTop: 4, marginBottom: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  sub: { color: '#cbd5e1', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  btnPrimary: { backgroundColor: '#22c55e', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, marginBottom: 12, minWidth: 240 },
  btnPrimaryTxt: { color: '#0b1220', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  btnSecondary: { borderWidth: 1, borderColor: '#334155', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, minWidth: 240 },
  btnSecondaryTxt: { color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 },
  features: { gap: 12 },
  card: { backgroundColor: '#111c2e', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1f2a44' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardDesc: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
});
