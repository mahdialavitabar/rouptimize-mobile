const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

config.resolver.blockList = [
  new RegExp(`${monorepoRoot}/apps/web/.*`),
  new RegExp(`${monorepoRoot}/apps/api/.*`),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
