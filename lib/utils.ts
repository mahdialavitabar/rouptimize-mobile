import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an ISO date string or time string to a human-readable time format
 * Handles both full ISO dates (2026-01-02T18:59:00.000Z) and time strings (22:39:00)
 */
export function formatTimeWindow(
  timeString: string | null | undefined,
): string {
  if (!timeString) return 'N/A';

  try {
    // Check if it's an ISO date string (contains 'T')
    if (timeString.includes('T')) {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return timeString;
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // If it's just a time string (HH:MM:SS), format it
    const parts = timeString.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${ampm}`;
    }

    return timeString;
  } catch {
    return timeString;
  }
}

/**
 * Format an ISO date string to a human-readable date format
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

/**
 * Format distance in meters to human-readable format
 */
export function formatDistance(
  meters: number | string | null | undefined,
): string {
  const value = typeof meters === 'string' ? parseFloat(meters) : meters;
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }
  return `${Math.round(value)} m`;
}

/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(
  seconds: number | string | null | undefined,
): string {
  const value = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  if (value === 0) return '0m';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
