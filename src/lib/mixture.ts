import { isEthanolData, isSweetenerData, isMixtureData, isWaterData } from './components/index.js';
import {
	BaseComponent,
	type MixtureData,
	type Component,
	type ComponentNumberKeys
} from './components/index.js';
import { Ethanol } from './components/ethanol.js';
import { Sweetener } from './components/sweetener.js';
import { Water } from './components/water.js';
import { solver } from './solver.js';
import { brixToSyrupProportion, format } from './utils.js';
import type { StoredMixtureData } from './components/index.js';
import { nanoid } from 'nanoid';

export type AnyComponent = Water | Sweetener | Ethanol | Mixture;

export type MixtureComponent = { name: string; id: string; component: AnyComponent };

type Submixture = {
	name: string;
	id: string;
	component: Mixture;
};

function isSubmixture(mixture: MixtureComponent): mixture is Submixture {
	return mixture.component instanceof Mixture;
}

/**
 * Converts stored mixture data back into a Mixture instance.
 * The stored data uses ReadonlyJSONValue for compatibility with storage,
 * so we need to validate and convert it back to proper component types.
 */
export function dataToMixture(d: StoredMixtureData): Mixture {
	const ingredients: MixtureComponent[] = [];
	for (const component of d.components) {
		const { name, data } = component;
		if (isEthanolData(data)) {
			ingredients.push({ name, id: componentId(), component: new Ethanol(data.volume) });
		} else if (isWaterData(data)) {
			ingredients.push({ name, id: componentId(), component: new Water(data.volume) });
		} else if (isSweetenerData(data)) {
			ingredients.push({
				name,
				id: componentId(),
				component: new Sweetener(data.subType, data.mass)
			});
		} else if (isMixtureData(data)) {
			ingredients.push({
				name,
				id: componentId(),
				component: dataToMixture(data)
			});
		} else {
			throw new Error('Unknown mixture type');
		}
	}
	return new Mixture(ingredients);
}

export function getLabel(component: AnyComponent) {
	if (component instanceof Water) {
		return 'water';
	}
	if (component instanceof Sweetener) {
		return 'sweetener';
	}
	if (component instanceof Ethanol) {
		return 'ethanol';
	}
	if (component instanceof Mixture) {
		if (isSpirit(component)) return 'spirit';
		if (isSyrup(component)) return 'simple syrup';
		if (isLiqueur(component)) return 'liqueur';
		return 'mixture';
	}
	throw new Error('Unknown component type');
}

export class Mixture extends BaseComponent {
	constructor(readonly components: MixtureComponent[] = []) {
		super();
	}

	describe(): string {
		if (isSyrup(this)) {
			const sweetener = this.findByType((x) => x instanceof Sweetener);
			const summary = [
				brixToSyrupProportion(this.brix),
				`${sweetener?.subType === 'sucrose' ? 'simple syrup' : `${sweetener?.subType} syrup`}`
			];
			return summary.join(' ');
		}
		if (isSpirit(this)) {
			return `spirit`;
		}
		if (isLiqueur(this)) {
			return `${format(this.proof, { unit: 'proof' })} ${format(this.brix, { unit: 'brix' })} liqueur`;
		}
		return this.components.map(({ component }) => component.describe()).join(', ');
	}

	get type() {
		return 'mixture' as const;
	}

	get data(): MixtureData {
		return {
			type: this.type,
			components: this.components.map(({ name, id, component }) => ({
				name,
				id,
				data: component.data
			}))
		};
	}

	set data(data: MixtureData) {
		const mx = dataToMixture(data);
		this.components.splice(0, this.components.length, ...mx.components);
	}

	clone(newIds = false): Mixture {
		return new Mixture(
			this.components.map((item) => ({
				name: item.name,
				id: newIds ? componentId() : item.id,
				component: item.component.clone()
			}))
		);
	}

	get componentObjects() {
		return this.components.map(({ component }) => component);
	}

