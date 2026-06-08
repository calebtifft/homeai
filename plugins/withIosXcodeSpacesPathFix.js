const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BROKEN_BUNDLE_INVOCATION =
  '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`';

const FIXED_BUNDLE_INVOCATION =
  'RN_XCODE_SCRIPT=$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\n/bin/bash \\"$RN_XCODE_SCRIPT\\"';

function patchPbxprojContents(contents) {
  if (!contents.includes(BROKEN_BUNDLE_INVOCATION)) {
    return contents;
  }
  return contents.replace(BROKEN_BUNDLE_INVOCATION, FIXED_BUNDLE_INVOCATION);
}

function findPbxprojPath(iosRoot) {
  const entries = fs.readdirSync(iosRoot, { withFileTypes: true });
  const xcodeproj = entries.find(
    (entry) => entry.isDirectory() && entry.name.endsWith(".xcodeproj")
  );
  if (!xcodeproj) {
    return null;
  }
  return path.join(iosRoot, xcodeproj.name, "project.pbxproj");
}

/** Quote react-native-xcode.sh path when the repo lives under a directory with spaces. */
function withIosXcodeSpacesPathFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const pbxprojPath = findPbxprojPath(iosRoot);
      if (!pbxprojPath || !fs.existsSync(pbxprojPath)) {
        return config;
      }

      const original = fs.readFileSync(pbxprojPath, "utf8");
      const patched = patchPbxprojContents(original);
      if (patched !== original) {
        fs.writeFileSync(pbxprojPath, patched);
      }
      return config;
    },
  ]);
}

module.exports = withIosXcodeSpacesPathFix;
