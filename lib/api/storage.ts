import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

// SecureStore is not available on web, so we need a fallback or conditional logic
// For this project, we assume mobile-only usage for SecureStore, but good to be safe.
const isSecureStoreAvailable = Platform.OS !== 'web';

export const storage = {
  async getAccessToken(): Promise<string | null> {
    if (!isSecureStoreAvailable) return null;
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setAccessToken(token: string): Promise<void> {
    if (!isSecureStoreAvailable) return;
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken(): Promise<string | null> {
    if (!isSecureStoreAvailable) return null;
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    if (!isSecureStoreAvailable) return;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async clearTokens(): Promise<void> {
    if (!isSecureStoreAvailable) return;
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
