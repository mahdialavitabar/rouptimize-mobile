import { apiClient } from '../client';

export interface User {
  id: string;
  name?: string;
  username: string;
  email?: string;
  phone?: string;
  address?: string;
  imageUrl?: string;
  companyId: string;
  branchId?: string;
  roleId?: string;
  company?: {
    id: string;
    name: string;
  };
  branch?: unknown;
  role?: {
    name: string;
    authorizations: string[];
  };
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  name?: string;
  password?: string;
  email?: string;
  phone?: string;
  address?: string;
  imageUrl?: string;
}

export const userService = {
  getUser: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  updateUser: async (id: string, data: UpdateUserRequest): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${id}`, data);
    return response.data;
  },
};
