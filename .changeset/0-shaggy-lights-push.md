---
'@ktarmyshov/svelte-adapter-azure-swa': patch
---

Fix client bundling path handling and CI setup.

Client entry discovery now uses `tinyglobby` with normalized glob patterns, improving path handling across platforms, especially on Windows. The client bundling input paths are also resolved directly instead of being built relative to the adapter module URL.

The CI setup now declares the Azure Functions Core Tools requirement explicitly, avoiding reliance on tools that may or may not be preinstalled on the GitHub Actions runner image.

Contributed by [@SukeshP1995](https://github.com/SukeshP1995).
