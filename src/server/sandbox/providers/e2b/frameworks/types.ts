import type { PackageManager, SupportedRepoKind } from "../types";

export type FrameworkMatch = {
  evidence: string[];
};

export type FrameworkPreviewContext = {
  packageManager: PackageManager;
  previewHost: string;
  previewPort: number;
};

export type FrameworkAdapter = {
  createPreviewCommand(context: FrameworkPreviewContext): string;
  detect(packageJson: unknown): FrameworkMatch | null;
  kind: Exclude<SupportedRepoKind, "static">;
};
