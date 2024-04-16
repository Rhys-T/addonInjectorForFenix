# Addon Injector for Fenix

Customizes the list of addons available in the stable version of the Firefox browser for Android™ (Fenix/Daylight), so that you can install addons that aren't on Mozilla's official list of addons that work on mobile. Does not require root - just `adb` access.

Should also be usable with the Beta and Nightly versions, as well as forks like [Fennec F-Droid][] and [Iceraven][]. [See below.][forks]

[Fennec F-Droid]: https://f-droid.org/en/packages/org.mozilla.fennec_fdroid/
[Iceraven]: https://github.com/fork-maintainers/iceraven-browser
[forks]: #with-other-firefox-variantsforks

## Still potentially useful on Firefox 120+

[Firefox 120 now lets you install arbitrary extensions from addons.mozilla.org][prepare] (as long as you go to the desktop version of AMO), and no longer disables extensions that aren't on the official list. However, extensions that are published as `.xpi` files on other sites still can't normally be installed - it just tries to download them instead. Until I personally see Fenix install a `.xpi` from somewhere other than AMO without shenanigans, I'm going to keep this program around.

It looks like Firefox 120 supports installing addons through the `navigator.mozAddonManager` API (available only to AMO), but not from a simple link to a `.xpi` file. I may end up writing a simplified version of this script for v120+ that just tells it to install an addon from a `.xpi` URL, rather than messing with the addon list like this does. For now, you can still use this program and [the `addonURLs` source type][] to install them.

[prepare]: https://blog.mozilla.org/addons/2023/08/10/prepare-your-firefox-desktop-extension-for-the-upcoming-android-release/
[the `addonURLs` source type]: #addonurls

### Update: May not be needed for ~122+?
I missed this getting added, and I'm not sure exactly which version it first appeared in (probably ~122), but apparently the stable releases of Firefox for Android now have a hidden "Install add-on from file" command.

- Go to Settings > About Firefox.
- Tap the logo five times to enable the debug settings.
- Go back to Settings. "Install add-on from file" should appear in the Advanced section, right below "Add-ons".

So we might not need any of this anymore, assuming that extensions installed this way still update themselves normally.

## ⚠️ Warning

This code is a mess, and I make no guarantees that it won't break horribly on your machine.

Some addons really don't run on Fenix even if you can get them installed, either because the API they're using still has bugs in Fenix, or because Fenix just hasn't implemented that API yet at all.

## Usage

For now, it needs to be run straight from this directory. You'll need a version of Node.js new enough to have the experimental `fetch` API.

You'll need `adb` installed and set up to talk to your device, either using USB, old-style `adb wifi`, or Android 11+-style "Wireless Debugging".

```console
$ git clone https://github.com/Rhys-T/addonInjectorForFenix
$ cd addonInjectorForFenix
$ npm install
$ # Make sure Firefox is running on the device
$ ./addonInjectorForFenix.mjs build  # rebuilds the addon list file
$ ./addonInjectorForFenix.mjs inject # injects the list into Firefox
$ ./addonInjectorForFenix.mjs        # does both steps in one command
```

The injection process needs at least one tab open and loaded, so that there's a privileged JavaScript context to access the files through. If Firefox doesn't have any tabs loaded, the injector will automatically pop open an `about:blank` tab and use it. You can close that tab as soon as it's done.

The updated addon list should take effect immediately, without needing to relaunch Firefox.

### With other Firefox variants/forks

This program can also inject into the Beta and Nightly versions of Firefox for Android, as well as forks like [Fennec F-Droid][] and [Iceraven][]. While they tend to already let you switch to a custom addon collection, doing it this way instead still has a few advantages:

- You don't have to create a Mozilla account and a public list of addons you want to install.
- You can install addons that aren't on addons.mozilla.org at all.
- You can install more than 50 addons (although Iceraven already lets you do that).

Find the (reverse-domain-name-looking) package ID for the Firefox-based browser you're using. Either pass it to the `-a`/`--app` option to addonInjectorForFenix, or set the `app` setting at the top level of your config file.

<details><summary>Package IDs for various Firefox-based browsers</summary>

