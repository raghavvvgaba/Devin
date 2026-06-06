import {
  PREVIEW_PORT,
  PROJECT_DIR,
  UNSUPPORTED_FULL_STACK_REPO_MESSAGE,
  UNSUPPORTED_NESTED_APP_REPO_MESSAGE,
  UNSUPPORTED_PACKAGE_MANAGER_MESSAGE,
  UNSUPPORTED_REPO_MESSAGE,
  UNSUPPORTED_WORKSPACE_REPO_MESSAGE,
} from "~/server/sandbox/providers/e2b/constants";
import { fileExists, readTextFile } from "~/server/sandbox/providers/e2b/sandbox-ops";
import type {
  E2BSandboxSession,
  PackageManager,
  RepoPreviewConfig,
} from "~/server/sandbox/providers/e2b/types";

function getRecordValue(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function hasDependency(packageJson: unknown, dependencyName: string) {
  const dependencies = getRecordValue(packageJson, "dependencies");
  const devDependencies = getRecordValue(packageJson, "devDependencies");

  return (
    typeof getRecordValue(dependencies, dependencyName) === "string" ||
    typeof getRecordValue(devDependencies, dependencyName) === "string"
  );
}

function hasDevScript(packageJson: unknown) {
  const scripts = getRecordValue(packageJson, "scripts");
  return typeof getRecordValue(scripts, "dev") === "string";
}

function hasWorkspaces(packageJson: unknown) {
  const workspaces = getRecordValue(packageJson, "workspaces");
  return Array.isArray(workspaces) || (Boolean(workspaces) && typeof workspaces === "object");
}

async function hasNestedPackage(session: E2BSandboxSession, directory: string) {
  return fileExists(session, `${PROJECT_DIR}/${directory}/package.json`);
}

async function detectUnsupportedRepoShape(
  session: E2BSandboxSession,
  rootPackageJson?: unknown,
) {
  if (rootPackageJson && hasWorkspaces(rootPackageJson)) {
    throw new Error(UNSUPPORTED_WORKSPACE_REPO_MESSAGE);
  }

  const frontendDirectories = ["frontend", "client", "web"];
  const backendDirectories = ["backend", "server", "api"];
  const nestedAppDirectories = ["app", "apps", "packages"];

  const frontendMatches = [];
  const backendMatches = [];
  const nestedAppMatches = [];

  for (const directory of frontendDirectories) {
    if (await hasNestedPackage(session, directory)) {
      frontendMatches.push(directory);
    }
  }

  for (const directory of backendDirectories) {
    if (await hasNestedPackage(session, directory)) {
      backendMatches.push(directory);
    }
  }

  for (const directory of nestedAppDirectories) {
    if (await fileExists(session, `${PROJECT_DIR}/${directory}`)) {
      nestedAppMatches.push(directory);
    }
  }

  if (frontendMatches.length > 0 && backendMatches.length > 0) {
    throw new Error(UNSUPPORTED_FULL_STACK_REPO_MESSAGE);
  }

  if (frontendMatches.length > 0 || nestedAppMatches.length > 0) {
    throw new Error(UNSUPPORTED_NESTED_APP_REPO_MESSAGE);
  }

  if (backendMatches.length > 0) {
    throw new Error(UNSUPPORTED_FULL_STACK_REPO_MESSAGE);
  }
}

async function detectPackageManager(session: E2BSandboxSession): Promise<PackageManager> {
  const lockfiles = [
    { file: "bun.lock", packageManager: "bun" as const },
    { file: "bun.lockb", packageManager: "bun" as const },
    { file: "pnpm-lock.yaml", packageManager: "pnpm" as const },
    { file: "yarn.lock", packageManager: "yarn" as const },
    { file: "package-lock.json", packageManager: "npm" as const },
    { file: "npm-shrinkwrap.json", packageManager: "npm" as const },
  ];

  const matches: PackageManager[] = [];

  for (const lockfile of lockfiles) {
    if (await fileExists(session, `${PROJECT_DIR}/${lockfile.file}`)) {
      matches.push(lockfile.packageManager);
    }
  }

  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length > 1) {
    throw new Error(
      "Multiple package manager lockfiles were found. Keep exactly one of bun, npm, pnpm, or yarn lockfiles.",
    );
  }

  if (uniqueMatches[0]) return uniqueMatches[0];

  const directoryEntries = await session.sandbox?.files.list(PROJECT_DIR, {
    requestTimeoutMs: 10_000,
  });
  const unsupportedLockfile = directoryEntries?.find((entry) => {
    const name = entry.name.toLowerCase();
    return (
      name.includes("lock") &&
      !lockfiles.some((lockfile) => lockfile.file.toLowerCase() === name)
    );
  });

  if (unsupportedLockfile) {
    throw new Error(UNSUPPORTED_PACKAGE_MANAGER_MESSAGE);
  }

  return "npm";
}

