#!/usr/bin/env node
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// @ts-check
/// <reference path="./mozilla.d.ts" />
import process from 'process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import child_process from 'child_process';
import fs from 'fs';
import url from 'url';
// import fsp from 'fs/promises';
import toml from '@ltd/j-toml';
import { Command } from 'commander';
import { installFoxdriverPatches, kFakePortUseUnixSocket } from './lib/foxdriverPatches.mjs';

// Silence warnings about Fetch API
const processEvents = /** @type {any} */ (process)._events;
if(typeof processEvents?.warning === 'function') {
	const oldHandler = processEvents.warning;
	processEvents.warning = function(warning, ...x) {
		if(!(warning.name === 'ExperimentalWarning' && /\bFetch API\b/i.test(warning.message))) {
			return oldHandler(warning, ...x);
		}
	}
}

/**
 * @typedef {Object} AddonCollectionPage
 * @property {number} page_size
 * @property {number} page_count
 * @property {number} count
 * @property {?string} prev
 * @property {?string} next
 * @property {AddonCollectionEntry[]} results
 * 
 * @typedef {Object} AddonCollectionEntry
 * @property {Addon} addon
 * @property {?string} notes
 * 
 * @typedef {Object} Addon
 * @property {string} guid
 * 
 * @typedef {Object} Config
 * @property {string[]} useSources
 * @property {number} maxFetches
 * @property {'-popularity'|'popularity'|'-name'|'name'|'-added'|'added'|false} sortCombinedList
 * @property {string[] | undefined} moveToTop
 * @property {boolean | 'auto'} noFwmark
 * @property {string | undefined} device
 * @property {string} app
 * @property {string|undefined} outputPath
 * @property {number} maxAge
 * @property {boolean} fixupAddonData
 * @property {Record<string, Source> & {_default: Source}} sources
 * 
 * @typedef {AddonCollectionSource | AddonJSONsSource | AddonGUIDsSource | AddonURLsSource} Source
 * 
 * @typedef {Object} AddonCollectionSource
 * @property {'addonCollection'} type
 * @property {string} user
 * @property {string} collection
 * @property {string} language
 * @property {?string} userAgent
 * @property {'-popularity'|'popularity'|'-name'|'name'|'-added'|'added'} sort
 * 
 * @typedef {Object} AddonJSONsSource
 * @property {'addonJSONs'} type
 * @property {string[]} files
 * 
 * @typedef {Object} AddonURLsSource
 * @property {'addonURLs'} type
 * @property {AddonURLEntry[]} addons
 * 
 * @typedef {Object} AddonURLEntry
 * @property {string} guid
 * @property {string} name
 * @property {string} xpiURL
 * 
 * @typedef {Object} AddonGUIDsSource
 * @property {'guids'} type
 * @property {string[]} guids
 * @property {string} language
 * @property {?string} userAgent
 * 
 * @typedef {Object} AddonUpdateManifest
 * @property {Record<string, AddonUpdateManifestAddon>} addons
 * 
 * @typedef {Object} AddonUpdateManifestAddon
 * @property {AddonUpdateManifestAddonUpdate[]} updates
 * 
 * @typedef {Object} AddonUpdateManifestAddonUpdate
 * @property {string} version
 */

// const stdoutWriteAsync = promisify(process.stdout.write.bind(process.stdout));
// const stderrWriteAsync = promisify(process.stderr.write.bind(process.stderr));
const program = new Command();
program
	.name('addonInjectorForFenix')
	.description('Inject custom addon list into release version of Android Firefox')
