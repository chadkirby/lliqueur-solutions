import * as fflate from 'fflate';
import { type AnyData } from './component.js';
import { dataToMixture, Mixture } from './mixture.js';
import { isLocalStorageId, filesDb } from './local-storage.js';

export function deserializeFromLocalStorage(id: string): Mixture {
	if (!isLocalStorageId(id)) {
		throw new Error('Invalid id');
	}
	const item = filesDb.read(id);
	if (!item) {
		throw new Error('No item found');
	}
	const mixture = decompress(new URL(`file:${item.href}`).searchParams);
	return mixture;
}

export function deserialize(qs: string | URLSearchParams): Mixture {
	const params = typeof qs === 'string' ? new URLSearchParams(qs) : qs;
	const mx = decompress(params);
	return mx;
}

function decompress(qs: URLSearchParams): Mixture {
	const gz = qs.get('gz');
	if (!gz) {
		throw new Error('No compressed data found');
	}
	const buf = fflate.decompressSync(fflate.strToU8(atob(gz), true));
	const data = JSON.parse(fflate.strFromU8(buf, true));
	if (!('components' in data) || !(typeof data.components === 'object')) {
		throw new Error('No components found' + qs.toString());
	}
	const components = Array.from(Object.values(data.components as string[])) as unknown as Array<{
		name: string;
		id: string;
		data: AnyData;
	}>;
	return dataToMixture({ components });
}
