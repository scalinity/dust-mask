import { App } from "./App";

// Global error handlers
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error || event.message);
  const errorOverlay = document.getElementById("error-overlay");
  const errorMessage = document.getElementById("error-message");
  if (errorOverlay && errorMessage) {
    errorMessage.textContent =
      event.error?.message || event.message || "Unknown error";
    errorOverlay.classList.add("visible");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
  const errorOverlay = document.getElementById("error-overlay");
  const errorMessage = document.getElementById("error-message");
  if (errorOverlay && errorMessage) {
    const msg =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    errorMessage.textContent = msg;
    errorOverlay.classList.add("visible");
  }
});

async function main(): Promise<void> {
  console.log("Dust Field - Starting...");

  const app = new App();

  try {
    await app.initialize();
    app.start();

    // Handle cleanup on window close
    window.addEventListener("beforeunload", () => {
      app.destroy();
    });

    // Handle escape key to quit (optional, useful for testing)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        app.destroy();
        window.close();
      }
    });
  } catch (error) {
    console.error("Failed to start app:", error);
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
