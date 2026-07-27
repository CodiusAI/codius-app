import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBundledCodiusProviderEnv } from "./bundled-codius-provider";

describe("bundled Codius provider environment", () => {
  it("prepends the packaged resource bin directory to PATH", () => {
    const resourcesPath = "/Applications/Codius.app/Contents/Resources";

    expect(
      createBundledCodiusProviderEnv({
        isPackaged: true,
        resourcesPath,
        env: { PATH: "/usr/local/bin:/usr/bin" },
      }),
    ).toEqual({
      PATH: [path.join(resourcesPath, "bin"), "/usr/local/bin:/usr/bin"].join(path.delimiter),
    });
  });

  it("preserves the existing path key casing", () => {
    expect(
      createBundledCodiusProviderEnv({
        isPackaged: true,
        resourcesPath: "C:\\Program Files\\Codius\\resources",
        env: { Path: "C:\\Windows\\System32" },
      }),
    ).toHaveProperty("Path");
  });

  it("does not change PATH in development", () => {
    expect(
      createBundledCodiusProviderEnv({
        isPackaged: false,
        resourcesPath: "/unused",
        env: { PATH: "/usr/bin" },
      }),
    ).toEqual({});
  });
});
