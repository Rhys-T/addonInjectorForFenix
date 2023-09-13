/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import net from 'net';
import { addHook } from 'pirates';

let foxdriverPatchesInstalled = false;
export const kFakePortUseUnixSocket = Symbol('kFakePortUseUnixSocket');
export function installFoxdriverPatches() {
	if(foxdriverPatchesInstalled) {
		return;
	}
	// Sneak a Unix socket spec past Foxdriver's API, which only wants host/port i.e. TCP
	const oldCreateConnection = net.createConnection;
	net.createConnection = function(...args) {
		if(args[0]?.port === kFakePortUseUnixSocket) {
			args[0] = {path: args[0].host};
		}
		return oldCreateConnection.call(this, ...args);
	};
	// Patch Foxdriver's evaluateJSAsync to simulate top-level await when passing an async function
	addHook((code, filename) => code.replace(
		/^class Console\b/m,
		`const AsyncFunction = (async x=>0).constructor; $&`,
	).replace(
		`async evaluateJSAsync(script, ...args) {`,
		`$& const origScript = script;`,
	).replace(
		`await this.request('evaluateJSAsync', {`,
		`$& mapped: (origScript instanceof AsyncFunction) ? {await: true} : undefined, `
	), {
		ignoreNodeModules: false,
		matcher: path => /\bfoxdriver\/build\/domains\/console\.js$/.test(path),
	});
	// Patch Foxdriver to properly throw errors if it can't connect to Firefox
	addHook((code, filename) => code.replace(
		`let resolveCb`,
		`$&, rejectCb`,
	).replace(
		/(const resp = new Promise\()(resolve)( => \{.*?)(resolveCb = resolve)/s,
		`$1($2, reject)$3$4; rejectCb = reject`
	).replace(
		/(this\._pendingRequests\.push\(\{\s*to: request\.to,\s*message: request,\s*callback:\s*resolveCb)(\s*\}\))/,
		`$1, rejectCb$2`,
	).replace(
		`this.emit('end')`,
		`for(const req of this._pendingRequests) { req.rejectCb(new Error("Lost connection to Firefox - is it set to allow remote debugging?")); } $&`,
	), {
		ignoreNodeModules: false,
		matcher: path => /\bfoxdriver\/build\/client\.js$/.test(path),
	});
	foxdriverPatchesInstalled = true;
}
