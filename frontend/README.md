# SupportPilot AI frontend

React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, and Lucide.

## Setup

1. Start the SupportPilot API on `http://localhost:3000` and ensure its database and Redis services are available.
2. From this directory, install frontend dependencies:

   ```sh
   npm install
   ```

3. The development server proxies `/api` to `http://localhost:3000`, so the default same-origin API base works without browser CORS. Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to a different API base including `/api/v1` only if needed.
4. Start the frontend:

   ```sh
   npm run dev
   ```

   Vite serves the app at `http://localhost:5173`. For a separately hosted production frontend, configure the backend's `FRONTEND_URL` to its exact origin and set the frontend API base to that API's `/api/v1` URL.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
```

The browser session stores access and refresh tokens in `sessionStorage` and uses the backend's refresh-token rotation endpoint when an authenticated request receives `401`. No backend credentials belong in `VITE_` environment variables.
