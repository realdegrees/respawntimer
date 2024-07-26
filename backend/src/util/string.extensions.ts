/* eslint-disable @typescript-eslint/no-unused-vars */
interface String {
	toPascalCase(min?: number, minExceptions?: string[]): string;
}

String.prototype.toPascalCase = function (min: number = 1, minExceptions?: string[]): string {
	const str = this.toString();
	if (str.length === 0) {
		return str;
	} else if (
		str.length <= min &&
		minExceptions?.find((e) => e.localeCompare(str, undefined, { sensitivity: 'base' }))
	) {
		return str.toUpperCase();
	} else {
		return str
			.split(' ')
			.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
			.join(' ');
	}
};
