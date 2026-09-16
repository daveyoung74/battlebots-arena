import { config } from "./config.ts";
if (config.mode === "legacy") {
  await import("./legacy-index.ts");
} else {
  const [
    { createViewer },
    { viewerService },
    { default: express },
    { default: path },
  ] = await Promise.all([
    import("./viewer.ts"),
    import("./viewer-config.ts"),
    import("express"),
    import("node:path"),
  ]);
  const service = await viewerService(config.mode),
    app = createViewer(service);
  let closeFrontend = async () => {};
  if (process.env.NODE_ENV === "production") {
    app.use(express.static("dist"));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.resolve("dist/index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        fs: {
          strict: true,
          allow: [
            path.resolve("src/client"),
            path.resolve("src/protocol"),
            path.resolve("node_modules"),
            path.resolve("vendor/protocol-v2/dist"),
            path.resolve("index.html"),
          ],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    closeFrontend = () => vite.close();
  }
  const host = service.config.studioPreview
    ? "127.0.0.1"
    : process.env.ARENA_BIND_HOST || "127.0.0.1";
  const server = app.listen(config.port, host, () =>
    console.log(`Arena ${config.mode} viewer: http://${host}:${config.port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(() => void closeFrontend().then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 5000).unref();
    });
}