;
program.command('build [file]')
	.description('rebuild addon collection JSON if necessary')
	.option('-f, --force', 'always rebuild')
	.option('-c, --config <file>', 'path to config file')
	.action(async (addonsJSONPath, options) => {
		const {config, configPath} = loadConfig(options);
		addonsJSONPath = findAddonsJSONPath(addonsJSONPath, config);
		if(!isExpired(addonsJSONPath, config, configPath)) {
			// stderrWriteAsync(`Using cached file\n`);
			console.warn('Using cached file');
			return;
		}
		const addonCollectionPage = await build(config, configPath);
		const addonsJSON = JSON.stringify(addonCollectionPage);
		if(addonsJSONPath === '-') {
			// await stdoutWriteAsync(addonsJSON);
			fs.writeFileSync(1, addonsJSON, 'utf-8')
		} else {
			fs.writeFileSync(addonsJSONPath, addonsJSON, 'utf-8');
		}
	})
;
program.command('inject [file]')
	.description('inject addon collection JSON into Android Firefox via ADB')
	.option('-c, --config <file>', 'path to config file')
	.option('-s, --device <serial>', 'Android device to target (passed through to adb -s)')
	.option('-a, --app <bundleID>', 'bundle ID of Firefox-like app to target')
	.action(async (addonsJSONPath, options) => {
		const {config, configPath} = loadConfig(options);
		addonsJSONPath = findAddonsJSONPath(addonsJSONPath, config);
		let addonsJSON;
		if(addonsJSONPath === '-') {
			addonsJSON = fs.readFileSync(0, 'utf-8');
		} else {
			addonsJSON = fs.readFileSync(addonsJSONPath, 'utf-8');
		}
		await inject(addonsJSON, config, configPath, options);
	})
;
program.command('build-and-inject', {isDefault: true})
	.description('rebuild addon collection JSON if necessary, and immediately inject it')
	.option('-f, --force', 'always rebuild')
	.option('-c, --config <file>', 'path to config file')
	.option('-s, --device <serial>', 'Android device to target (passed through to adb -s)')
	.option('-a, --app <bundleID>', 'bundle ID of Firefox-like app to target')
	.action(async (options) => {
		const {config, configPath} = loadConfig(options);
		const addonsJSONPath = findAddonsJSONPath(undefined, config);
		let addonsJSON;
		if(!isExpired(addonsJSONPath, config, configPath)) {
			console.warn('Using cached file');
			addonsJSON = fs.readFileSync(addonsJSONPath, 'utf-8');
		} else {
			const addonCollectionPage = await build(config, configPath);
			addonsJSON = JSON.stringify(addonCollectionPage);
			fs.writeFileSync(addonsJSONPath, addonsJSON, 'utf-8');
		}
		await inject(addonsJSON, config, configPath, options);
	})
;

await program.parseAsync();

/**
 * @param {string} addonsJSONPath
 * @param {Config} config
 * @param {string | undefined} configPath
 */
function isExpired(addonsJSONPath, config, configPath) {
	const {maxAge} = config;
	if(maxAge <= 0) {
		return true;
	}
	// if(addonsJSONPath === '-') {
	// 	return true;
	// }
	try {
		const stats = fs.statSync(addonsJSONPath);
		if(configPath) {
			const configStats = fs.statSync(configPath);
			if(configStats.mtimeMs > stats.mtimeMs) {
				return true;
			}
		}
		for(const sourceName of config.useSources) {
			const source = config.sources[sourceName];
			if(source.type === 'addonJSONs') {
				for(const addonJSONFile of source.files) {
					const jsonStats = fs.statSync(addonJSONFile);
					if(jsonStats.mtimeMs > stats.mtimeMs) {
						return true;
					}
				}
			}
		}
		return +new Date() - +new Date(stats.mtimeMs) > maxAge*1000;
	} catch(e) {
		if(e.code === 'ENOENT') {
			return true;
		} else {
			throw e;
		}
	}
}

/**
 * 
 * @param {string | undefined} fromCommandLine 
 * @param {Config} config 
 */
function findAddonsJSONPath(fromCommandLine, config) {
	let addonsJSONPath = fromCommandLine;
	if(!addonsJSONPath) {
		addonsJSONPath = config.outputPath;
		if(!addonsJSONPath) {
			addonsJSONPath = path.join(
				process.env['XDG_CACHE_HOME'] || path.join(
					/** @type {string} */ (process.env['HOME']),
					'.cache'
				),
				'addonInjectorForFenix',
				'addons.json',
			);
			fs.mkdirSync(path.dirname(addonsJSONPath), {recursive: true});
		}
	}
	return addonsJSONPath;
}