| Name                   | ID                                         |
| ---------------------- | ------------------------------------------ |
| Firefox                | `org.mozilla.firefox` (default)            |
| Firefox Beta           | `org.mozilla.firefox_beta`                 |
| Firefox Nightly        | `org.mozilla.fenix`                        |
| Fennec F-Droid         | `org.mozilla.fennec_fdroid`                |
| Mull                   | `us.spotco.fennec_dos`                     |
| Iceraven               | `io.github.forkmaintainers.iceraven`       |
| SmartCookieWeb         | `com.cookiegames.smartcookie`              |
| SmartCookieWeb Preview | `com.cookiejarapps.android.smartcookieweb` |

</details>

## Known limitations

This program does not let you install unsigned addons. I haven't found any way to do that yet.

The addon list occasionally reverts itself to the official version from Mozilla. This happens when Mozilla changes to a new addon collection (thus causing the cache file's name to change), but can also be caused by addons being updated (see also https://github.com/Rhys-T/fenix-arbitrary-addons/issues/1). When this happens, any installed addons that aren't on the Mozilla list will show up as 'disabled' in the Add-Ons Manager, though they don't seem to actually be disabled right away. If this happens, just re-run the injector. I don't yet know of a way to stop this from happening.

## Configuration

Default config file location is `$XDG_CONFIG_HOME/addonInjectorForFirefox/config.toml` (or `~/.config/addonInjectorForFirefox/config.toml`).

With no config file, addonInjectorForFenix will inject the addon list used by [Iceraven][].

This is still a 0.x version, so the config format is not documented very well yet, and is subject to change. Currently the best reference is the source code.

Example config:
```toml
useSources = [
	'sideload',
	'mine',
	'iceraven',
]

[sources.sideload]
type = 'addonURLs'
[[sources.sideload.addons]]
guid = 'frankerfacez@frankerfacez.com'
name = 'FrankerFaceZ'
xpiURL = 'https://cdn.frankerfacez.com/script/frankerfacez-4.0-an+fx.xpi'

[sources.mine]
type = 'guids'
guids = [
	'{a4c4eda4-fb84-4a84-b4a1-f7c1cbf2a1ad}', # Refined GitHub
	'@ublacklist', # uBlacklist
]
```

There are two predefined sources: [`mozilla`][mozsrc] (the official list that Android Firefox normally uses) and [`iceraven`][icesrc] (the collection that the [Iceraven][] fork defaults to using).

[mozsrc]: https://addons.mozilla.org/en-US/firefox/collections/4757633/Extensions-for-Android/
[icesrc]: https://addons.mozilla.org/en-US/firefox/collections/16201230/What-I-want-on-Fenix/

### Maximum number of requests

By default, the `build` step throws an error if it has to make more than 10 requests.[^whyMaxFetches] If you get a `Too many fetches required, aborting` error, you can set `maxFetches` to a larger number at the top level of `config.toml`. You can also set it to `-1` to allow any number of requests.

[^whyMaxFetches]: I wanted to make sure that it couldn't get stuck in a loop hammering Mozilla's servers if I screwed anything up, for instance by requesting page 1 of a collection over and over and never moving to page 2.

### Source types

#### `addonCollection`
Returns the addons from collection hosted on addons.mozilla.org, just like Android Firefox does (except that it can go past the 50-addon limit).
Makes one request per page of the collection (up to 50 addons per page).

##### Fields
- `user`: The (URL-safe) user name or ID that owns the collection.
- `collection`: The (URL-safe) name or ID of the specific addon collection.

#### `guids`
Returns addons from addons.mozilla.org specified by their GUIDs, without having to find or create a collection that contains all of them.
Makes one request per page of results (up to 50 addons per page).

##### Fields
- `guids`: An array of extension GUID strings.

#### `addonURLs`
Lets you sideload `.xpi`s that aren't hosted on addons.mozilla.org.
Returns a stub addon entry for each addon you specify, with just enough dummy info to get Firefox to install it and leave it enabled.
Makes no requests.

##### Fields
- `addons`: An array of objects, each of which has:
  - `guid`: The GUID of the addon. Must match the one in the `.xpi` file, so that Firefox knows not to disable it as unsupported.
  - `name`: The name to list the addon as in the Add-ons Manager. Doesn't need to match anything, although it's probably less confusing if it does match. Defaults to the GUID if not specified.
  - `xpiURL`: The URL that Firefox should download the `.xpi` file from.

##### Notes
addonInjectorForFenix doesn't look at the actual `.xpi` file at all, so it can't provide correct values for many of the fields. In particular, the description, icon, version, last-updated date, and permissions will be filled with generic placeholder values.

⚠️ **Warning:** When showing the initial permissions prompt during addon installation, older versions of Firefox (≤ 118) only look at the values in the addon list JSON file, not the ones from the `.xpi` (which it hasn't downloaded yet at that point). addonInjectorForFenix doesn't know what permissions are being requested either, so **the prompt won't tell you what permissions the addon wants!** addonInjectorForFenix fills this field with a fake host permission for `unknown-permissions.use-at-your-own-risk.addon-injector-for-fenix.invalid`, as a reminder that the real permissions aren't being shown. Make sure you trust any addons you install this way! (Firefox 119+ _does_ seem to grab the file and show the correct permissions once you start trying to install an extension, so you won't see this warning pseudo-domain there.)

During later injections, addonInjectorForFenix will attempt to replace these placeholder values with real ones for any addons that are already installed.

Fenix seems to handle updating the addon to a new version like usual, even if that version is at a different URL than the one in your config, so you don't need to keep the URL up to date unless you're going to be uninstalling and reinstalling the addon a lot.

#### `addonJSONs`
Returns premade addon entries stored in JSON files.
I was using this at one point while testing. It's pretty much just here because I haven't bothered to remove it yet.
It really ought to allow multiple addons in the same file, but the time I only needed the one.
If you come up with any interesting uses for this source type, let me know and I'll try and clean it up to be properly usable.

##### Fields
- `files`: A list of paths to JSON files. Each file should contain one object, which will be inserted into the final `addons` array as-is. Paths are interpreted relative to the directory containing the config file.

## Running on Android

addonInjectorForFenix is capable of running on Android under [Termux][] - even on the same device as the copy of Fenix you're injecting into, using Android 11+'s new 'Wireless Debugging' setting.

```console
$ pkg install android-tools nodejs # or nodejs-lts
$ # If you're on a Samsung device, see below
$ # The first time:
$ # Turn on wireless debugging
$ # Go to the wireless debugging settings
$ # Click 'Pair device with pairing code'
$ # Get the pairing port# and code, and plug them into this command:
$ adb pair 127.0.0.1:31111 123456
$ # Whenever you're running the injector:
$ # Turn on wireless debugging
$ # Go to the wireless debugging settings
$ # Get the main port#, and plug it into this command
$ adb connect 127.0.0.1:32222
$ # Now you should be able to run the injector using the normal instructions above
```

### Weird Samsung bugs(?)

There is [an issue][samsungadb] on some Samsung devices that causes `adb` to fail under Termux. It can be worked around by setting the `ANDROID_NO_USE_FWMARK_CLIENT` environment variable to `1`… except that `adb` only listens to that variable if it thinks it's running as root (even though it doesn't need root to actually do it), so you _also_ have to run the `adb` command inside `fakeroot`.

Do `pkg install fakeroot` in addition to the packages listed above, and prefix each `adb` command with `ANDROID_NO_USE_FWMARK_CLIENT=1 fakeroot`. addonInjectorForFenix will automatically prefix each of its internal `adb` commands for you if it detects that it's running on a Samsung device. This can be overridden by setting `noFwmark = false` at the top level of `config.toml`, if your device doesn't have this bug. (If it does, but isn't Samsung, you can also set `noFwmark = true`.)

[Termux]: https://termux.dev/
[samsungadb]: https://github.com/termux/termux-packages/issues/7946

## How it works

See <https://github.com/Rhys-T/fenix-arbitrary-addons>.

## License

This program is licensed under the [Mozilla Public License, version 2.0][MPL-2.0].

Some third-party files or code are being used under various open-source licenses.
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

Samsung is a registered trademark of Samsung Electronics Co. Ltd.
