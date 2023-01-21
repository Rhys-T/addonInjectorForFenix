# Addon Injector for Fenix

Customizes the list of addons available in the stable version of the Firefox browser for Android™ (Fenix/Daylight). [Hopefully won't be needed for much longer.][soon]

[soon]: https://blog.mozilla.org/addons/2023/08/10/prepare-your-firefox-desktop-extension-for-the-upcoming-android-release/

## 🚧 Under Construction 🚧

Every commit containing this note is a modified version of one from my original private repo, with this README, the LICENSE files, and the license header comments retroactively added using [`git-filter-repo`][].

Something resembling proper documentation will be added later.

## How it works

See <https://github.com/Rhys-T/fenix-arbitrary-addons>.

## License

This program is licensed under the [Mozilla Public License, version 2.0][MPL-2.0].

Some third-party files or code are being used under various open-source licenses. 🚧 Some of the notes below may not apply to every 'Under Construction' commit.
- [Foxdriver][]  
  Copyright 2017-2021 Sauce Labs  
  Used under the [Apache License, version 2.0][Apache-2.0].  
  Foxdriver itself is being pulled in as a dependency, not vendored and patched. However, I am patching it at runtime, and have embedded small snippets into my code so that I know where to patch. I don't know if that counts as a "modified file" for section 4(b), but here's what I'm doing, just in case:
  - Patch the `Console.evaluateJSAsync` method to detect when it's passed an `async` function, and do the equivalent of using a top-level `await` in Firefox's console.
  - Patch the `Client` class to actually handle errors from the underlying socket, and send a 'Lost connection' error back to my code.
  - This one doesn't actually involve Foxdriver's code, but just for completeness: I'm wrapping the `net.createConnection` method so that I can connect Foxdriver to a Unix socket file, even though it only normally takes a host and TCP port.
- [Firefox][]  
  [extensionGeneric.svg][] used under the [Mozilla Public License, version 2.0][MPL-2.0].  
  It has been converted to a PNG using [Inkscape][][^contextfill], and then run through <code>[zopflipng][] -mm</code> to produce the version used here.  
  Steps to build the image:
  ```sh
  inkscape -w 128 -h 128 <(sed 's/context-fill-opacity/1/g; s/context-fill/black/g' extensionGeneric.svg) -o extensionGeneric.orig.png
  zopflipng -mm extensionGeneric.orig.png extensionGeneric.png
  ```
  Additionally, I figured out how to do this via a _lot_ of digging through the Firefox source code, and mozilla.d.ts contains hacky TypeScript descriptions of several of Firefox's internal APIs (for IntelliSense purposes, basically). I didn't knowingly copy any actual code from Firefox, however.


[^contextfill]: After patching it to use a real fill color instead of `context-fill`.

[`git-filter-repo`]: https://github.com/newren/git-filter-repo
  
[MPL-2.0]: https://www.mozilla.org/en-US/MPL/2.0/
[Apache-2.0]: https://www.apache.org/licenses/LICENSE-2.0

[Foxdriver]: https://github.com/saucelabs/foxdriver
[Firefox]: https://www.mozilla.org/en-US/firefox/
[extensionGeneric.svg]: https://searchfox.org/mozilla-central/rev/ee592d0f15afc87cff1efdf5a883a3510e3f74df/toolkit/themes/shared/extensions/extensionGeneric.svg
[Inkscape]: https://inkscape.org/
[zopflipng]: https://github.com/google/zopfli/blob/master/README.zopflipng

## Trademark stuff

Mozilla and Firefox are trademarks of the Mozilla Foundation in the U.S. and other countries. This project is not officially associated with Mozilla or its products.

Android is a trademark of Google LLC.

Sauce Labs is a registered trademark owned by Sauce Labs Inc. in the United States, EU, and may be registered in other jurisdictions.