function loadConfig(options) {
	let configPath = /** @type {string|undefined} */(options.config);
	let explicitConfig = true;
	if(!configPath) {
		explicitConfig = false;
		configPath = path.join(
			process.env['XDG_CONFIG_HOME'] || path.join(
				/** @type {string} */ (process.env['HOME']),
				'.config'
			),
			'addonInjectorForFenix',
			'config.toml',
		);
	}
	
	const defaults = /** @type {Config} */(toml.parse(`
		useSources = ['iceraven']
		sortCombinedList = false
		maxFetches = 10
		noFwmark = 'auto'
		app = 'org.mozilla.firefox'
		maxAge = ${24*60*60}
		fixupAddonData = true
		
		[sources._default]
		sort = '-popularity'
		language = 'en-US'
		# userAgent = 'Firefox/109.0'
		
		[sources.iceraven]
		type = 'addonCollection'
		user = '16201230'
		collection = 'What-I-want-on-Fenix'
		
		[sources.mozilla]
		type = 'addonCollection'
		user = 'mozilla'
		collection = 'Extensions-for-Android'
	`, {bigint: false}));
	let configDirect;
	try {
		configDirect = /** @type {Partial<Config>} */(toml.parse(fs.readFileSync(configPath, 'utf-8'), {bigint: false}));
	} catch(e) {
		if(!explicitConfig && e.code === 'ENOENT') {
			return {config: defaults};
		} else {
			throw e;
		}
	}
	/** @type {Config} */
	const config = ({
		...defaults,
		...configDirect,
		sources: {
			...defaults.sources,
			...configDirect.sources,
			_default: {
				...defaults.sources._default,
				...configDirect.sources?._default,
			}
		},
	});
	if(options.force) {
		config.maxAge = -1;
	}
	return {config, configPath};
}

/**
 * @param {Config} config
 * @param {string|undefined} configPath
 * @returns {Promise<AddonCollectionPage>}
 */
