import { useRouter, useSegments } from 'expo-router';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    ActivityIndicator,
    AppState,
    AppStateStatus,
    View,
} from 'react-native';
import {
    clearAuthTokens,
    getAuthToken,
    setAuthTokens,
    setOnUnauthorized,
    tryRefreshTokens,
} from '../api/client';
import type { JwtPayload } from '../api/types';

/**
 * Base64url-safe decoder for JWT payloads.
 * Works in React Native/Hermes where global atob may not exist
 * and handles base64url encoding (- and _ characters, no padding).
 */
function base64UrlDecode(str: string): string {
  // Replace base64url characters with standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  // Decode using a method that works in React Native
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < base64.length; i += 4) {
    const a = chars.indexOf(base64[i]);
    const b = chars.indexOf(base64[i + 1]);
    const c = chars.indexOf(base64[i + 2]);
    const d = chars.indexOf(base64[i + 3]);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    output += String.fromCharCode((triple >> 16) & 0xff);
    if (base64[i + 2] !== '=')
      output += String.fromCharCode((triple >> 8) & 0xff);
    if (base64[i + 3] !== '=') output += String.fromCharCode(triple & 0xff);
  }
  return output;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = base64UrlDecode(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenExpired(payload: JwtPayload): boolean {
  const now = Date.now() / 1000;
  return payload.exp < now;
}

/**
 * Returns true if the token will expire within `thresholdSec` seconds.
 * Used to proactively refresh before the access token fully expires.
 */
function isTokenExpiringSoon(
  payload: JwtPayload,
  thresholdSec: number,
): boolean {
  const now = Date.now() / 1000;
  return payload.exp < now + thresholdSec;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: JwtPayload | null;
  token: string | null;
  signIn: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isRefreshingRef = useRef(false);

  const segments = useSegments();
  const router = useRouter();

  // Register callback for 401 responses to sync in-memory state (F3 fix)
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };
    setOnUnauthorized(handleUnauthorized);
    return () => setOnUnauthorized(null);
  }, []);

  /**
   * Attempt to load or refresh the auth token.
   * Returns true if authentication was restored successfully.
   */
  const restoreAuth = useCallback(async (): Promise<boolean> => {
    try {
      const storedToken = await getAuthToken();
      if (storedToken) {
        const payload = decodeJwt(storedToken);
        if (payload && !isTokenExpired(payload)) {
          // Access token is still valid
          setToken(storedToken);
          setUser(payload);
          return true;
        }
      }

      // Access token is missing, expired, or invalid – try refresh
      if (isRefreshingRef.current) return false;
      isRefreshingRef.current = true;

      try {
        const refreshed = await tryRefreshTokens();
        if (refreshed) {
          const newPayload = decodeJwt(refreshed.access_token);
          if (newPayload && !isTokenExpired(newPayload)) {
            setToken(refreshed.access_token);
            setUser(newPayload);
            return true;
          }
          // New token invalid (shouldn't happen) – clear
          await clearAuthTokens();
          return false;
        }

        // Refresh returned null — either auth rejected (tokens already cleared)
        // or network error (tokens preserved). If tokens still exist in
        // storage, treat user as authenticated with the stale token so they
        // don't get kicked to login on a transient network blip.
        const stillHasTokens = await getAuthToken();
        if (stillHasTokens) {
          const stalePayload = decodeJwt(stillHasTokens);
          if (stalePayload) {
            console.log(
              '[Auth] Refresh failed but tokens preserved – staying authenticated',
            );
            setToken(stillHasTokens);
            setUser(stalePayload);
            return true;
          }
        }

        return false;
      } finally {
        isRefreshingRef.current = false;
      }
    } catch {
      // Don't clear tokens on unexpected errors – be conservative
      return false;
    }
  }, []);

  // Initial auth restoration on mount
  useEffect(() => {
    const load = async () => {
      await restoreAuth();
      setIsLoading(false);
    };
    load();
  }, [restoreAuth]);

  // ---------------------------------------------------------------------------
  // Re-validate / refresh token when app returns to foreground.
  // This handles:
  //  - App minimized → OS killed process → cold restart (loadToken runs again)
  //  - App minimized → warm resume with possibly expired access token
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      // Check current access token validity
      const stored = await getAuthToken();
      if (!stored) {
        // No token at all – nothing to recover
        return;
      }

      const payload = decodeJwt(stored);

      // If access token is about to expire (within 60s) or already expired, refresh
      if (!payload || isTokenExpiringSoon(payload, 60)) {
        console.log(
          '[Auth] Access token expired/expiring on resume – refreshing',
        );
        const restored = await restoreAuth();
        if (!restored) {
          // Refresh also failed – force logout
          setToken(null);
          setUser(null);
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [restoreAuth]);

  // Navigation guard
  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const isAuthenticated = !!token;

    if (!isAuthenticated && !inAuthGroup) {
      (router as any).replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      (router as any).replace('/(tabs)/(home)');
    }
  }, [token, segments, isLoading, router]);

  const signIn = useCallback(
    async (accessToken: string, refreshToken: string) => {
      const payload = decodeJwt(accessToken);
      if (!payload || isTokenExpired(payload)) {
        throw new Error('Invalid or expired token');
      }
      await setAuthTokens(accessToken, refreshToken);
      setToken(accessToken);
      setUser(payload);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearAuthTokens();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!token,
      isLoading,
      user,
      token,
      signIn,
      signOut,
    }),
    [token, isLoading, user, signIn, signOut],
  );

  // -----------------------------------------------------------------------
  // CRITICAL: Do NOT render navigation children until auth state is resolved.
  // This prevents the flash of the login page on app start / resume.
  // -----------------------------------------------------------------------
  if (isLoading) {
    return (
      <AuthContext.Provider value={value}>
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
