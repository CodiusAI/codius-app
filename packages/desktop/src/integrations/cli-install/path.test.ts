import { describe, expect, it } from "vitest";
import { resolveCliInstallSourcePath } from "./path";

describe("cli-install-path", () => {
  it("uses the bundled shim for packaged macOS installs", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "darwin",
        isPackaged: true,
        executablePath: "/Applications/Codius.app/Contents/MacOS/Codius",
        shimPath: "/Applications/Codius.app/Contents/Resources/bin/codius",
      }),
    ).toBe("/Applications/Codius.app/Contents/Resources/bin/codius");
  });

  it("prefers the original AppImage path on linux", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: true,
        executablePath: "/tmp/.mount_codius123/codius",
        shimPath: "/tmp/.mount_codius123/resources/bin/codius",
        appImagePath: "/home/user/Applications/Codius.AppImage",
      }),
    ).toBe("/home/user/Applications/Codius.AppImage");
  });

  it("falls back to the shim on windows and in development", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "win32",
        isPackaged: true,
        executablePath: "C:\\Users\\user\\AppData\\Local\\Programs\\Codius\\Codius.exe",
        shimPath: "C:\\Users\\user\\AppData\\Local\\Programs\\Codius\\resources\\bin\\codius.cmd",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Local\\Programs\\Codius\\resources\\bin\\codius.cmd");

    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: false,
        executablePath: "/opt/Codius/codius",
        shimPath: "/opt/Codius/resources/bin/codius",
      }),
    ).toBe("/opt/Codius/resources/bin/codius");
  });
});