function getInstallCommand(packageManager: PackageManager) {
  if (packageManager === "bun") return 'export PATH="$HOME/.bun/bin:$PATH"; bun install';
  if (packageManager === "pnpm") return "pnpm install";
  if (packageManager === "yarn") return "yarn install";
  return "npm install";
}

function getPrepareCommand(packageManager: PackageManager) {
  if (packageManager !== "bun") return undefined;
  return 'export PATH="$HOME/.bun/bin:$PATH"; command -v bun >/dev/null 2>&1 || curl -fsSL https://bun.sh/install | bash';
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getPreviewHost(previewUrl: string) {
  try {
    return new URL(previewUrl).host;
  } catch {
    throw new Error("Unable to determine the preview host for Vite.");
  }
}

function withViteAllowedHost(command: string, previewHost: string) {
  return `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${shellQuote(previewHost)} ${command}`;
}

function getPreviewCommand(packageManager: PackageManager, previewHost: string) {
  if (packageManager === "bun") {
    return `export PATH="$HOME/.bun/bin:$PATH"; ${withViteAllowedHost(
      `bun run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}`,
      previewHost,
    )}`;
  }
  if (packageManager === "pnpm") {
    return withViteAllowedHost(
      `pnpm dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}`,
      previewHost,
    );
  }
  if (packageManager === "yarn") {
    return withViteAllowedHost(
      `yarn dev --host 0.0.0.0 --port ${PREVIEW_PORT}`,
      previewHost,
    );
  }
  return withViteAllowedHost(
    `npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}`,
    previewHost,
  );
}

export async function detectRepoPreviewConfig(
  session: E2BSandboxSession,
): Promise<RepoPreviewConfig> {
  const hasPackageJson = await fileExists(session, `${PROJECT_DIR}/package.json`);

  if (hasPackageJson) {
    const packageJsonText = await readTextFile(session, `${PROJECT_DIR}/package.json`);
    let packageJson: unknown;

    try {
      packageJson = JSON.parse(packageJsonText);
    } catch {
      throw new Error(UNSUPPORTED_REPO_MESSAGE);
    }

    const isViteReact =
      hasDevScript(packageJson) &&
      hasDependency(packageJson, "vite") &&
      hasDependency(packageJson, "react") &&
      hasDependency(packageJson, "react-dom");

    if (!isViteReact) {
      await detectUnsupportedRepoShape(session, packageJson);
      throw new Error(UNSUPPORTED_REPO_MESSAGE);
    }

    const packageManager = await detectPackageManager(session);
    const previewHost = getPreviewHost(session.previewUrl);
    return {
      installCommand: getInstallCommand(packageManager),
      kind: "vite-react",
      prepareCommand: getPrepareCommand(packageManager),
      previewCommand: getPreviewCommand(packageManager, previewHost),
      previewCwd: PROJECT_DIR,
    };
  }

  if (await fileExists(session, `${PROJECT_DIR}/index.html`)) {
    return {
      kind: "static",
      previewCommand: `python3 -m http.server ${PREVIEW_PORT} --bind 0.0.0.0`,
      previewCwd: PROJECT_DIR,
    };
  }

  await detectUnsupportedRepoShape(session);
  throw new Error(UNSUPPORTED_REPO_MESSAGE);
}
