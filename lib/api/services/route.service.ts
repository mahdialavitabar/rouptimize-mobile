import { apiClient } from '../client';
import type { Route, RoutesQueryParams } from '../types';

export interface RoutesResponse {
  data: Route[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const routeService = {
  /**
   * Get all routes for the authenticated driver
   * Filters by driverId from JWT token by default
   */
  getRoutes: async (params?: RoutesQueryParams): Promise<Route[]> => {
    const response = await apiClient.get<RoutesResponse | Route[]>('/routes', {
      params,
    });

    // Handle both array and paginated response formats
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.data;
  },

  /**
   * Get a single route by ID with all missions and geometry
   */
  getRoute: async (id: string): Promise<Route> => {
    const response = await apiClient.get<Route>(`/routes/${id}`);
    return response.data;
  },

  /**
   * Get route geometry for map display
   * Returns GeoJSON LineString or MultiLineString
   */
  getRouteGeometry: async (
    id: string,
  ): Promise<GeoJSON.LineString | GeoJSON.MultiLineString | null> => {
    const route = await routeService.getRoute(id);
    return route.geometry ?? null;
  },
};