async function build(config, configPath) {
	console.warn('Rebuilding addons JSON');
	let fetchesLeft = config.maxFetches;
	function checkFetch() {
		if(fetchesLeft < 0) {
			return;
		}
		if(fetchesLeft-- <= 0) {
			throw new Error(`Too many fetches required, aborting (maxFetches = ${config.maxFetches})`);
		}
	}
	/** @type {AddonCollectionEntry[]} */
	let addonEntries = [];
	const defaultSource = config.sources._default;
	
	/** @type {?Map<string, AddonUpdateManifest>} */
	let addonUpdateManifests = null;
	
	/** @type {?string} */
	let genericAddonIconURL = null;
	
	for(const sourceName of config.useSources) {
		const source = {...defaultSource, ...config.sources[sourceName]};
		// console.log({source}); process.exit();
		if(!source) {
			throw new Error(`No such source: ${sourceName}`);
		}
		// console.log(sourceName, source);
		switch(source.type) {
			case 'addonCollection': {
				const {sort, language, userAgent, user, collection} = source;
				const firstPageParams = new URLSearchParams();
				firstPageParams.set('page_size', '50');
				firstPageParams.set('sort', sort);
				if(language) {
					firstPageParams.set('lang', language);
				}
				let nextPageURL = `https://services.addons.mozilla.org/api/v4/accounts/account/${encodeURIComponent(user)}/collections/${encodeURIComponent(collection)}/addons/?${firstPageParams}`;
				const resultLists = [];
				while(nextPageURL) {
					// console.log(nextPageURL);
					checkFetch();
					const response = await fetch(nextPageURL, userAgent ? {
						headers: {
							'User-Agent': userAgent,
						},
					} : undefined);
					const responseData = await response.json();
					nextPageURL = responseData.next;
					resultLists.push(responseData.results);
				}
				addonEntries = addonEntries.concat(...resultLists);
				break;
			}
			case 'addonJSONs': {
				const dir = path.dirname(configPath || '.');
				for(const filePath of source.files) {
					const resolvedFilePath = path.resolve(dir, filePath);
					addonEntries.push({
						addon: JSON.parse(fs.readFileSync(resolvedFilePath, 'utf-8')),
						notes: null,
					});
				}
				break;
			}
			case 'guids': {
				const {language, userAgent, guids} = source;
				const firstPageParams = new URLSearchParams();
				firstPageParams.set('page_size', '50');
				if(language) {
					firstPageParams.set('lang', language);
				}
				firstPageParams.set('guid', guids.join(','));
				let nextPageURL = `https://services.addons.mozilla.org/api/v4/addons/search/?${firstPageParams}`;
				// console.log(nextPageURL); process.exit();
				const resultLists = [];
				while(nextPageURL) {
					// console.log(nextPageURL);
					checkFetch();
					const response = await fetch(nextPageURL, userAgent ? {
						headers: {
							'User-Agent': userAgent,
						},
					} : undefined);
					const responseData = await response.json();
					nextPageURL = responseData.next;
					resultLists.push(responseData.results);
				}
				addonEntries = addonEntries.concat(resultLists.flat().map(addon => ({addon, notes: null})));
				break;
			}
			case 'addonURLs': {
				const {addons} = source;
				for(const addonInfo of addons) {
					const {guid, name, xpiURL} = addonInfo;
					if(!genericAddonIconURL) {
						const imageData = fs.readFileSync(url.fileURLToPath(new URL('./extensionGeneric.png', import.meta.url)));
						genericAddonIconURL = 'data:image/png;base64,' + imageData.toString('base64');
					}
					addonEntries.push({
						addon: /** @type {Addon} */({
							guid,
							authors: [],
							categories: {android: []},
							created: "1970-01-01T00:00:00Z",
							last_updated: "1970-01-01T00:00:00Z",
							icon_url: genericAddonIconURL,
							current_version: {
								version: '0.0.0.0',
								files: [{
									id: -1,
									url: xpiURL,
									permissions: ["https://unknown-permissions.use-at-your-own-risk.addon-injector-for-fenix.invalid/*"],
								}],
							},
							name,
							description: `This addon was manually injected by addonInjectorForFenix from a '.xpi' URL. No long description is available.\n\nURL: ${xpiURL}`,
							summary: "[injected]",
							ratings: {
								"average": 0,
								"bayesian_average": 0,
								"count": 0,
								"text_count": 0
							},
							weekly_downloads: 0,
						}),
						notes: null,
					});
				}
				break;
			}
			default:
				throw new Error(`Unknown addon source type: ${/** @type {any} */(source).type}`);
				break;
		}
	}
	if(config.sortCombinedList) {
		const [, sortMinus, sortType] = /** @type {RegExpMatchArray} */ (/^(-?)(\w+)$/.exec(config.sortCombinedList));
		/** @type {(AddonCollectionEntry) => (number | string | Date)} */
		const sortKey = {
			name: ({ addon }) => {
				if(typeof addon.name === 'string') {
					return addon.name.toLowerCase();
				} else {
					const localName = addon.name?.[addon.default_locale || 'en-us'];
					return (localName || addon.guid).toLowerCase();
				}
			},
			added: ({ addon }) => new Date(addon.created),
			popularity: ({ addon }) => addon.weekly_downloads,
		}[sortType];
		const dir = sortMinus ? -1 : 1;
		/**
		 * @param {AddonCollectionEntry} a
		 * @param {AddonCollectionEntry} b
		*/
		const sortFunc = (a, b) => {
			const aKey = sortKey(a);
			const bKey = sortKey(b);
			if(aKey < bKey) {
				return -dir;
			} else if(aKey > bKey) {
				return dir;
			} else {
				return 0;
			}
		};
		addonEntries.sort(sortFunc);
	}
	if(config.moveToTop) {
		const moveToTopGUIDs = config.moveToTop.flatMap(guidOrSourceName => {
			if(guidOrSourceName in config.sources) {
				const source = config.sources[guidOrSourceName];
				if(source.type === 'guids') {
					return source.guids;
				} else if(source.type === 'addonURLs') {
					return source.addons.map(addon => addon.guid);
				} else {
					throw new Error(`No GUID list for ${guidOrSourceName}`);
				}
			} else {
				return guidOrSourceName;
			}
		})
		const moveToTopGUIDSet = new Set(moveToTopGUIDs);
		/** @type {Record<string, AddonCollectionEntry>} */
		const moveToTopAddonsByGUID = Object.create(null);
		addonEntries = addonEntries.filter(addonEntry => {
			const {guid} = addonEntry.addon
			if(moveToTopGUIDSet.has(guid)) {
				moveToTopAddonsByGUID[guid] = addonEntry;
				return false;
			} else {
				return true;
			}
		});
		addonEntries = moveToTopGUIDs.map(guid => {
			const addon = moveToTopAddonsByGUID[guid];
			if(!addon) {
				throw new Error(`Addon with GUID ${guid} missing`);
			}
			return addon;
		}).concat(addonEntries);
	}
	return {
		page_size: addonEntries.length,
		page_count: 1,
		count: addonEntries.length,
		prev: null,
		next: null,
		results: addonEntries,
	}
};
/**
 * @param {string} addonsJSON
 * @param {Config} config 
 * @param {string | undefined} configPath 
 * @param {*} options 
 */
