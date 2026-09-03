import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesRouter } from "./routes/sources.js";

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

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`transcribe server listening on http://localhost:${port}`);
});
