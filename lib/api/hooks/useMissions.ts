import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { missionService } from '../services/mission.service';
import { routeService } from '../services/route.service';
import { vehicleAssignmentService } from '../services/vehicle-assignment.service';
import type { Mission, MissionsQueryParams, MissionStatus } from '../types';

interface UseMissionsResult {
  missions: Mission[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch missions for the authenticated driver
 * First tries to filter by driverId, then falls back to vehicleId from assignment
 * @param params Optional query parameters for filtering missions
 */
export function useMissions(params?: MissionsQueryParams): UseMissionsResult {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First try with driverId
      const driverId = params?.driverId ?? user?.driverId;
      if (driverId) {
        const data = await missionService.getMissions({ ...params, driverId });
        const driverMissions = data.filter((m) => m.status !== 'unassigned');
        if (driverMissions.length > 0) {
          setMissions(driverMissions);
          return;
        }
      }

      // Fallback: get driver's vehicle assignment and get missions from routes
      // This handles cases where missions are assigned to vehicles but driverId is null
      try {
        const assignment = await vehicleAssignmentService.getMyAssignment();
        if (assignment?.vehicleId) {
          const routes = await routeService.getRoutes({
            ...params,
            vehicleId: assignment.vehicleId,
          });
          // Extract missions from routes
          // Prefer routeMissions (has stopOrder + nested mission), fallback to flat missions array
          const allMissions: Mission[] = [];
          for (const route of routes) {
            if (route.routeMissions && route.routeMissions.length > 0) {
              // Use routeMissions - extract nested mission objects
              const extracted = route.routeMissions
                .map((rm) => rm.mission)
                .filter((m): m is Mission => m !== undefined);
              allMissions.push(...extracted);
            } else if (route.missions && route.missions.length > 0) {
              // Fallback to flat missions array
              allMissions.push(...route.missions);
            }
          }
          const driverMissions = allMissions.filter(
            (m) => m.status !== 'unassigned',
          );
          setMissions(driverMissions);
          return;
        }
      } catch {
        // No vehicle assignment found, continue with empty results
      }

      // No driverId and no vehicle assignment - return empty
      setMissions([]);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch missions'),
      );
    } finally {
      setLoading(false);
    }
  }, [params?.date, params?.driverId, user?.driverId]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  return { missions, loading, error, refetch: fetchMissions };
}

interface UseMissionResult {
  mission: Mission | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single mission by ID
 * @param id Mission ID
 */
export function useMission(id: string | undefined): UseMissionResult {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMission = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await missionService.getMission(id);
      setMission(data);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch mission'),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMission();
  }, [fetchMission]);

  return { mission, loading, error, refetch: fetchMission };
}

interface UseUpdateMissionStatusResult {
  updateStatus: (id: string, status: MissionStatus) => Promise<Mission | null>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to update mission status
 * Valid transitions for drivers:
 * - assigned -> inProgress (when driver starts delivery)
 * - inProgress -> delivered (when driver completes delivery)
 */
export function useUpdateMissionStatus(): UseUpdateMissionStatusResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateStatus = useCallback(
    async (id: string, status: MissionStatus): Promise<Mission | null> => {
      try {
        setLoading(true);
        setError(null);
        const data = await missionService.updateMissionStatus(id, status);
        return data;
      } catch (err) {
        const errorObj =
          err instanceof Error
            ? err
            : new Error('Failed to update mission status');
        setError(errorObj);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { updateStatus, loading, error };
}
