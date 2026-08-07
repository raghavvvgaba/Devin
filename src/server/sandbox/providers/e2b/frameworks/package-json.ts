function getRecordValue(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function hasDependency(packageJson: unknown, dependencyName: string) {
  const dependencies = getRecordValue(packageJson, "dependencies");
  const devDependencies = getRecordValue(packageJson, "devDependencies");

  return (
    typeof getRecordValue(dependencies, dependencyName) === "string" ||
    typeof getRecordValue(devDependencies, dependencyName) === "string"
  );
}

export function hasDevScript(packageJson: unknown) {
  const scripts = getRecordValue(packageJson, "scripts");
  return typeof getRecordValue(scripts, "dev") === "string";
}

export function hasWorkspaces(packageJson: unknown) {
  const workspaces = getRecordValue(packageJson, "workspaces");
  return Array.isArray(workspaces) || (Boolean(workspaces) && typeof workspaces === "object");
}
