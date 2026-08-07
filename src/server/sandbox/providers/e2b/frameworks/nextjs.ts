import { getDevScriptCommand } from "./commands";
import { hasDependency, hasDevScript } from "./package-json";
import type { FrameworkAdapter } from "./types";

export const nextjsAdapter: FrameworkAdapter = {
  kind: "nextjs",
  detect(packageJson) {
    if (!hasDevScript(packageJson) || !hasDependency(packageJson, "next")) {
      return null;
    }

    return {
      evidence: ['package.json contains a dev script and the "next" dependency'],
    };
  },
  createPreviewCommand({ packageManager, previewPort }) {
    return getDevScriptCommand(
      packageManager,
      `--hostname 0.0.0.0 --port ${previewPort}`,
    );
  },
};