	*eachComponentAndSubmixture(): IterableIterator<MixtureComponent> {
		for (const component of this.components) {
			yield component;
		}
		for (const component of this.components) {
			if (isSubmixture(component)) {
				yield* component.component.eachComponentAndSubmixture();
			}
		}
	}

	findComponent(predicate: (component: AnyComponent) => boolean): AnyComponent | undefined {
		return this.components.find(({ component }) => predicate(component))?.component;
	}

	findByType<X extends Component>(is: (x: unknown) => x is X): X | undefined {
		return this.components.find(({ component }) => is(component))?.component as X | undefined;
	}

	addComponent({ name, component, id }: { name: string; id: string; component: AnyComponent }) {
		if (component instanceof Mixture) {
			this.components.push({
				id,
				name,
				component: component.clone(true)
			});
		} else {
			this.components.push({ id, name, component: component.clone() });
		}
	}

	removeComponent(id: string) {
		const index = this.components.findIndex((c) => c.id === id);
		if (index >= 0) {
			this.components.splice(index, 1);
			return true;
		}

		for (const component of this.components) {
			if (component.component instanceof Mixture) {
				if (component.component.removeComponent(id)) return true;
			}
		}
		return false;
	}

	canEdit(key: ComponentNumberKeys | string): boolean {
		if (key === 'brix') {
			return this.components.some(({ component }) => component.canEdit('equivalentSugarMass'));
		}
		if (key === 'abv') {
			const hasEthanol = this.components.some(({ component }) => component instanceof Ethanol);
			if (hasEthanol) return true;
		}

		return this.components.some(({ component }) => component.canEdit(key));
	}

