import { describe, expect, it } from "vitest";
import { isSavedProject } from "./autosave";
import { testProject } from "./fixtures";

describe("isSavedProject", () => {
  const record = { version: 1, project: testProject(), origin: null, sourceName: "clip.mp4", savedAt: 1 };

  it("accepts a saved editor project", () => {
    expect(isSavedProject(record)).toBe(true);
  });

  it("rejects missing, foreign or broken records", () => {
    expect(isSavedProject(undefined)).toBe(false);
    expect(isSavedProject("project")).toBe(false);
    expect(isSavedProject({ ...record, version: 2 })).toBe(false);
    expect(isSavedProject({ ...record, sourceName: undefined })).toBe(false);
    expect(isSavedProject({ ...record, project: { ...record.project, clips: [] } })).toBe(false);
    expect(isSavedProject({ ...record, project: { ...record.project, version: 0 } })).toBe(false);
  });
});
