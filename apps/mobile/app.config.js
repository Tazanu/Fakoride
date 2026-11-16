/**
 * The parts of the app's configuration that depend on the machine building it.
 *
 * Everything fixed lives in app.json; this receives that and adds one thing:
 * the Firebase file Android needs before it can receive a push notification.
 *
 * Push on Android runs over Firebase Cloud Messaging, and the app can only
 * register with it if google-services.json was compiled in. Without the file
 * the build succeeds, the app runs, and every driver's phone stays silent when
 * a ride is offered — asking for a push token simply fails, quietly. Uploading
 * the FCM key to Expo (DEPLOY.md step 8) lets Expo SEND; this lets the phone
 * RECEIVE. It needs both.
 *
 * Where the file comes from, in order:
 *
 *   GOOGLE_SERVICES_JSON   a path, set by EAS when the file is stored as a
 *                          file secret:  eas env:create --type file ...
 *   ./google-services.json beside this file, if you would rather commit it
 *                          (Firebase does not treat it as a secret)
 *
 * A production build without it is refused here, with the reason, rather than
 * shipped mute. Anything else — Expo Go, a local run, a preview APK — only
 * warns, because none of those can be the build 300 drivers install.
 */

const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const candidate = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  const resolved = path.resolve(__dirname, candidate);
  const present = fs.existsSync(resolved);

  if (!present) {
    const why =
      "google-services.json was not found, so Android push notifications will not work in this build.\n" +
      "Download it from the Firebase console (Project settings → Your apps → Android, package cm.fakoride.app)\n" +
      "and either save it as apps/mobile/google-services.json or store it with\n" +
      "  eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json\n" +
      "See DEPLOY.md, step 8.";
    if (process.env.EAS_BUILD_PROFILE === "production") {
      throw new Error(why);
    }
    // Once per process is plenty; Expo evaluates this file several times.
    if (!global.__fakoWarnedAboutGoogleServices) {
      global.__fakoWarnedAboutGoogleServices = true;
      console.warn(`\n[fako-ride] ${why}\n`);
    }
    return config;
  }

  return {
    ...config,
    android: { ...config.android, googleServicesFile: candidate },
  };
};
