#!/usr/bin/env node
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// @ts-check
import net from 'net';
import Foxdriver from 'foxdriver';
import Actor from 'foxdriver/build/actor.js';
import process from 'process';
// import repl from 'repl';
import fs from 'fs';
import path from 'path';
import os from 'os';
// yargs currently breaks mid-word when wrapping if it's imported as an ES6 module.
// See https://github.com/yargs/yargs/issues/2112
// So for now, load it via `require` instead.
// import yargs from 'yargs';
// import {hideBin} from 'yargs/helpers';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const yargs = require('yargs');
const {hideBin} = require('yargs/helpers');
import * as cheerio from 'cheerio';
// import orderBy from 'lodash.orderby';
import child_process from 'child_process';
import { Console } from 'console';
const console = new Console(process.stderr);

const processEvents = /** @type {any} */ (process)._events;
if(typeof processEvents?.warning === 'function') {
	const oldHandler = processEvents.warning;
	processEvents.warning = function(warning, ...x) {
		if(!(warning.name === 'ExperimentalWarning' && /\bFetch API\b/i.test(warning.message))) {
			return oldHandler(warning, ...x);
		}
	}
}

// console.log(yargs);
const args = yargs()
	.scriptName('addonInjectorForFenix')
	.strict()
	// .wrap(yargs.terminalWidth())
	.usage('Inject custom addon list into release version of Android Firefox')
	.option('collection', {
		type: 'string',
		alias: 'C',
		description: "AMO user name/ID and collection name/ID to fetch, separated by '/'",
		default: '16201230/What-I-want-on-Fenix',
		defaultDescription: `"16201230/What-I-want-on-Fenix" (Iceraven's collection)`,
		coerce(collectionSpec) {
			const result = collectionSpec.split('/');
			if(result.length !== 2) {
				throw new Error("AMO collection must be specified as '<user>/<collection>'");
			}
			return result;
		},
	})
	.option('file', {
		type: 'string',
		alias: 'f',
		description: 'Inject premade json file instead of fetching addon info',
	})
	.option('user-agent', {
		type: 'string',
		alias: 'U',
		description: 'User-Agent to use when fetching addon data',
		default: 'Firefox/109.0',
	})
	.option('no-list', {
		type: 'boolean',
		alias: 'n',
		description: 'Start from an empty addon list (use -a to extend)',
	})
	.option('extra-addons', {
		type: 'array',
		alias: 'a',
		description: `Addons to insert into list. Each can be an "Extension ID" from about:debugging, or an AMO URL to scrape. (ignored for --file)`,
		coerce(extraAddons) {
			return extraAddons.map(a => a.toString());
		},
	})
	.option('language', {
		type: 'string',
		alias: 'l',
		description: 'ISO language code, or empty string (ignored for --file)',
		default: 'en-US',
	})
	.option('sort', {
		choices: ['popularity', 'name', 'added'].flatMap(x => [x, '-'+x]),
		alias: 'S',
		description: 'Sort order (ignored for --file)',
		default: '-popularity',
	})
	.option('device', {
		type: 'string',
		alias: 's',
		description: 'Specify an Android device (passed to adb -s)',
		defaultDescription: 'whatever adb defaults to',
	})
	.option('no-fwmark', {
		type: 'boolean',
		alias: ['F', 'samsung'],
		description: 'Work around adb issues in Termux on Samsung',
	})
	.option('dump', {
		type: 'boolean',
		description: 'Dump generated JSON to stdout instead of injecting',
	})
	// .check(args => {
	// 	if(args.collection && args.collection.split('/').length !== 2) {
	// 		throw new Error("AMO collection must be specified as '<user>/<collection>");
	// 	}
	// })
.parseSync(hideBin(process.argv));
const adb = [
	...args.noFwmark ? ['env', 'ANDROID_NO_USE_FWMARK_CLIENT=1', 'fakeroot'] : [],
	'adb',
	...args.device ? ['-s', args.device] : [],
];
const [adbCmd, ...adbArgs] = adb;
console.log(args);
// process.exit();
console.log(adbCmd, adbArgs);

