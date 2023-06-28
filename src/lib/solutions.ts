const ComponentValueKeys = ['abv', 'brix', 'volume', 'mass'] as const;
type ComponentValueKeys = (typeof ComponentValueKeys)[number];

function isComponentValueKey(key: string): key is ComponentValueKeys {
	return ComponentValueKeys.includes(key as ComponentValueKeys);
}

const ComponentTypes = ['spirit', 'water', 'sugar', 'syrup'] as const;
type ComponentTypes = (typeof ComponentTypes)[number];
interface BaseComponentData {
	type: ComponentTypes;
	abv: number;
	brix: number;
	volume: number;
	mass: number;
}

function isComponentType(type: string): type is ComponentTypes {
	return ComponentTypes.includes(type as ComponentTypes);
}

interface ComponentData extends BaseComponentData {
	sugarVolume: number;
	waterVolume: number;
	alcoholVolume: number;
	sugarMass: number;
	waterMass: number;
	alcoholMass: number;
}

// get all the numeric keys of ComponentData
type ComponentNumberKeys = {
	[K in keyof ComponentData]: ComponentData[K] extends number ? K : never;
}[keyof ComponentData];

export type SpiritData = {
	type: 'spirit';
	volume: number;
	abv: number;
};
export type WaterData = {
	type: 'water';
	volume: number;
};
export type SugarData = {
	type: 'sugar';
	mass: number;
};
export type SyrupData = {
	type: 'syrup';
	volume: number;
	brix: number;
};

export function checkData(type: 'spirit', input: unknown): input is SpiritData;
export function checkData(type: 'water', input: unknown): input is WaterData;
export function checkData(type: 'sugar', input: unknown): input is SugarData;
export function checkData(type: 'syrup', input: unknown): input is SyrupData;
export function checkData(
	type: ComponentTypes,
	input: unknown
): input is SpiritData | WaterData | SugarData | SyrupData {
	if (typeof input !== 'object' || input === null) return false;
	const data = input as SpiritData | WaterData | SugarData | SyrupData;
	if (data.type !== type) return false;
	switch (type) {
		case 'spirit':
			return (
				typeof (data as SpiritData).volume === 'number' &&
				typeof (data as SpiritData).abv === 'number'
			);
		case 'water':
			return typeof (data as WaterData).volume === 'number';
		case 'sugar':
			return typeof (data as SugarData).mass === 'number';
		case 'syrup':
			return (
				typeof (data as SyrupData).volume === 'number' &&
				typeof (data as SyrupData).brix === 'number'
			);
	}
}

export function isSpirit(data: unknown): data is SpiritData {
	return checkData('spirit', data);
}
export function isWater(data: unknown): data is WaterData {
	return checkData('water', data);
}
export function isSugar(data: unknown): data is SugarData {
	return checkData('sugar', data);
}
export function isSyrup(data: unknown): data is SyrupData {
	return checkData('syrup', data);
}

export interface Component extends ComponentData {
	clone(arg?: { volume?: number; brix?: number; abv?: number }): Component;
	analyze(precision?: number): Target & {
		mass: number;
	};
	setVolume(volume: number): void;
	serialize(): string;
	data: SpiritData | WaterData | SugarData | SyrupData;
}

export class Sugar implements Component {
	static density = 1.59;

	readonly type = 'sugar';
	readonly abv = 0;
	readonly brix = 100;
	readonly waterVolume = 0;
	readonly waterMass = 0;
	readonly alcoholVolume = 0;
	readonly alcoholMass = 0;

	constructor(public mass: number) {}

	get data(): SugarData {
		const { type, mass } = this;
		return { type, mass: round(mass, 1) };
	}
	serialize(): string {
		return serialize(this.data);
	}

	clone({ volume = this.volume }: { volume?: number } = {}) {
		return new Sugar(volume / Sugar.density);
	}
	analyze(precision = 0): Target & { mass: number } {
		return analyze(this, precision);
	}
	setVolume(volume: number) {
		this.mass = volume / Sugar.density;
	}
	get sugarVolume() {
		return this.mass / Sugar.density;
	}
	get volume() {
		return this.sugarVolume;
	}
	set volume(volume: number) {
		this.setVolume(volume);
	}
	get sugarMass() {
		return this.mass;
	}
}

export class Water implements Component {
	readonly type = 'water';
	static density = 1;

	readonly abv = 0;
	readonly brix = 0;
	readonly sugarVolume = 0;
	readonly sugarMass = 0;
	readonly alcoholVolume = 0;
	readonly alcoholMass = 0;

	constructor(public volume: number) {}
	get data(): WaterData {
		const { type, volume } = this;
		return { type, volume: round(volume, 1) };
	}
	serialize(): string {
		return serialize(this.data);
	}
	clone() {
		return new Water(this.volume);
	}
	analyze(precision = 0): Target & { mass: number } {
		return analyze(this, precision);
	}
	setVolume(volume: number) {
		this.volume = volume;
	}
	get waterVolume() {
		return this.volume;
	}
	get waterMass() {
		return this.waterVolume * Water.density;
	}
	get mass() {
		return this.waterMass;
	}
}

