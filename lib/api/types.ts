export interface LoginRequest {
  username: string;
  password: string;
  companyId?: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  inviteCode: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  companyId?: string;
  branchId?: string;
  driverId?: string;
  actorType: 'mobile' | 'web';
  role?: {
    name: string;
    authorizations: string[];
  };
  isSuperAdmin: boolean;
  iat: number;
  exp: number;
}

// ============================================================================
// Mission Types
// ============================================================================

export enum MissionStatus {
  UNASSIGNED = 'unassigned',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'inProgress',
  DELIVERED = 'delivered',
}

export interface Mission {
  id: string;
  companyId: string;
  branchId?: string;
  date: string;
  customerName: string;
  phone: string;
  address: string;
  routeId?: string;
  latitude: number;
  longitude: number;
  deliveryTime?: string | null;
  startTimeWindow: string;
  endTimeWindow: string;
  assignmentId?: string;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  status: MissionStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface MissionsQueryParams {
  date?: string;
  driverId?: string;
}

export interface UpdateMissionStatusRequest {
  status: MissionStatus;
}

// ============================================================================
// Route Types
// ============================================================================

export enum RouteStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
}

export interface RouteMission {
  id: string;
  missionId: string;
  stopOrder: number;
  mission?: Mission;
}

export interface Route {
  id: string;
  companyId: string;
  branchId?: string;
  date: string;
  name: string;
  description?: string;
  status: RouteStatus;
  geometry?: GeoJSON.LineString | GeoJSON.MultiLineString | null;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  vehicleId?: string;
  driverId?: string;
  /** Direct list of missions - flat array from API */
  missions?: Mission[];
  /** Route missions with stop order - contains nested mission object */
  routeMissions?: RouteMission[];
  vehicle?: {
    id: string;
    plateNumber: string;
    vin?: string;
    model?: string;
  } | null;
  driver?: {
    id: string;
    name?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoutesQueryParams {
  date?: string;
  driverId?: string;
  vehicleId?: string;
}
