import { AxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { setAuthTokens } from '../client';
import { authService } from '../services/auth.service';
import type {
  ApiError,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '../types';

interface UseAuthMutationState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

interface UseAuthMutationReturn<
  TData,
  TVariables,
> extends UseAuthMutationState<TData> {
  mutate: (variables: TVariables) => Promise<TData | null>;
  reset: () => void;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const apiError = error.response?.data as ApiError | undefined;
    if (apiError?.message) {
      return Array.isArray(apiError.message)
        ? apiError.message.join(', ')
        : apiError.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

export function useLogin(): UseAuthMutationReturn<AuthResponse, LoginRequest> {
  const [state, setState] = useState<UseAuthMutationState<AuthResponse>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const mutate = useCallback(
    async (variables: LoginRequest): Promise<AuthResponse | null> => {
      setState({ data: null, error: null, isLoading: true });
      try {
        const response = await authService.login(variables);
        await setAuthTokens(response.access_token, response.refresh_token);
        setState({ data: response, error: null, isLoading: false });
        return response;
      } catch (error) {
        const message = extractErrorMessage(error);
        setState({ data: null, error: message, isLoading: false });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, mutate, reset };
}

export function useRegister(): UseAuthMutationReturn<
  AuthResponse,
  RegisterRequest
> {
  const [state, setState] = useState<UseAuthMutationState<AuthResponse>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const mutate = useCallback(
    async (variables: RegisterRequest): Promise<AuthResponse | null> => {
      setState({ data: null, error: null, isLoading: true });
      try {
        const response = await authService.register(variables);
        await setAuthTokens(response.access_token, response.refresh_token);
        setState({ data: response, error: null, isLoading: false });
        return response;
      } catch (error) {
        const message = extractErrorMessage(error);
        setState({ data: null, error: message, isLoading: false });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, mutate, reset };
}
