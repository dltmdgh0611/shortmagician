import {
  writeTextFile, readTextFile, readDir, mkdir, remove, BaseDirectory,
  readFile, writeFile, exists,
} from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import type { PipelineResult, SubtitleStyle } from "../types/pipeline";

const PROJECTS_DIR = "projects";

export interface SavedProject {
  id: string;              // from PipelineResult.projectId
  name: string;            // derived from original video filename or auto-generated
  createdAt: string;       // ISO date
  updatedAt: string;       // ISO date
  pipelineResult: PipelineResult;
  subtitleStyle: SubtitleStyle;
  blurRegion: {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selectedLanguage: string;
  projectLanguages: string[];
  textOverlays?: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontColor: string;
    bold: boolean;
  }>;
  thumbnailPath?: string;
}
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  targetLanguage: string;
  sourceLanguage: string;
  thumbnailPath?: string;
}

async function ensureProjectsDir(): Promise<void> {
  try {
    await mkdir(PROJECTS_DIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
  } catch {
    // directory already exists
  }
}

/** Return absolute path to projects/{projectId}/ directory, creating it if needed. */
export async function getProjectDir(projectId: string): Promise<string> {
  const relDir = `${PROJECTS_DIR}/${projectId}`;
  try {
    await mkdir(relDir, { baseDir: BaseDirectory.AppLocalData, recursive: true });
  } catch { /* already exists */ }
  const dataDir = await appLocalDataDir();
  return await join(dataDir, relDir);
}

export async function saveProject(project: SavedProject): Promise<void> {
  await ensureProjectsDir();

  // ── Persist merged TTS audio to stable project directory ────────────────────────
  const pipelineResultToSave = { ...project.pipelineResult };

  try {
    const projectDir = await getProjectDir(project.id);

    // Persist merged TTS MP3
    if (pipelineResultToSave.mergedTtsPath) {
      const persistentMergedPath = await join(projectDir, "merged_tts.mp3");
      const currentMergedPath = pipelineResultToSave.mergedTtsPath;

      if (currentMergedPath !== persistentMergedPath) {
        const dstExists = await exists(persistentMergedPath);
        if (!dstExists) {
          const srcExists = await exists(currentMergedPath);
          if (srcExists) {
            const audioData = await readFile(currentMergedPath);
            await writeFile(persistentMergedPath, audioData);
          }
        }
      }
      pipelineResultToSave.mergedTtsPath = persistentMergedPath;
    }

    // Persist individual TTS segment files
    const ttsDir = await join(projectDir, "tts");
    try { await mkdir(`${PROJECTS_DIR}/${project.id}/tts`, { baseDir: BaseDirectory.AppLocalData, recursive: true }); } catch { /* exists */ }

    const segmentsToSave = [...pipelineResultToSave.segments];
    for (let i = 0; i < segmentsToSave.length; i++) {
      const seg = segmentsToSave[i];
      if (!seg.ttsAudioPath) continue;

      const persistentTtsPath = await join(ttsDir, `tts_${i}.mp3`);
      if (seg.ttsAudioPath !== persistentTtsPath) {
        const dstExists = await exists(persistentTtsPath);
        if (!dstExists) {
          const srcExists = await exists(seg.ttsAudioPath);
          if (srcExists) {
            const ttsData = await readFile(seg.ttsAudioPath);
            await writeFile(persistentTtsPath, ttsData);
          }
        }
      }
      segmentsToSave[i] = { ...seg, ttsAudioPath: persistentTtsPath };
    }
    pipelineResultToSave.segments = segmentsToSave;

    // Backward compat: persist composedVideoPath if it exists (old projects)
    if (pipelineResultToSave.composedVideoPath) {
      const persistentVideoPath = await join(projectDir, "composed.mp4");
      const currentVideoPath = pipelineResultToSave.composedVideoPath;
      if (currentVideoPath !== persistentVideoPath) {
        const dstExists = await exists(persistentVideoPath);
        if (!dstExists) {
          const srcExists = await exists(currentVideoPath);
          if (srcExists) {
            const videoData = await readFile(currentVideoPath);
            await writeFile(persistentVideoPath, videoData);
          }
        }
      }
      pipelineResultToSave.composedVideoPath = persistentVideoPath;
    }
  } catch (err) {
    console.error("Media persistence failed:", err);
    // Continue saving — better than losing all project data
  }

  const projectToSave: SavedProject = { ...project, pipelineResult: pipelineResultToSave };
  const filePath = `${PROJECTS_DIR}/${project.id}.json`;
  await writeTextFile(filePath, JSON.stringify(projectToSave), { baseDir: BaseDirectory.AppLocalData });
}

export async function loadProject(projectId: string): Promise<SavedProject> {
  const filePath = `${PROJECTS_DIR}/${projectId}.json`;
  const content = await readTextFile(filePath, { baseDir: BaseDirectory.AppLocalData });
  return JSON.parse(content) as SavedProject;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureProjectsDir();
  try {
    const entries = await readDir(PROJECTS_DIR, { baseDir: BaseDirectory.AppLocalData });
    const summaries: ProjectSummary[] = [];
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const content = await readTextFile(`${PROJECTS_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppLocalData });
          const project = JSON.parse(content) as SavedProject;
          summaries.push({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            targetLanguage: project.pipelineResult.targetLanguage,
            sourceLanguage: project.pipelineResult.sourceLanguage,
            thumbnailPath: project.thumbnailPath,
          });
        } catch {
          // skip corrupted files
        }
      }
    }
    return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  try {
    // Delete project JSON
    await remove(`${PROJECTS_DIR}/${projectId}.json`, { baseDir: BaseDirectory.AppLocalData });
  } catch {
    // file doesn't exist
  }
  try {
    // Delete project media directory (composed video, etc.)
    await remove(`${PROJECTS_DIR}/${projectId}`, { baseDir: BaseDirectory.AppLocalData, recursive: true });
  } catch {
    // directory doesn't exist
  }
}