async function inject(addonsJSON, config, configPath, options) {
	console.warn('Injecting');
	JSON.parse(addonsJSON); // validate
	installFoxdriverPatches();
	const Browser = (await import('foxdriver/build/browser.js')).default;
	class BrowserNoTabs extends Browser {
		async listTabs() {
			return [];
		}
	}
	const Actor = (await import('foxdriver/build/actor.js')).default;
	
	const noFwmark = 'noFwmark' in options ? options.noFwmark : config.noFwmark;
	const device = 'device' in options ? options.device : config.device;
	const app = 'app' in options ? options.app : config.app;
	
	await withTempDir(async myTmpDir => {
		await withADBSocketForwarded(noFwmark, device, app, myTmpDir, async (socketPath, adb) => {
			const browser = new /** @type {(host: string, port: number | typeof kFakePortUseUnixSocket) => void} */(/** @type {unknown} */(BrowserNoTabs))(socketPath, kFakePortUseUnixSocket);
			await browser.connect();
			const {client} = browser;
			try {
				const {processDescriptor} = await browser.request('getProcess', {id: 0});
				const procDescActor = new Actor(client, processDescriptor.actor);
				const procTargetMsg = await procDescActor.request('getTarget');
				const procTargetActor = new Actor(client, procTargetMsg.process.actor, procTargetMsg.process);
				const {frames: frameList} = await procTargetActor.request('listFrames');
				let frameFound = false;
				for(const frameInfo of frameList) {
					if(frameInfo.url === 'chrome://geckoview/content/geckoview.xhtml') {
						await procTargetActor.request('switchToFrame', {windowId: frameInfo.id});
						frameFound = true;
						break;
					}
				}
				if(!frameFound) {
					console.warn('No geckoview.xhtml frames found - trying to open a dummy tab');
					try {
						await new Promise((resolve, reject) => {
							const timeout = setTimeout(reject, 2000);
							let gotFrame = false;
							function handleUpdate(msg) {
								if(gotFrame) {
									return;
								}
								if(!msg.frames) {
									return;
								}
								for(const frame of msg.frames) {
									if(!frame.destroy && frame.url === 'chrome://geckoview/content/geckoview.xhtml') {
										procTargetActor.request('switchToFrame', {windowId: frame.id}).then(() => {
											gotFrame = true;
											procTargetActor.off('frameUpdate', handleUpdate);
											clearTimeout(timeout);
											resolve(null);
										});
										break;
									}
								}
							}
							procTargetActor.on('frameUpdate', handleUpdate);
							const adbResult = child_process.spawnSync(adb.cmd, [...adb.args, 'shell', `am start -a android.intent.action.VIEW -n ${escapeShellArg(app)}/org.mozilla.fenix.IntentReceiverActivity -d about:blank`]);
							if(adbResult.status) {
								clearTimeout(timeout);
								reject();
							}
						});
					} catch(e) {
						throw new Error(`No geckoview.xhtml frames found, and couldn't create one - please open a tab and try again`);
					}
				}
				const procConsole = procTargetActor._get('console');
				const resultFromFirefox = await procConsole.evaluateJSAsync(async function(/** @type {string} */ addonsJSON, /** @type {string} */ app, /** @type {Boolean} */ shouldFixupAddonData) {
					const dummyScope = {};
					
					if(shouldFixupAddonData) {
						/** @type {AddonCollectionPage} */
						const addonList = JSON.parse(addonsJSON);
						let allXPIAddonsByID = null;
						for(const addonEntry of addonList.results) {
							/** @type {any} */
							const {addon} = addonEntry;
							if(addon.summary === '[injected]') {
								if(!allXPIAddonsByID) {
									const {XPIDatabase} = Cu.import('resource://gre/modules/addons/XPIDatabase.jsm', dummyScope);
									const allXPIAddons = XPIDatabase.getAddons();
									allXPIAddonsByID = new Map(allXPIAddons.map(xpiAddon => [xpiAddon.id, xpiAddon]));
								}
								const xpiAddon = allXPIAddonsByID.get(addon.guid);
								if(xpiAddon) {
									if(xpiAddon.selectedLocale?.name) {
										addon.name = xpiAddon.selectedLocale.name;
									}
									if(xpiAddon.selectedLocale?.description) {
										addon.summary = xpiAddon.selectedLocale.description;
									}
									if(xpiAddon.userPermissions) {
										addon.current_version.files[0].permissions = [...xpiAddon.userPermissions.permissions || [], ...xpiAddon.userPermissions.origins || []];
									}
									if(xpiAddon.icons) {
										let biggestIcon = null;
										for(const [size, path] of Object.entries(xpiAddon.icons)) {
											biggestIcon = path;
										}
										if(biggestIcon) {
											const iconURL = new URL(biggestIcon, xpiAddon.rootURI).toString();
											if(!iconURL.endsWith('.svg')) {
												const response = await fetch(iconURL);
												const iconBlob = await response.blob();
												const iconDataURL = await new Promise((resolve, reject) => {
													const fr = new FileReader();
													fr.addEventListener('loadend', () => resolve(fr.result));
													fr.addEventListener('error', reject);
													fr.readAsDataURL(iconBlob);
												})
												addon.icon_url = iconDataURL;
											} else {
												// TODO render SVG with canvas?
											}
										}
									}
								}
							}
						}
						if(app === 'io.github.forkmaintainers.iceraven') {
							// services.addons.mozilla.org 'unwraps' the correct locale for various strings when passed 'lang',
							// and 'addonURLs' sources generate fake addon entries containing non-localized strings.
							// Iceraven doesn't pass 'lang' and can't handle non-localized strings here, and will reject the cache if I leave them that way.
							// (Its PagedAddonCollectionProvider seems to be based on an older version of the upstream AddonCollectionProvider.)
							// Re-wrap any non-localized strings, claiming they're in the default locale that Iceraven will fall back to.
							const DEFAULT_LOCALE = 'en-us'; // from Addon.DEFAULT_LOCALE in Firefox for Android source
							for(const addonEntry of addonList.results) {
								/** @type {any} */
								const {addon} = addonEntry;
								for(const key of ['name', 'description', 'summary']) {
									if(typeof addon[key] === 'string') {
										addon[key] = {[addon.default_locale || DEFAULT_LOCALE]: addon[key]};
									}
								}
							}
						}
						addonsJSON = JSON.stringify(addonList);
					}
					
					const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile).path;
					/** @type {string|null} */
					let filesDir = profileDir;
					while(filesDir && PathUtils.filename(filesDir) !== 'files') {
						filesDir = PathUtils.parent(filesDir);
					}
					if(!filesDir) {
						throw new Error("Couldn't find 'files' directory!");
					}
					// Iceraven formats the filename a little differently than Firefox - this should find both.
					const re = /\/[^/]*_components_addon_collection_[^/]*\.json$/;
					let file;
					for(const testFile of await IOUtils.getChildren(filesDir)) {
						if(re.test(testFile)) {
							file = testFile;
							break;
						}
					}
					if(!file) {
						throw new Error('No existing cache file');
					}
					await IOUtils.writeUTF8(file, addonsJSON);
					const modTime = new Date();
					modTime.setFullYear(modTime.getFullYear() + 100);
					await IOUtils.setModificationTime(file, +modTime);
					return `Wrote to ${file}`;
				}, addonsJSON, app, config.fixupAddonData);
				console.warn(resultFromFirefox);
			} finally {
				if(client) client.disconnect();
			}
		});
	});
};

