# FitLab

FitLab is an Expo app that turns inspiration images and wardrobe pieces into a practical style profile and ranked clothing recommendations. It keeps the recommendation engine local and deterministic, with optional Claude-powered image analysis.

## Run it

```sh
npm install
npx expo start
```

Press `w` in the Expo terminal to open the web app. Run `npm test` for the engine and component tests, or `npm run typecheck` to validate TypeScript.

## Optional vision analysis

Copy `.env.example` to `.env` and provide `ANTHROPIC_API_KEY`. Without a key or network connection, FitLab continues through onboarding using questionnaire preferences and deterministic recommendation reasons.

## Architecture

`lib/` contains the pure, tested recommendation engine: style vectors, compatibility, outfit enumeration, gap analysis, and product ranking. `ProductProvider` is the boundary for replacing the included seeded catalogue with a future web-search provider. Expo API routes in `app/api/` hold the optional server-only Claude integration.

## Builds

`eas.json` contains development, preview, and production profiles. Use the Expo/EAS tooling configured for your account to create native builds.
