import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    headless: false, // visible for the first run
    channel: "chrome", // use your installed Chrome (helps with Google)
    trace: "on-first-retry",
  },
});