/**
 * @template {array} A
 * @template R
 * @param {(myTmpDir: string, ...A) => (R|Promise<R>)} fn 
 * @param {A} args
 * @returns {Promise<R>}
 */
async function withTempDir(fn, ...args) {
	const myTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addonInjectorForFenix-'));
	let result;
	try {
		result = await fn(myTmpDir, ...args);
	} finally {
		fs.rmSync(myTmpDir, {recursive: true});
	}
	return result;
}

/**
 * @template {array} A
 * @template R
 * @param {Config['noFwmark']} noFwmark
 * @param {Config['device']} device
 * @param {Config['app']} app
 * @param {string} myTmpDir
 * @param {(socketPath: string, adb: {cmd: string, args: string[]}, ...A) => (R|Promise<R>)} fn 
 * @param {A} args
 * @returns {Promise<R>}
 */
async function withADBSocketForwarded(noFwmark, device, app, myTmpDir, fn, ...args) {
	if(noFwmark === 'auto') {
		noFwmark = false;
		if(os.platform() === 'android') {
			let getpropResult;
			try {
				getpropResult = await promisify(child_process.exec)('getprop ro.product.manufacturer');
			} catch(e) {}
			if(getpropResult?.stdout && getpropResult.stdout.trim() === 'samsung') {
				noFwmark = true;
			}
		}
	}
	const adb = [
		...noFwmark ? ['env', 'ANDROID_NO_USE_FWMARK_CLIENT=1', 'fakeroot'] : [],
		'adb',
		...device ? ['-s', device] : [],
	];
	const [adbCmd, ...adbArgs] = adb;
	const socketPath = path.join(myTmpDir, 'firefox.sock');
	const local = `localfilesystem:${socketPath}`;
	const remote = `localabstract:${app}/firefox-debugger-socket`;
	const adbResult = child_process.spawnSync(adbCmd, [...adbArgs, 'forward', local, remote], {stdio: 'inherit'});
	if(adbResult.error) {
		throw adbResult.error;
	} else if(adbResult.status) {
		throw new Error(`adb forward command exited with status ${adbResult.status}`);
	}
	let result;
	try {
		result = fn(socketPath, {cmd: adbCmd, args: adbArgs}, ...args);
	} finally {
		const adbResult = child_process.spawnSync(adbCmd, [...adbArgs, 'forward', '--remove', local], {stdio: 'inherit'});
		if(adbResult.error) {
			throw adbResult.error;
		} else if(adbResult.status) {
			throw new Error(`adb un-forward command exited with status ${adbResult.status}`);
		}
	}
	return result;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeShellArg(str) {
	return `'${str.replace(/'/g, `'\\''`)}'`;
}
