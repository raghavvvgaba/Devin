import { hasDependency, hasDevScript } from "./package-json";
import type { FrameworkAdapter } from "./types";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function withViteAllowedHost(command: string, previewHost: string) {
  return `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${shellQuote(previewHost)} ${command}`;
}

export const viteReactAdapter: FrameworkAdapter = {
  kind: "vite-react",
  detect(packageJson) {
    const isViteReact =
      hasDevScript(packageJson) &&
      hasDependency(packageJson, "vite") &&
      hasDependency(packageJson, "react") &&
      hasDependency(packageJson, "react-dom");

    if (!isViteReact) return null;

    return {
      evidence: [
        'package.json contains a dev script and the "vite", "react", and "react-dom" dependencies',
      ],
    };
  },
  createPreviewCommand({ packageManager, previewHost, previewPort }) {
    if (packageManager === "bun") {
      return `export PATH="$HOME/.bun/bin:$PATH"; ${withViteAllowedHost(
        `bun run dev -- --host 0.0.0.0 --port ${previewPort}`,
        previewHost,
      )}`;
    }

    if (packageManager === "pnpm") {
      return withViteAllowedHost(
        `pnpm dev -- --host 0.0.0.0 --port ${previewPort}`,
        previewHost,
      );
    }

    if (packageManager === "yarn") {
      return withViteAllowedHost(
        `yarn dev --host 0.0.0.0 --port ${previewPort}`,
        previewHost,
      );
    }

    return withViteAllowedHost(
      `npm run dev -- --host 0.0.0.0 --port ${previewPort}`,
      previewHost,
    );
  },
};
