import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesRouter } from "./routes/sources.js";
import { projectsRouter } from "./routes/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Simple shared-password gate. Without this, anyone with the URL could use
// your AssemblyAI/Supabase credentials — set APP_PASSWORD before deploying
// publicly. Username can be anything; only the password is checked.
const appPassword = process.env.APP_PASSWORD;
if (appPassword) {
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next(); // lets uptime checks pass without auth
    const header = req.headers.authorization;
    const [scheme, encoded] = header?.split(" ") ?? [];
    const [, providedPassword] = encoded
      ? Buffer.from(encoded, "base64").toString("utf-8").split(":")
      : [];
    if (scheme === "Basic" && providedPassword === appPassword) return next();
    res.set("WWW-Authenticate", 'Basic realm="Transcribe"');
    res.status(401).send("Authentication required.");
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    assemblyAiConfigured: Boolean(process.env.ASSEMBLYAI_API_KEY),
  });
});

app.use("/api/sources", sourcesRouter);
app.use("/api/projects", projectsRouter);

// In production, serve the built frontend from this same server so only one
// deployment is needed. In local dev, the Vite dev server handles the
// frontend instead (see web/vite.config.ts's proxy), and this dist folder
// won't exist yet — that's fine, it's skipped.
const webDist = path.join(__dirname, "..", "..", "web", "dist");
app.use(express.static(webDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found — the frontend hasn't been built yet (npm run build in web/).");
  });
});

// Catches errors from any route wrapped in asyncHandler. Without this, an
// error thrown inside an async Express 4 route handler crashes the entire
// process — taking down every in-flight request, not just the failing one —
// instead of just failing that one request.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});

// Last-resort safety net for anything outside Express's request cycle (e.g.
// the fire-and-forget background transcription jobs) — logs instead of
// silently crashing the whole server.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`transcribe server listening on http://localhost:${port}`);
});
