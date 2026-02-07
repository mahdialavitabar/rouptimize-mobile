# Rouptimize Mobile 📱

A React Native mobile app for Rouptimize, built with [Expo](https://expo.dev).

## Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS Simulator (Mac) or Android Emulator

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Set up environment variables

Copy the example environment file and configure your values:

```bash
cp .env.example .env.development
```

Edit `.env.development` with your configuration:

```env
# Required
EXPO_PUBLIC_API_URL=http://localhost:4000
MOBILE_MAPBOX_ACCESS_TOKEN=your_mapbox_token

# Optional
EXPO_PUBLIC_SENSOR_STREAMING_ENABLED=false
```

### 3. Start the development server

```bash
bun start
```

### Running on devices

```bash
# iOS Simulator
bun run ios

# Android Emulator
bun run android

# Web browser
bun run web
```

## Build & Deploy

### Development builds (EAS)

```bash
# Android development build
bun run eas:build:android:dev

# iOS development build
bun run eas:build:ios:dev
```

### Production builds (EAS)

```bash
# Android APK
bun run eas:build:android:prod

# Android AAB (Play Store)
bun run eas:build:android:prod-aab

# iOS (App Store)
bun run eas:build:ios:prod
```

## Project Structure

```
├── app/               # File-based routing (screens)
├── components/        # Reusable UI components
├── lib/              # Utilities, API clients, hooks
├── assets/           # Images, fonts, static files
├── app.config.ts     # Expo configuration
└── metro.config.js   # Metro bundler configuration
```

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81
- **Navigation**: Expo Router (file-based routing)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Maps**: Mapbox GL
- **State**: React hooks + Context
- **API**: Axios

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native](https://reactnative.dev/)
- [NativeWind](https://www.nativewind.dev/)
