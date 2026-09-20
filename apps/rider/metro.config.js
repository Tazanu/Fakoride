// Metro has to see outside this folder.
//
// The Daylight tokens live at design/tokens.json, two levels up, and they are
// the single source of truth for both apps and the ops console. Copying them in
// here would create a second source that drifts the first time somebody fixes a
// contrast failure — and design/check-contrast.mjs only guards the original.
//
// So: watch that folder, and let the app import it by an alias.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");
const designRoot = path.resolve(repoRoot, "design");

const config = getDefaultConfig(projectRoot);

// Files Metro should rebuild for, beyond this project.
config.watchFolders = [designRoot];

// Hierarchical lookup stays ON, deliberately. Turning it off is the usual
// monorepo advice — it stops Metro walking up into a sibling's node_modules —
// but npm nests plenty of Expo's own dependencies (expo-asset lives under
// node_modules/expo/node_modules), and disabling it makes those unresolvable.
// There is nothing to protect against here anyway: this app has the only
// node_modules on the path up to the drive root.

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@design": designRoot,
};

module.exports = config;