const {userAgent} = args;

let addonData;
if(args.file) {
	addonData = fs.readFileSync(args.file, 'utf-8');
	JSON.parse(addonData); // validate
} else {
	if(args.noList) {
		addonData = {
			page_size: 50,
			page_count: 1,
			count: 0,
			next: null,
			previous: null,
			results: [],
		};
	} else {
		let [user, collection] = args.collection || ['16201230', 'What-I-want-on-Fenix'];
		const firstPageParams = new URLSearchParams();
		firstPageParams.set('page_size', '50');
		firstPageParams.set('sort', args.sort);
		if(args.language) {
			firstPageParams.set('lang', args.language);
		}
		let nextPageURL = `https://services.addons.mozilla.org/api/v4/accounts/account/${encodeURIComponent(user)}/collections/${encodeURIComponent(collection)}/addons/?${firstPageParams}`;
		const resultLists = [];
		while(nextPageURL) {
			console.log(nextPageURL);
			const response = await fetch(nextPageURL, {
				headers: {
					'User-Agent': userAgent,
				},
			});
			const responseData = await response.json();
			nextPageURL = responseData.next;
			resultLists.push(responseData.results);
		}
		const results = resultLists.flat();
		addonData = {
			page_size: results.length,
			page_count: 1,
			count: results.length,
			next: null,
			previous: null,
			results,
		};
	}
	if(args.extraAddons?.length) {
		const ids = [], urls = [];
		for(const addonSpec of args.extraAddons) {
			(addonSpec.startsWith('https://addons.mozilla.org/') ? urls : ids).push(addonSpec);
		}
		const oldResults = addonData.results;
		let results;
		if(ids.length) {
			const firstPageParams = new URLSearchParams();
			firstPageParams.set('page_size', '50');
			if(args.language) {
				firstPageParams.set('lang', args.language);
			}
			firstPageParams.set('guid', ids.join(','));
			let nextPageURL = `https://services.addons.mozilla.org/api/v4/addons/search/?${firstPageParams}`;
			const resultLists = [];
			while(nextPageURL) {
				console.log(nextPageURL);
				const response = await fetch(nextPageURL, {
					headers: {
						'User-Agent': userAgent,
					},
				});
				const responseData = await response.json();
				// console.log(responseData);
				nextPageURL = responseData.next;
				resultLists.push(responseData.results.map(addon => ({addon, notes: null})));
			}
			results = resultLists.flat();
		} else {
			results = [];
		}
		for(const addonURL of urls) {
			console.log(addonURL);
			const response = await fetch(addonURL, {
				headers: {
					'User-Agent': userAgent,
				},
			});
			const responseData = await response.text();
			const $ = cheerio.load(responseData);
			const reduxState = JSON.parse($('#redux-store-state').text());
			// console.log(reduxState.addons.byID);
			// results.push(...Object.values(reduxState.addons.byID));
			for(const addon of Object.values(reduxState.addons.byID)) {
				if(!('current_version' in addon)) {
					addon.current_version = reduxState.versions.byId[addon.currentVersionId];
				}
				if(!('files' in addon.current_version)) {
					addon.current_version.files = [addon.current_version.file];
				}
				results.push({
					addon,
					notes: null,
				});
			}
		}
		results = results.concat(oldResults);
		/*
		const [, sortMinus, sortType] = /** @type {RegExpExecArray} *\/ (/^(-?)(\w+)$/.exec(args.sort));
		results = orderBy(results, [{
			name: ({addon}) => addon.name.toLowerCase(), // NOTE: probably not quite the same as what Mozilla is doing - Unicode weirdness etc.
			added: ({addon}) => new Date(addon.created),
			popularity: ({addon}) => addon.weekly_downloads,
		}[sortType]], [sortMinus ? 'desc' : 'asc']);
		*/
		addonData = {
			page_size: results.length,
			page_count: 1,
			count: results.length,
			next: null,
			previous: null,
			results,
		};
	}
	addonData = JSON.stringify(addonData);
}
if(args.dump) {
	await new Promise(resolve => process.stdout.write(addonData, resolve));
	process.exit();
}
// process.exit();

