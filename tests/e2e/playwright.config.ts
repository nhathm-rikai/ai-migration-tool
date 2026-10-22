import { defineConfig, devices } from '@playwright/test';

// Started only by scripts/e2e.mjs, which owns the servers, ports, temp data
// and output folders. Running `playwright test` directly fails fast.
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run \`npm run e2e\`.`);
  return value;
};

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: required('E2E_OUTPUT_DIR'),
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: required('E2E_REPORT_DIR'), open: 'never' }],
    // Read by the self-check to confirm why a run failed.
    ['json', { outputFile: required('E2E_JSON_REPORT') }],
  ],
  use: {
    baseURL: required('E2E_BASE_URL'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
