import { AxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { routeService } from '../services/route.service';
import { vehicleAssignmentService } from '../services/vehicle-assignment.service';
import type { Route, RoutesQueryParams } from '../types';

interface UseRoutesResult {
  routes: Route[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch routes for the authenticated driver
 * First tries to filter by driverId, then falls back to vehicleId from assignment
 * @param params Optional query parameters for filtering routes
 */
export function useRoutes(params?: RoutesQueryParams): UseRoutesResult {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First try with driverId
      const driverId = params?.driverId ?? user?.driverId;
      if (driverId) {
        const data = await routeService.getRoutes({ ...params, driverId });
        if (data.length > 0) {
          setRoutes(data);
          return;
        }
      }

      // Fallback: get driver's vehicle assignment and query by vehicleId
      // This handles cases where routes are assigned to vehicles but driverId is null
      try {
        const assignment = await vehicleAssignmentService.getMyAssignment();
        if (assignment?.vehicleId) {
          const data = await routeService.getRoutes({
            ...params,
            vehicleId: assignment.vehicleId,
          });
          setRoutes(data);
          return;
        }
      } catch {
        // No vehicle assignment found, continue with empty results
      }

      // No driverId and no vehicle assignment - return empty
      setRoutes([]);
    } catch (err) {
      const isNetwork = err instanceof AxiosError && !err.response;
      setError(
        isNetwork
          ? new Error(
              'Unable to connect to server. Check your internet connection and try again.',
            )
          : err instanceof Error
            ? err
            : new Error('Failed to fetch routes'),
      );
    } finally {
      setLoading(false);
    }
  }, [params?.date, params?.driverId, params?.vehicleId, user?.driverId]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  return { routes, loading, error, refetch: fetchRoutes };
}

interface UseRouteResult {
  route: Route | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single route by ID with all missions and geometry
 * @param id Route ID
 */
export function useRoute(id: string | undefined): UseRouteResult {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRoute = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await routeService.getRoute(id);
      setRoute(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch route'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  return { route, loading, error, refetch: fetchRoute };
}
