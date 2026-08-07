import {
  PREVIEW_PORT,
  PROJECT_DIR,
  UNSUPPORTED_FULL_STACK_REPO_MESSAGE,
  UNSUPPORTED_NESTED_APP_REPO_MESSAGE,
  UNSUPPORTED_PACKAGE_MANAGER_MESSAGE,
  UNSUPPORTED_REPO_MESSAGE,
  UNSUPPORTED_WORKSPACE_REPO_MESSAGE,
} from "~/server/sandbox/providers/e2b/constants";
import { detectFramework } from "~/server/sandbox/providers/e2b/frameworks";
import { hasWorkspaces } from "~/server/sandbox/providers/e2b/frameworks/package-json";
import { fileExists, readTextFile } from "~/server/sandbox/providers/e2b/sandbox-ops";
import type {
  E2BSandboxSession,
  PackageManager,
  RepoPreviewConfig,
} from "~/server/sandbox/providers/e2b/types";

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

function getPreviewHost(previewUrl: string) {
  try {
    return new URL(previewUrl).host;
  } catch {
    throw new Error("Unable to determine the preview host.");
  }
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

    if (hasWorkspaces(packageJson)) {
      await detectUnsupportedRepoShape(session, packageJson);
    }

    const detectedFramework = detectFramework(packageJson);
    if (!detectedFramework) {
      await detectUnsupportedRepoShape(session, packageJson);
      throw new Error(UNSUPPORTED_REPO_MESSAGE);
    }

    const packageManager = await detectPackageManager(session);
    const previewHost = getPreviewHost(session.previewUrl);
    return {
      installCommand: getInstallCommand(packageManager),
      kind: detectedFramework.adapter.kind,
      prepareCommand: getPrepareCommand(packageManager),
      previewCommand: detectedFramework.adapter.createPreviewCommand({
        packageManager,
        previewHost,
        previewPort: PREVIEW_PORT,
      }),
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
