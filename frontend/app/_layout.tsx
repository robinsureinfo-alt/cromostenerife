import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth';
import { StatusBar } from 'expo-status-bar';

function Gate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === 'login' || segments[0] === 'register';
    const inTabs = segments[0] === '(tabs)';
    if (!user && inTabs) router.replace('/login');
    else if (user && (inAuth || segments.length === 0)) {
      // Si el perfil no está completado (usuario recién registrado), llevar a Perfil
      if (profile && (profile as any).profile_completed === false) {
        router.replace('/(tabs)/perfil');
      } else {
        router.replace('/(tabs)/dashboard');
      }
    }
  }, [user, profile, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1220' } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}
