import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBundledCodiusProviderEnv } from "./bundled-codius-provider";

describe("bundled Codius provider environment", () => {
  it("prepends the packaged resource bin directory to PATH", () => {
    expect(
      createBundledCodiusProviderEnv({
        isPackaged: true,
        resourcesPath: "/Applications/Codius.app/Contents/Resources",
        env: { PATH: "/usr/local/bin:/usr/bin" },
      }),
    ).toEqual({
      PATH: ["/Applications/Codius.app/Contents/Resources/bin", "/usr/local/bin:/usr/bin"].join(
        path.delimiter,
      ),
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
