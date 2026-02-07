import { apiClient } from '../client';

export interface VehicleDriverAssignment {
  id: string;
  vehicleId: string;
  driverId: string;
  startDate: string;
  endDate?: string;
  vehicle: {
    id: string;
    vin: string;
    plateNumber: string;
  };
}

export const vehicleAssignmentService = {
  getMyAssignment: async (): Promise<VehicleDriverAssignment> => {
    const response = await apiClient.get<VehicleDriverAssignment>(
      '/vehicle-driver-assignments/me',
    );
    return response.data;
  },
};
