import { describe, expect, it } from "vitest";
import { buildWorkingDirectorySuggestions } from "./working-directory-suggestions";

describe("buildWorkingDirectorySuggestions", () => {
  it("returns de-duplicated recommendations when query is empty", () => {
    const results = buildWorkingDirectorySuggestions({
      recommendedPaths: ["/Users/me/projects/codius", "/Users/me/projects/codius"],
      serverPaths: ["/Users/me/projects/playground"],
      query: "",
    });

    expect(results).toEqual(["/Users/me/projects/codius"]);
  });

  it("keeps fuzzy recommendation matches before de-duplicated daemon suggestions", () => {
    const results = buildWorkingDirectorySuggestions({
      recommendedPaths: ["/Users/me/projects/codius-desktop", "/Users/me/documents"],
      serverPaths: ["/Users/me/projects/codius-plan", "/Users/me/projects/codius-desktop"],
      query: "codius",
    });

    expect(results).toEqual([
      "/Users/me/projects/codius-desktop",
      "/Users/me/projects/codius-plan",
    ]);
  });

  it("does not reinterpret daemon-ranked suggestions", () => {
    const results = buildWorkingDirectorySuggestions({
      recommendedPaths: [],
      serverPaths: ["/Users/me/projects/codius-desktop"],
      query: "a-query-ranked-by-the-daemon",
    });

    expect(results).toEqual(["/Users/me/projects/codius-desktop"]);
  });

  it("leaves path-query semantics to the daemon", () => {
    const results = buildWorkingDirectorySuggestions({
      recommendedPaths: [
        "/Users/me/archive/projects/codius-desktop",
        "/Users/me/projects/codius-desktop",
      ],
      serverPaths: [],
      query: "~/projects/codius",
    });

    expect(results).toEqual([]);
  });

  it("treats '~' as an active query and includes daemon suggestions", () => {
    const results = buildWorkingDirectorySuggestions({
      recommendedPaths: ["/Users/me/projects/codius"],
      serverPaths: ["/Users/me/documents", "/Users/me/projects"],
      query: "~",
    });

    expect(results).toEqual([
      "/Users/me/projects/codius",
      "/Users/me/documents",
      "/Users/me/projects",
    ]);
  });
});
