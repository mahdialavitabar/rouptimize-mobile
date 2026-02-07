import { apiClient } from '../client';
import type {
  Mission,
  MissionsQueryParams,
  MissionStatus,
  UpdateMissionStatusRequest,
} from '../types';

export interface MissionsResponse {
  data: Mission[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const missionService = {
  /**
   * Get all missions for the authenticated driver
   * Filters by driverId from JWT token by default
   */
  getMissions: async (params?: MissionsQueryParams): Promise<Mission[]> => {
    const response = await apiClient.get<MissionsResponse | Mission[]>(
      '/missions',
      {
        params,
      },
    );

    // Handle both array and paginated response formats
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.data;
  },

  /**
   * Get a single mission by ID
   */
  getMission: async (id: string): Promise<Mission> => {
    const response = await apiClient.get<Mission>(`/missions/${id}`);
    return response.data;
  },

  /**
   * Update mission status
   * Valid transitions for drivers:
   * - assigned -> inProgress (when driver starts delivery)
   * - inProgress -> delivered (when driver completes delivery)
   */
  updateMissionStatus: async (
    id: string,
    status: MissionStatus,
  ): Promise<Mission> => {
    const response = await apiClient.patch<Mission>(`/missions/${id}`, {
      status,
    } as UpdateMissionStatusRequest);
    return response.data;
  },
};
