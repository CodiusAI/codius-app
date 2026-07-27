import path from "node:path";

interface BundledCodiusProviderEnvOptions {
  isPackaged: boolean;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
}

export function createBundledCodiusProviderEnv(
  options: BundledCodiusProviderEnvOptions,
): Record<string, string> {
  if (!options.isPackaged) {
    return {};
  }

  const pathKey = Object.keys(options.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = options.env[pathKey] ?? "";
  const bundledBinPath = path.join(options.resourcesPath, "bin");

  return {
    [pathKey]: currentPath ? `${bundledBinPath}${path.delimiter}${currentPath}` : bundledBinPath,
  };
}
