import { freeConfigSchema } from "../free/model.ts";
import React from "react";
import { createRoot } from "react-dom/client";
import { viewerConfigSchema } from "../protocol/model.ts";
import { z } from "zod";
import { read } from "./http.ts";
const root = createRoot(document.getElementById("root")!);
try {
  const config = await read(
    "/api/viewer/config",
    z.union([
      viewerConfigSchema,
      freeConfigSchema,
      z.strictObject({ mode: z.literal("legacy") }),
    ]),
    65536,
  );
  if (config.mode === "legacy") {
    const [{ App }] = await Promise.all([
      import("./App"),
      import("./style.css"),
    ]);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } else if (config.mode === "free") {
    const { FreeApp } = await import("./FreeApp");
    root.render(<FreeApp config={config} />);
  } else {
    const { ProtocolApp } = await import("./ProtocolApp");
    root.render(<ProtocolApp config={viewerConfigSchema.parse(config)} />);
  }
} catch {
  root.render(
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Arena unavailable</h1>
      <p>The viewer could not load its configuration. Reload to try again.</p>
    </main>,
  );
}
