// ---------------------------------------------------------------------------
// Rouptimize – Centralized Brand & Semantic Color Palette
// ---------------------------------------------------------------------------
// All UI colors should reference this file so the theme stays consistent.
// The primary brand color is ORANGE. Status / purpose icons use distinct
// semantic hues so users can tell at a glance what each element represents.
// ---------------------------------------------------------------------------

// ── Brand / Primary (Orange) ────────────────────────────────────────────────
export const BRAND = {
  /** Main brand orange – buttons, active tabs, links, primary accents */
  primary: '#F97316',        // orange-500
  /** Slightly darker – pressed states, light-mode active tint */
  primaryDark: '#EA580C',    // orange-600
  /** Deeper – borders, route outlines on maps */
  primaryDeep: '#C2410C',    // orange-700
  /** Lighter – dark-mode active tint, highlights */
  primaryLight: '#FB923C',   // orange-400
  /** Very light bg tints (light mode badges / pills) */
  primaryBg: '#FFEDD5',      // orange-100
  /** Subtle bg (light mode) */
  primaryBgSubtle: '#FFF7ED', // orange-50
  /** Brand with opacity helpers (use with template strings) */
  primaryRgb: '249, 115, 22', // rgb components for rgba()
} as const;

// ── Semantic / Purpose-based Icon Colors ────────────────────────────────────
// These give each feature area a unique, recognisable hue.
export const SEMANTIC = {
  /** Navigation, routes, map directions */
  navigation: { light: '#059669', dark: '#10B981' },        // emerald
  /** Missions & assignments (neutral/unstarted) */
  mission: { light: '#F97316', dark: '#FB923C' },            // orange (brand)
  /** Location / GPS / tracking */
  location: { light: '#0D9488', dark: '#14B8A6' },           // teal
  /** Phone / communication */
  phone: { light: '#0891B2', dark: '#22D3EE' },              // cyan
  /** People / profile */
  profile: { light: '#7C3AED', dark: '#A78BFA' },            // violet
  /** Edit / modify actions */
  edit: { light: '#EA580C', dark: '#FB923C' },               // orange
  /** Calendar / schedule */
  calendar: { light: '#4F46E5', dark: '#818CF8' },           // indigo
  /** Business / company */
  company: { light: '#7C3AED', dark: '#A78BFA' },            // violet
  /** Packages / deliveries */
  delivery: { light: '#F97316', dark: '#FB923C' },           // orange (brand)
  /** Route / map path */
  route: { light: '#0D9488', dark: '#14B8A6' },              // teal
  /** Data / analytics */
  data: { light: '#2563EB', dark: '#60A5FA' },               // blue (fine for data)
  /** Cloud / upload / sync */
  cloud: { light: '#0284C7', dark: '#38BDF8' },              // sky
} as const;

// ── Mission / Delivery Status Colors ────────────────────────────────────────
// Kept universally recognisable (traffic-light pattern).
export const STATUS = {
  unassigned: {
    color: '#6B7280',          // gray-500
    bgColor: '#F3F4F6',       // gray-100
    bgColorDark: '#374151',   // gray-700
    pulseColor: 'rgba(107, 114, 128, 0.3)',
  },
  assigned: {
    color: '#F97316',          // orange-500 (brand – "ready to go")
    bgColor: '#FFEDD5',       // orange-100
    bgColorDark: 'rgba(249, 115, 22, 0.18)',
    pulseColor: 'rgba(249, 115, 22, 0.3)',
  },
  inProgress: {
    color: '#F59E0B',          // amber-500 (keep – well understood)
    bgColor: '#FEF3C7',       // amber-100
    bgColorDark: 'rgba(245, 158, 11, 0.18)',
    pulseColor: 'rgba(245, 158, 11, 0.4)',
  },
  delivered: {
    color: '#10B981',          // emerald-500
    bgColor: '#D1FAE5',       // emerald-100
    bgColorDark: 'rgba(16, 185, 129, 0.18)',
    pulseColor: 'rgba(16, 185, 129, 0.3)',
  },
} as const;

