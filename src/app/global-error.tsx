"use client";

/** Last-resort boundary (errors in the root layout). Must render its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf9f7", color: "#1c1b19", display: "grid", placeItems: "center", height: "100dvh" }}>
        <div style={{ textAlign: "center", padding: 24 }} role="alert">
          <h1 style={{ fontSize: 20, margin: 0 }}>Orbit couldn&apos;t load</h1>
          <p style={{ color: "#5a5854", fontSize: 14 }}>Something went wrong while starting the app. Your messages are safe.</p>
          <button onClick={reset} style={{ marginTop: 12, height: 36, padding: "0 16px", borderRadius: 6, border: 0, background: "#c7472b", color: "#fff", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