// Sneak a Unix socket spec past Foxdriver's API, which only wants host/port i.e. TCP
const oldCreateConnection = net.createConnection;
net.createConnection = function(...args) {
	if(args[0]?.port === -99999) {
		args[0] = {path: args[0].host};
	}
	return oldCreateConnection.call(this, ...args);
};

const myTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addonInjectorForFenix-'));
const mySocket = path.join(myTmpDir, 'adb.sock');

child_process.spawnSync(adbCmd, [...adbArgs, 'forward', `localfilesystem:${mySocket}`, 'localabstract:org.mozilla.firefox/firefox-debugger-socket'], {stdio: 'inherit'});

try {
	const {browser, tabs} = await Foxdriver.attach(mySocket, -99999);
	const {client} = browser;
	const {processDescriptor} = await browser.request('getProcess', {id: 0});
	const procDescActor = new Actor(client, processDescriptor.actor);
	const procTargetMsg = await procDescActor.request('getTarget');
	const procTargetActor = new Actor(client, procTargetMsg.process.actor, procTargetMsg.process);
	const procConsole = procTargetActor._get('console');
	console.log(await procConsole.evaluateJSAsync(function(addonData) {
		/// <reference path="./mozilla.d.ts" />
		JSON.parse(addonData);
		const dummyScope = {};
		// const {NetUtil} = Cu.import("resource://gre/modules/NetUtil.jsm", dummyScope);
		const {FileUtils} = Cu.import("resource://gre/modules/FileUtils.jsm", dummyScope);
		const filesDir = new FileUtils.File(`/data/data/org.mozilla.firefox/files`);
		const re = /^mozilla_components_addon_collection_.*\.json$/;
		let file;
		// const fileNames = [];
		for(const testFile of filesDir.directoryEntries) {
			if(re.test(testFile.leafName)) {
				// if(!file) {
					file = testFile;
				// }
				// fileNames.push(file.leafName);
				break;
			}
		}
		if(!file) {
			return 'No existing cache file';
		}
		// file = new FileUtils.File(`/storage/emulated/0/Download/test-2023-01-21.txt`);
		const oldFile = (({fileSize, permissions}) => ({fileSize, permissions}))(file);
		const ostream = FileUtils.openAtomicFileOutputStream(file);
		try {
			const encodedArray = new TextEncoder().encode(addonData);
			// You'd think I could just do:
			// 	const encoded = new TextDecoder('latin1').decode(encodedArray);
			// but 'latin1' is _actually_ Windows-1252, for the usual 'broken IE compatibility nonsense' reasons,
			// and they haven't added _real_ ISO-8859-1. So I have to do it the hard way, and work around
			// argument list length limits.
			let encoded = '';
			const chunkSize = 102400;
			for(let i = 0; i < encodedArray.length; i += chunkSize) {
				encoded += String.fromCharCode.apply(null, encodedArray.slice(i, i+chunkSize));
			}
			ostream.write(encoded, encoded.length);
			ostream.flush();
		} finally {
			FileUtils.closeAtomicFileOutputStream(ostream);
		}
		file = new FileUtils.File(file.path);
		// Not quite 100 years, because leap years, but long enough:
		file.lastModifiedTime += 100*365*24*60*60*1000;
		return `${oldFile.permissions.toString(8)} -> ${file.permissions.toString(8)}\n${oldFile.fileSize} -> ${file.fileSize}\nWrote to ${file.path}`;
	}, addonData));
} finally {
	child_process.spawnSync(adbCmd, [...adbArgs, 'forward', '--remove', `localfilesystem:${mySocket}`], {stdio: 'inherit'});
	fs.unlinkSync(mySocket);
	fs.rmdirSync(myTmpDir);
}
process.exit();