export class Ethanol implements Component {
	readonly type = 'spirit';
	static density = 0.79;

	readonly abv = 100;
	readonly brix = 0;
	readonly sugarVolume = 0;
	readonly sugarMass = 0;
	readonly waterVolume = 0;
	readonly waterMass = 0;

	constructor(public volume: number) {}
	get data(): SpiritData {
		const { type, volume, abv } = this;
		return { type, volume: round(volume, 1), abv: round(abv, 1) };
	}

	serialize(): string {
		return serialize(this.data);
	}
	clone() {
		return new Ethanol(this.volume);
	}
	setVolume(volume: number) {
		this.volume = volume;
	}

	get alcoholVolume() {
		return this.volume;
	}
	get alcoholMass() {
		return this.alcoholVolume * Ethanol.density;
	}
	get mass() {
		return this.alcoholMass;
	}
	analyze(precision = 0): Target & { mass: number } {
		return analyze(this, precision);
	}
}

export class Mixture<T extends Record<string, Component>> {
	constructor(readonly components: T = {} as T) {}

	serialize(): string {
		const params = new URLSearchParams();
		for (const [key, component] of this) {
			params.append('name', key);
			for (const [k, v] of Object.entries(component.data)) {
				params.append(k, v.toString());
			}
		}
		return params.toString();
	}

	static deserialize(qs: string | URLSearchParams) {
		const params = typeof qs === 'string' ? new URLSearchParams(qs) : qs;
		const components: Record<string, Component> = {};
		const working: Partial<BaseComponentData & { name: string; type: string }>[] = [];
		for (const [key, value] of params) {
			if (key === 'name') {
				working.push({ name: value });
			} else {
				const current = working.at(-1);
				if (!current) throw new Error('Keys must be preceded by a component name');
				if (isComponentValueKey(key)) {
					current[key] = parseFloat(value);
				} else if (key === 'type' && isComponentType(value)) {
					current.type = value;
				}
			}
		}
		for (const { type, ...values } of working) {
			switch (type) {
				case 'spirit': {
					const { volume, abv, name } = values;
					if (name && undefined !== volume && undefined !== abv) {
						components[name] = new Spirit(volume, abv);
					}
					break;
				}
				case 'water': {
					const { volume, name } = values;
					if (name && undefined !== volume) {
						components[name] = new Water(volume);
					}
					break;
				}
				case 'sugar': {
					const { mass, name } = values;
					if (name && undefined !== mass) {
						components[name] = new Sugar(mass);
					}
					break;
				}
				case 'syrup': {
					const { volume, brix, name } = values;
					if (name && undefined !== volume && undefined !== brix) {
						components[name] = new Syrup(volume, brix);
					}
					break;
				}
				default:
					throw new Error(`Unknown component type: ${type}`);
			}
		}

		return new Mixture(components);
	}

	get mixtureData() {
		return Object.fromEntries([...this].map(([k, v]) => [k, v.data]));
	}
	clone() {
		return new Mixture<T>(
			Object.fromEntries(
				Object.entries(this.components).map(([key, component]) => [key, component.clone()])
			) as T
		);
	}
	// iterator to iterate over components
	[Symbol.iterator]() {
		return Object.entries(this.components)[Symbol.iterator]();
	}
	get abv() {
		return (100 * this.alcoholVolume) / this.volume;
	}
	get brix() {
		return (100 * this.sugarMass) / this.mass;
	}
	get volume() {
		return this.sumComponents('volume');
	}
	get waterVolume() {
		return this.sumComponents('waterVolume');
	}
	get waterMass() {
		return this.sumComponents('waterMass');
	}
	get alcoholVolume() {
		return this.sumComponents('alcoholVolume');
	}
	get alcoholMass() {
		return this.sumComponents('alcoholMass');
	}
	get sugarVolume() {
		return this.sumComponents('sugarVolume');
	}
	get sugarMass() {
		return this.sumComponents('sugarMass');
	}
	get mass() {
		return this.sumComponents('mass');
	}

	private sumComponents(key: ComponentNumberKeys): number {
		return Object.values(this.components).reduce((sum, component) => sum + component[key], 0);
	}

	analyze(precision = 0): Target & {
		mass: number;
	} {
		return analyze(this, precision);
	}
}

function analyze(
	item: Pick<ComponentData, 'volume' | 'mass' | 'abv' | 'brix'>,
	precision = 0
): Target & {
	mass: number;
} {
	return {
		volume: round(item.volume, precision),
		mass: round(item.mass, precision),
		abv: round(item.abv, precision),
		brix: round(item.brix, precision)
	};
}

function round(value: number, precision: number) {
	const factor = 10 ** precision;
	return Math.round(value * factor) / factor;
}

