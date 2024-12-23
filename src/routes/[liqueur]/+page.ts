import { componentId, deserialize, newSpirit, Sweetener } from '$lib/index.svelte';
import type { LoadDataFromUrl } from '$lib/load-data.js';

export function load(args: { url: URL; params: { liqueur: string } }): LoadDataFromUrl {
	const { url, params } = args;
	// if (url.pathname.startsWith('/favicon')) return;
	try {
		const mixture = deserialize(url.searchParams);
		// decode params.liqueur
		const name = decodeURIComponent(params.liqueur) ?? 'mixture';
		if (!mixture.isValid) throw new Error('Invalid mixture');

		return {
			storeId: null,
			name,
			components: mixture.data.components
		};
	} catch (err) {
		console.error(err);
		return {
			storeId: null,
			name: '',
			components: [
				{
					name: '',
					id: componentId(),
					data: newSpirit(100, 40).data
				},
				{
					name: '',
					id: componentId(),
					data: { volume: 100, type: 'water' }
				},
				{
					name: '',
					id: componentId(),
					data: new Sweetener('sucrose', 50).data
				}
			]
		};
	}
}
