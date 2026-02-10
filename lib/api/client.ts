import axios, { AxiosError, type AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { storage } from './storage';
import { ApiError } from './types';

const getBaseUrl = (): string => {
  // Use API URL from app.config.ts extra (preferred)
  const configApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configApiUrl && configApiUrl !== 'http://localhost:4000') {
    return configApiUrl;
  }

  // Fallback to environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Development fallbacks (only used when no explicit URL is configured)
  if (configApiUrl === 'http://localhost:4000') {
    if (Platform.OS === 'android') {
      // For Android emulator: 10.0.2.2 maps to host machine's localhost
      return 'http://10.0.2.2:4000';
    }
    // iOS simulator and web use localhost
    return 'http://localhost:4000';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  return 'http://localhost:4000';
};

// Log the resolved base URL for debugging (development only)
if (__DEV__) {
  console.log('[API Client] Base URL:', getBaseUrl());
}

// Callback for 401 responses - allows AuthContext to sync state
let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorized = (callback: (() => void) | null): void => {
  onUnauthorizedCallback = callback;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await storage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let isRefreshing = false;
let failedQueue: any[] = [];
// Shared promise so that concurrent callers (interceptor + tryRefreshTokens)
// de-duplicate into a single network request, preventing "token reuse" revocation.
let activeRefreshPromise: Promise<{
  access_token: string;
  refresh_token: string;
} | null> | null = null;

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Single, de-duplicated refresh call shared by the 401 interceptor AND
 * `tryRefreshTokens` (app-start / resume).  If a refresh is already
 * in-flight the same promise is returned so only ONE network request
 * hits the backend per refresh-token value.
 */
const doRefresh = (): Promise<{
  access_token: string;
  refresh_token: string;
} | null> => {
  if (activeRefreshPromise) return activeRefreshPromise;

  activeRefreshPromise = (async () => {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const response = await axios.post(
      `${getBaseUrl()}/auth/mobile/refresh`,
      { refresh_token: refreshToken },
      { timeout: 15000 },
    );

    const { access_token, refresh_token } = response.data;

    await storage.setAccessToken(access_token);
    await storage.setRefreshToken(refresh_token);

    apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`;

    return { access_token, refresh_token };
  })().finally(() => {
    activeRefreshPromise = null;
  });

  return activeRefreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Don't attempt token refresh for auth endpoints or non-401 errors
    // Auth endpoints include /auth/login, /auth/mobile/login, /auth/refresh, /auth/register, etc.
    const isAuthEndpoint = originalRequest.url?.includes('/auth/');
    if (
      error.response?.status === 401 &&
      !(originalRequest as any)._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      (originalRequest as any)._retry = true;
      isRefreshing = true;

      try {
        const result = await doRefresh();

        if (!result) {
          throw new Error('No refresh token available');
        }

        originalRequest.headers.Authorization = `Bearer ${result.access_token}`;
        processQueue(null, result.access_token);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Only clear tokens if the server explicitly rejected the refresh
        // (401, 403, 400). Do NOT clear on network errors – the tokens
        // may still be valid and will work once connectivity is restored.
        const refreshStatus =
          refreshError instanceof AxiosError
            ? refreshError.response?.status
            : undefined;
        const isAuthRejection =
          refreshStatus === 401 ||
          refreshStatus === 403 ||
          refreshStatus === 400;

        if (isAuthRejection) {
          await storage.clearTokens();
          onUnauthorizedCallback?.();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export const setAuthTokens = async (
  accessToken: string,
  refreshToken: string,
): Promise<void> => {
  await storage.setAccessToken(accessToken);
  await storage.setRefreshToken(refreshToken);
};

export const getAuthToken = async (): Promise<string | null> => {
  return storage.getAccessToken();
};

export const clearAuthTokens = async (): Promise<void> => {
  await storage.clearTokens();
};

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Used during app initialization when access token is expired but refresh token may be valid.
 * Returns the new tokens if successful, null if refresh fails.
 *
 * Uses the same de-duplicated `doRefresh` as the 401 interceptor so
 * concurrent calls never hit the backend twice with the same token.
 */
export const tryRefreshTokens = async (): Promise<{
  access_token: string;
  refresh_token: string;
} | null> => {
  try {
    return await doRefresh();
  } catch (error) {
    // Only clear tokens on explicit auth rejection (400/401/403).
    // Network errors should NOT clear tokens – the refresh token may
    // still be valid once connectivity returns.
    const status =
      error instanceof AxiosError ? error.response?.status : undefined;
    const isAuthRejection = status === 401 || status === 403 || status === 400;

    if (isAuthRejection) {
      await storage.clearTokens();
    } else {
      console.warn(
        '[API Client] Refresh failed (possibly network), keeping tokens:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
};
