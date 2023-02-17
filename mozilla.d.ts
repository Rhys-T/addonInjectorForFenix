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
declare class Mozilla_OStream {
	write(data: string, size: number): void;
	flush(): void;
}
declare class Mozilla_FileUtils_File {
	constructor(path: string);
	leafName: string;
	path: string;
	fileSize: number;
	permissions: number;
	lastModifiedTime: number;
	directoryEntries: Iterable<Mozilla_FileUtils_File>;
}
type MozillaModules = {
	'resource://gre/modules/addons/XPIDatabase.jsm': {XPIDatabase: {
		getAddons: () => XPIAddon[];
	}};
	'resource://gre/modules/FileUtils.jsm': {FileUtils: {
		File: typeof Mozilla_FileUtils_File;
		openAtomicFileOutputStream: (file: Mozilla_FileUtils_File) => Mozilla_OStream;
		closeAtomicFileOutputStream: (stream: Mozilla_OStream) => void;
	}};
};
type MozillaModuleURL = keyof MozillaModules;

declare var Cu: {
	['import']: <K extends MozillaModuleURL>(url: K, scope?: object) => MozillaModules[K];
};
