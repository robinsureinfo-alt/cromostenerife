import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = 'cf_token';

export async function saveToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export const http = axios.create({ baseURL: API, timeout: 15000 });

http.interceptors.request.use(async (config) => {
  const t = await getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