	get abv() {
		return (100 * this.alcoholVolume) / this.volume;
	}
	setAbv(targetAbv: number, maintainVolume = false) {
		if (targetAbv === this.abv) return;
		const working = solver(this, {
			abv: targetAbv,
			brix: this.brix,
			volume: maintainVolume ? this.volume : null
		});
		for (const [i, obj] of this.componentObjects.entries()) {
			obj.data = working.componentObjects[i].data;
		}
	}
	get volume() {
		return this.sumComponents('volume');
	}
	setVolume(newVolume: number) {
		const originalVolume = this.volume;
		if (isClose(originalVolume, newVolume, 0.001)) return;
		// ensure we don't go to zero volume otherwise we lose the
		// proportions of the components. Set a value that rounds to 0.
		const factor = Math.max(0.004999, newVolume) / originalVolume;
		for (const { component } of this.components) {
			component.setVolume(component.volume * factor);
		}
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

	adjustVolumeForEthanolTarget(targetEthanolVolume: number) {
		const currentAlcoholVolume = this.alcoholVolume;
		if (isClose(currentAlcoholVolume, targetEthanolVolume)) return;
		const factor = targetEthanolVolume / currentAlcoholVolume;
		for (const { component } of this.components) {
			if (component.abv > 0) {
				component.setVolume(component.volume * factor);
			}
		}
	}

	get brix() {
		return (100 * this.equivalentSugarMass) / this.mass;
	}
	setBrix(newBrix: number, maintainVolume = false) {
		if (isClose(newBrix, this.brix)) return;
		// change the ratio of sweetener to total mass
		const working = solver(this, {
			abv: this.abv,
			brix: newBrix,
			volume: maintainVolume ? this.volume : null
		});
		for (const [i, obj] of this.componentObjects.entries()) {
			obj.data = working.componentObjects[i].data;
		}
	}

	get equivalentSugarMass() {
		return this.sumComponents('equivalentSugarMass');
	}
	setEquivalentSugarMass(newSugarEquivalent: number) {
		const currentSugarEquivalent = this.equivalentSugarMass;
		if (isClose(currentSugarEquivalent, newSugarEquivalent)) return;

		const factor = newSugarEquivalent / currentSugarEquivalent;
		for (const { component } of this.components) {
			if (component.brix > 0) {
				component.setVolume(component.volume * factor);
			}
		}
	}
	get mass() {
		return this.sumComponents('mass');
	}

	get kcal() {
		return this.sumComponents('kcal');
	}

	private sumComponents(key: ComponentNumberKeys | 'kcal', components = this.components): number {
		return components.reduce((sum, { component }) => sum + component[key], 0);
	}

	get isValid(): boolean {
		return this.components.every(({ component }) => component.isValid);
	}

	/**
	 * Get data in a format compatible with storage (ReadonlyJSONValue)
	 */
	toStorageData(): StoredMixtureData {
		return {
			type: 'mixture',
			components: this.components.map(({ name, id, component }) => ({
				name,
				id,
				data: {
					...(component instanceof Mixture ? component.toStorageData() : component.data)
				}
			}))
		};
	}
}

export function componentId(): string {
	// return a random string
	return nanoid(12);
}

function isClose(a: number, b: number, delta = 0.01) {
	return Math.abs(a - b) < delta;
}

export function newSpirit(volume: number, abv: number): Mixture {
	const mx = new Mixture([
		{ name: 'ethanol', id: 'ethanol', component: new Ethanol(1) },
		{ name: 'water', id: 'water', component: new Water(1) }
	]);
	mx.setVolume(volume);
	mx.setAbv(abv, true);
	return mx;
}

export function newSyrup(volume: number, brix: number): Mixture {
	const mx = new Mixture([
		{ name: 'sugar', id: 'sugar', component: new Sweetener('sucrose', 1) },
		{ name: 'water', id: 'water', component: new Water(1) }
	]);
	mx.setVolume(volume);
	mx.setBrix(brix, true);
	return mx;
}

export function isSpirit(thing: Mixture): boolean;
export function isSpirit(thing: AnyComponent): thing is Mixture;
export function isSpirit(thing: AnyComponent) {
	return Boolean(thing instanceof Mixture && thing.abv > 0 && thing.brix === 0);
}

export function isSimpleSpirit(thing: Mixture): boolean;
export function isSimpleSpirit(thing: AnyComponent): thing is Mixture;
export function isSimpleSpirit(thing: AnyComponent) {
	return Boolean(
		isSpirit(thing) &&
			thing.components.length === 2 &&
			thing.findByType((x) => x instanceof Ethanol) &&
			thing.findByType((x) => x instanceof Water)
	);
}

export function isSyrup(thing: Mixture): boolean;
export function isSyrup(thing: AnyComponent): thing is Mixture;
export function isSyrup(thing: AnyComponent) {
	return Boolean(
		thing instanceof Mixture &&
			thing.abv === 0 &&
			thing.brix > 0 &&
			thing.findByType((x) => x instanceof Water)
	);
}

export function isSimpleSyrup(thing: Mixture): boolean;
export function isSimpleSyrup(thing: AnyComponent): thing is Mixture;
export function isSimpleSyrup(thing: AnyComponent) {
	// simple syrup is a mixture of sweetener and water
	return Boolean(
		isSyrup(thing) &&
			thing.components.length === 2 &&
			thing.findByType((x) => x instanceof Sweetener)
	);
}

export function isLiqueur(thing: Mixture): boolean;
export function isLiqueur(thing: AnyComponent): thing is Mixture;
export function isLiqueur(thing: AnyComponent) {
	return thing instanceof Mixture && thing.abv > 0 && thing.brix > 0;
}

/**
 * Describes a component in a human-readable format.
 * @param thing - The component to describe.
 * @returns A human-readable description of the component.
 */
export function describe(thing: AnyComponent): string {
	if (thing instanceof Mixture) {
		return thing.describe();
	}
	if (thing instanceof Water) {
		return `${format(thing.volume, { unit: 'ml' })} water`;
	}
	if (thing instanceof Sweetener) {
		return `${format(thing.mass, { unit: 'g' })} ${thing.subType}`;
	}
	if (thing instanceof Ethanol) {
		return `${format(thing.volume, { unit: 'ml' })} ethanol`;
	}
	return '???';
}
