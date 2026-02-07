import { AxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import {
  userService,
  type UpdateUserRequest,
  type User,
} from '../services/user.service';
import type { ApiError } from '../types';

interface UseUserState {
  data: User | null;
  error: string | null;
  isLoading: boolean;
}

interface UseUpdateUserState {
  data: User | null;
  error: string | null;
  isLoading: boolean;
}

interface UseUpdateUserReturn extends UseUpdateUserState {
  mutate: (variables: {
    id: string;
    data: UpdateUserRequest;
  }) => Promise<User | null>;
  reset: () => void;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    // Network error (no response from server)
    if (!error.response) {
      return 'Unable to connect to server. Check your internet connection and try again.';
    }
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

interface UseUserReturn extends UseUserState {
  refetch: () => Promise<void>;
}

export function useUser(id: string): UseUserReturn {
  const [state, setState] = useState<UseUserState>({
    data: null,
    error: null,
    isLoading: false,
  });

  const fetchUser = useCallback(async () => {
    if (!id) return;

    setState({ data: null, error: null, isLoading: true });
    try {
      const user = await userService.getUser(id);
      setState({ data: user, error: null, isLoading: false });
    } catch (error) {
      const message = extractErrorMessage(error);
      setState({ data: null, error: message, isLoading: false });
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { ...state, refetch: fetchUser };
}

export function useUpdateUser(): UseUpdateUserReturn {
  const [state, setState] = useState<UseUpdateUserState>({
    data: null,
    error: null,
    isLoading: false,
  });

  const mutate = useCallback(
    async (variables: {
      id: string;
      data: UpdateUserRequest;
    }): Promise<User | null> => {
      setState({ data: null, error: null, isLoading: true });
      try {
        const response = await userService.updateUser(
          variables.id,
          variables.data,
        );
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
