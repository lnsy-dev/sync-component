import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173'
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      port: 5173,
      reuseExistingServer: !process.env.CI
    },
    {
      command: 'node e2e/peer-server.mjs',
      port: 9000,
      reuseExistingServer: !process.env.CI
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