// ── Route Status Colors ─────────────────────────────────────────────────────
export const ROUTE_STATUS = {
  draft: { color: '#6B7280', bgColor: '#F3F4F6' },
  planned: { color: '#F97316', bgColor: '#FFEDD5' },        // orange (brand)
  in_progress: { color: '#F59E0B', bgColor: '#FEF3C7' },    // amber
  completed: { color: '#10B981', bgColor: '#D1FAE5' },       // emerald
  delayed: { color: '#EF4444', bgColor: '#FEE2E2' },         // red
} as const;

// ── Map-specific Colors ─────────────────────────────────────────────────────
export const MAP = {
  /** Route line main color */
  routeLine: '#F97316',            // orange-500
  /** Route line in dark mode */
  routeLineDark: '#FB923C',        // orange-400
  /** Route line glow/border */
  routeLineBorder: '#EA580C',      // orange-600
  /** Route line shadow (subtle) */
  routeLineShadow: '#C2410C',      // orange-700
  /** Route halo (wide, low opacity) */
  routeHaloLight: '#FDBA74',       // orange-300
  routeHaloDark: '#7C2D12',        // orange-900
  /** Active accent on map controls */
  controlAccent: '#F97316',        // orange-500
  /** User location puck */
  locationPuck: '#F97316',         // orange-500
  /** Start marker */
  startMarker: '#22C55E',          // green-500 (keep – universal)
  /** End marker */
  endMarker: '#EF4444',            // red-500 (keep – universal)
  /** Selection indicator on map style cards */
  selectionBorder: '#F97316',      // orange-500
} as const;

// ── Tab Bar ─────────────────────────────────────────────────────────────────
export const TAB_BAR = {
  activeTintLight: '#EA580C',      // orange-600
  activeTintDark: '#FB923C',       // orange-400
  inactiveTintLight: '#9CA3AF',    // gray-400
  inactiveTintDark: '#6B7280',     // gray-500
} as const;

// ── Neutral / Chrome ────────────────────────────────────────────────────────
export const NEUTRAL = {
  /** Subtle icon color – light mode */
  iconLight: '#6B7280',   // gray-500
  /** Subtle icon color – dark mode */
  iconDark: '#9CA3AF',    // gray-400
  /** Muted text – light mode */
  mutedLight: '#6B7280',
  /** Muted text – dark mode */
  mutedDark: '#9CA3AF',
  /** Divider – light */
  dividerLight: '#F3F4F6',
  /** Divider – dark */
  dividerDark: '#1F2937',
  /** Card background – dark mode */
  cardDark: '#1F2937',
  /** Surface – dark mode */
  surfaceDark: '#111827',
} as const;

// ── Feedback ────────────────────────────────────────────────────────────────
export const FEEDBACK = {
  error: '#EF4444',
  errorBg: '#FEE2E2',
  warning: '#FBBC04',
  warningBg: '#FEF3C7',
  success: '#10B981',
  successBg: '#D1FAE5',
  info: '#0EA5E9',
  infoBg: '#E0F2FE',
} as const;

// ── Streaming Status ────────────────────────────────────────────────────────
export const STREAMING = {
  live: '#34A853',
  draining: '#FBBC04',
  error: '#EA4335',
  off: '#9CA3AF',
} as const;

// ── Sensor Breakdown ────────────────────────────────────────────────────────
export const SENSOR = {
  accelerometer: '#F97316',    // orange (brand)
  gyroscope: '#8B5CF6',        // violet
  location: '#0D9488',         // teal
} as const;

// ---------------------------------------------------------------------------
// Helper: pick light / dark variant from a { light, dark } pair
// ---------------------------------------------------------------------------
export function pickColor(
  pair: { light: string; dark: string },
  isDark: boolean,
): string {
  return isDark ? pair.dark : pair.light;
}
