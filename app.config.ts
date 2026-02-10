import * as dotenv from 'dotenv';
import { ConfigContext, ExpoConfig } from 'expo/config';
import * as path from 'path';

// Load env from project root (try .env.development first, then .env)
const isDevelopment =
  !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const envFile = isDevelopment ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `./${envFile}`) });
// Also try loading .env as fallback
dotenv.config({ path: path.resolve(__dirname, './.env') });

// API URL configuration - prioritize EXPO_PUBLIC_API_URL env var
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (isDevelopment
    ? 'http://localhost:4000'
    : 'https://rouptimize-back-production.up.railway.app');

console.log(
  `[app.config] NODE_ENV=${process.env.NODE_ENV}, API_URL=${API_URL}`,
);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Rouptimize Mobile',
  slug: 'mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'rouptimize',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.davioncoder.mobile',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.davioncoder.mobile',
    versionCode: 1,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/carriot.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        image: './assets/images/icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        imageWidth: 200,
      },
    ],
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsAccessToken: process.env.MOBILE_MAPBOX_ACCESS_TOKEN,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Show current location on map.',
        locationAlwaysAndWhenInUsePermission:
          'Allow access to location for navigation tracking.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // Target latest SDK for Play Store compliance & trust
          // Android 16 = API 36 (Baklava) — latest stable as of 2025
          targetSdkVersion: 36,
          compileSdkVersion: 36,
          // Build only for ARM devices (most Android devices)
          // Remove x86/x86_64 to reduce APK size significantly
          buildArchs: ['arm64-v8a', 'armeabi-v7a'],
          // Enable minification to reduce code size
          enableMinifyInReleaseBuilds: true,
          // Enable resource shrinking to remove unused resources
          enableShrinkResourcesInReleaseBuilds: true,
          // Enable PNG optimization
          enablePngCrunchInReleaseBuilds: true,
          // Use legacy packaging to compress native libraries (smaller APK)
          useLegacyPackaging: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    autolinkingModuleResolution: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'b0b3cb25-98e2-4129-a93d-308f161b15f6',
    },
    mapboxAccessToken: process.env.MOBILE_MAPBOX_ACCESS_TOKEN,
    apiUrl: API_URL,
  },
});