export class Syrup extends Mixture<{ water: Water; sugar: Sugar }> {
	readonly type = 'syrup';
	private _volume: number;
	private _brix: number;
	constructor(volume: number, brix: number) {
		super({
			water: new Water(0),
			sugar: new Sugar(0)
		});
		this._volume = volume;
		this._brix = brix;
		this.updateComponents();
	}
	get data(): SyrupData {
		const { type, volume, brix } = this;
		return { type, volume: round(volume, 1), brix: round(brix, 1) };
	}

	serialize(): string {
		return serialize(this.data);
	}

	clone() {
		return new Syrup(this._volume, this._brix);
	}
	setVolume(volume: number) {
		this.volume = volume;
	}

	updateComponents() {
		const volume = this._volume;
		const brix = this._brix;

		// see https://www.vinolab.hr/calculator/gravity-density-sugar-conversions-en19
		const specificGravity =
			0.00000005785037196 * brix ** 3 +
			0.00001261831344 * brix ** 2 +
			0.003873042366 * brix +
			0.9999994636;

		// Calculate total mass of the solution
		const massSolution = volume * specificGravity;

		// Calculate mass of the sugar
		const massSugar = (massSolution * brix) / 100;

		// Calculate mass of the water
		const massWater = massSolution - massSugar;

		this.components.water.volume = massWater / Water.density;
		this.components.sugar.mass = massSugar;
	}

	get volume() {
		return super.volume;
	}

	set volume(volume: number) {
		this._volume = volume;
		this.updateComponents();
	}
}

function serialize(data: SpiritData | WaterData | SugarData | SyrupData): string {
	return Object.values(data)
		.map((d) => (typeof d === 'number' ? d.toFixed(0) : d))
		.join('-');
}

export class Spirit extends Mixture<{ water: Water; ethanol: Ethanol }> {
	readonly type = 'spirit';
	private _volume: number;
	private _abv: number;
	constructor(volume: number, abv: number) {
		super({
			water: new Water(0),
			ethanol: new Ethanol(0)
		});
		this._volume = volume;
		this._abv = abv;
		this.updateComponents();
	}

	get data(): SpiritData {
		const { type, volume, abv } = this;
		return { type, volume: round(volume, 1), abv: round(abv, 1) };
	}

	serialize(): string {
		return serialize(this.data);
	}

	clone() {
		return new Spirit(this._volume, this._abv);
	}

	updateComponents() {
		this.components.water.volume = this._volume * (1 - this._abv / 100);
		this.components.ethanol.volume = this._volume * (this._abv / 100);
	}

	setVolume(volume: number) {
		this.volume = volume;
	}

	get volume() {
		return super.volume;
	}

	set volume(volume: number) {
		this._volume = volume;
		this.updateComponents();
	}

	get abv() {
		return super.abv;
	}
	set abv(abv: number) {
		this._abv = abv;
		this.updateComponents();
	}
}

export interface Target {
	abv: number;
	brix: number;
	volume: number;
}

export function solve(sourceSpirit: Spirit, targetAbv: number, targetBrix: number) {
	if (targetAbv > sourceSpirit.abv) {
		throw new Error(`Target ABV (${targetAbv}) must be less than source ABV (${sourceSpirit.abv})`);
	}

	const volumeAtTargetAbv = sourceSpirit.alcoholVolume / (targetAbv / 100);

	const mixture = new Mixture({
		ethanol: sourceSpirit.components.ethanol.clone(),
		water: new Water(volumeAtTargetAbv * (1 - targetBrix / 100)),
		sugar: new Sugar(volumeAtTargetAbv * (targetBrix / 100))
	});

	const components = mixture.components;

	let error = 1;
	let iterations = 1000;
	while (error > 0.01 && --iterations > 0) {
		const dError_dAbv = (targetAbv - mixture.abv) / 100;
		const dError_dBrix = (targetBrix - mixture.brix) / 100;
		const { volume, mass } = mixture;

		// is abv is below target, we need less water
		components.water.volume -= volume * dError_dAbv;
		// if brix is below target, we need more sugar
		components.sugar.mass *= 1 + dError_dBrix;
		// if brix is below target, we need less water
		components.water.volume -= mass * dError_dBrix;

		// Ensure component volumes and mass stay within the valid range
		components.ethanol.volume = Math.min(
			sourceSpirit.alcoholVolume,
			Math.max(0, components.ethanol.volume)
		);
		components.water.volume = Math.max(0, components.water.volume);
		components.sugar.mass = Math.max(0, components.sugar.mass);

		error = Math.sqrt((mixture.abv - targetAbv) ** 2 + (mixture.brix - targetBrix) ** 2);
	}

	// now convert the volume of ethanol to an equivalent volume of spirit
	const targetSpirit = new Spirit(
		Math.round(mixture.alcoholVolume / (sourceSpirit.abv / 100)),
		sourceSpirit.abv
	);
	const targetSugar = new Sugar(mixture.sugarMass);
	const targetWater = new Water(Math.round(mixture.waterVolume - targetSpirit.waterVolume));

	const output = new Mixture({
		spirit: targetSpirit,
		sugar: targetSugar,
		water: targetWater
	});

	return {
		mixture: output,
		error,
		iterations: 1000 - iterations
	};
}
