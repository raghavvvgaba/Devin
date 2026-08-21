# Inlaya E2B Template

This folder defines the E2B sandbox template used to provide runtime tools that
the app expects inside issue workspaces.

The first custom template adds `ripgrep`, which provides the `rg` binary used by
the app's `search_code` tool.

## Template

The template is based on E2B's standard base image and installs one additional
package:

```ts
Template()
  .fromBaseImage()
  .aptInstall(["ripgrep"]);
```

## Build

Install dependencies from this folder:

```bash
pnpm install
```

Build and publish the template:

```bash
E2B_API_KEY=e2b_your_key pnpm build
```

The build publishes this template name:

```txt
gabatools/devin-sandbox
```

## Later App Usage

After the template is built and verified, the app can be updated in a later
phase to create sandboxes with:

```env
E2B_SANDBOX_TEMPLATE="gabatools/devin-sandbox"
```

Do not install `ripgrep` during every sandbox startup. It should stay baked into
the E2B template so sandbox startup remains fast and reliable.
