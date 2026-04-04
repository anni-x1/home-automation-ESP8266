# ITI Home Automation — Gemini Context

This project is a highly stylized Next.js dashboard designed to resemble an industrial electrical panel (cabinet). It provides a user interface for controlling home automation devices via the Blynk IoT platform, specifically tailored for an ESP8266-based hardware setup.

## Project Overview

- **Purpose:** A smart home automation dashboard for controlling 16 relays (lights, fans, appliances) and a door servo.
- **Visual Aesthetic:** Industrial "Cabinet/Panel Board" style with rivets, pilot lights, and MCB (Miniature Circuit Breaker) handles.
- **Key Features:**
    - **Real-time Control:** Toggle 16 virtual pins on Blynk Cloud.
    - **Voice Commands:** Support for English (`en-IN`) and Gujarati (`gu-IN`) using the Web Speech API.
    - **Scene Modes:** Preset configurations (Sleep, Welcome, Full Power).
    - **Energy Monitoring:** Simulated real-time voltage, current, power, and frequency monitoring.
    - **Multi-lingual:** Bilingual UI (English/Gujarati) via a dedicated translations module.
    - **Audio Feedback:** Realistic switch clicks and "transformer hum" using the Web Audio API.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Library:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4 + Custom CSS (Global variables for panel aesthetics)
- **Backend/IoT:** Blynk Cloud API (Server-side token proxying)

## Building and Running

### Prerequisites
- Node.js 20+
- Blynk Cloud account and Device Auth Token

### Setup
1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Add your `BLYNK_TOKEN` to the `.env` file.
4. Install dependencies:
   ```bash
   npm install
   ```

### Development
Run the development server:
```bash
npm run dev
```

### Production
Build and start the production server:
```bash
npm run build
npm run start
```

### Linting
```bash
npm run lint
```

## Architecture & Conventions

### Directory Structure
- `src/app/page.tsx`: The main dashboard component (monolithic for performance and style cohesion).
- `src/app/api/blynk/update/route.ts`: A secure Next.js API route that proxies requests to Blynk Cloud to keep the `BLYNK_TOKEN` hidden from the client.
- `src/app/translations.ts`: Centralized dictionary for English and Gujarati strings.
- `src/app/globals.css`: Contains the "Panel Board" theme definitions and animations.

### Development Guidelines
- **Security:** NEVER expose the `BLYNK_TOKEN` in client-side code. Use the `/api/blynk/update` route for all Blynk interactions.
- **Styling:** Adhere to the industrial aesthetic defined in `globals.css`. Use CSS variables for colors (e.g., `--rivet`, `--plate`, `--recess`).
- **Translations:** Always add new UI strings to `translations.ts` in both `en` and `gu` sections.
- **Blynk Mapping:** Hardware pins are mapped in `defaultMap` in `page.tsx`. Ensure any hardware changes are reflected there.
    - `V1-V15`: Relays
    - `V16`: Door Servo (0° - 120°)

### Deployment
The project is optimized for deployment on **Vercel**. Ensure `BLYNK_TOKEN` is set in the Vercel project environment variables.
