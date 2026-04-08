<!-- File: docs/ios-xcode-guide.md -->
# Open the iOS App in Xcode

This project includes a Capacitor iOS shell under `ios/App`.

## Prerequisites
- Xcode installed.
- CocoaPods installed (`pod --version` should work).
- Node dependencies installed in the repo root (`node_modules` present).

## Open the full iOS project
1. From the repo root, open the workspace, not the project:

   ```bash
   open -a Xcode ios/App/App.xcworkspace
   ```

2. In Xcode, wait for indexing and package setup to finish.
3. In the top toolbar, confirm the scheme is `App`.
4. Choose a simulator, for example `iPhone 17 Pro`.
5. Press the Run button or use `Cmd + R`.

## Important: open the workspace, not the project
Use `ios/App/App.xcworkspace`, not `ios/App/App.xcodeproj`.

The workspace includes CocoaPods frameworks required by Capacitor and the installed plugins.

## If native dependencies changed
If you added or removed Capacitor plugins, sync iOS before reopening Xcode:

```bash
npx cap sync ios
```

Then reopen the workspace:

```bash
open -a Xcode ios/App/App.xcworkspace
```

## What the iOS app loads
This iOS shell is configured in `capacitor.config.ts` to load a remote URL through `server.url`.

That means opening and running the app in Xcode will show the deployed web app by default, not your local Next.js dev server.

## Common issues

### 1) Opened the wrong file in Xcode
Symptom:
- Missing Pods targets
- Build errors for Capacitor or plugin frameworks

Fix:
- Close Xcode.
- Reopen `ios/App/App.xcworkspace`.

### 2) Pods or Capacitor plugins look out of sync
Fix:

```bash
npx cap sync ios
open -a Xcode ios/App/App.xcworkspace
```

### 3) Terminal iOS builds fail with codesign metadata errors
Symptom:
- `resource fork, Finder information, or similar detritus not allowed`

Cause:
- In this repo, `npx cap run ios` writes `DerivedData` inside the project directory.
- If the repo is under a synced Desktop/iCloud-managed path, macOS metadata can break codesigning.

Fix options:
- Prefer building directly from Xcode.
- Or run `xcodebuild` with a custom derived data path outside the repo, for example `/tmp`.

Example:

```bash
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/kds-ios-deriveddata \
  build
```

## Useful paths
- Workspace: `ios/App/App.xcworkspace`
- Project: `ios/App/App.xcodeproj`
- App target source: `ios/App/App`
- Capacitor config: `capacitor.config.ts`
