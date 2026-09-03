import { Router } from "express";
import { listProjects, createProject, renameProject, deleteProject } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const projectsRouter = Router();

projectsRouter.get("/", asyncHandler(async (_req, res) => {
  res.json(await listProjects());
}));

projectsRouter.post("/", asyncHandler(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name can't be empty." });
  res.status(201).json(await createProject(name));
}));

projectsRouter.post("/:id/rename", asyncHandler(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name can't be empty." });
  await renameProject(req.params.id, name);
  res.status(204).end();
}));

projectsRouter.delete("/:id", asyncHandler(async (req, res) => {
  await deleteProject(req.params.id);
  res.status(204).end();
}));
