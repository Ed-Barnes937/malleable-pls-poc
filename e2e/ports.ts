// e2e ports. The defaults deliberately differ from the dev defaults (API 3001,
// web 5173): Playwright reuses any server already listening, and a reused dev
// server could be running with live AI. Override per checkout (see README.md).
export const apiPort = process.env.API_PORT ?? '3901'
export const webPort = process.env.WEB_PORT ?? '5901'
export const apiUrl = `http://localhost:${apiPort}`
