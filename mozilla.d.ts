/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
type XPIAddon = {
	id: string;
	userPermissions?: {
		permissions?: string[];
		origins?: string[];
	};
	selectedLocale?: Partial<{
		name: string;
		description: string;
	}>;
	rootURI: string;
	icons?: Record<number, string>;
};
type MozillaModules = {
	'resource://gre/modules/addons/XPIDatabase.jsm': {XPIDatabase: {
		getAddons: () => XPIAddon[];
	}};
};
type MozillaModuleURL = keyof MozillaModules;

declare var Cu: {
	['import']: <K extends MozillaModuleURL>(url: K, scope?: object) => MozillaModules[K];
};
declare var IOUtils: {
	getChildren: (dirPath: string) => Promise<string[]>;
	writeUTF8: (path: string, contents: string, options?: Partial<{
		tmpPath: string,
	}>) => Promise<number>;
	setModificationTime: (path: string, modTime: number) => Promise<void>;
};
declare var PathUtils: {
	filename: (path: string) => string;
	parent: (path: string) => string|null;
}
type XPCOMInterface<X> = unknown & {___: X};
declare var Ci: {
	nsIFile: XPCOMInterface<{
		path: string;
	}>;
}
declare var Services: {
	dirsvc: {
		get: <X>(dirCode: string, interface: XPCOMInterface<X>) => X;
	};
}