export const WARTIMER_INTERACTION_ID = 'wartimer';
export const WARTIMER_INTERACTION_SPLIT = '-';
export const WARTIMER_ICON_LINK = 'https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024';
export const EXCLAMATION_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png';
const includesArg = (arg: string): boolean => {
    return !!process.argv.find((a: string) => [arg, `-${arg}`, `--${arg}`].includes(a));
};
export const debug = ((): boolean => {
    return includesArg('debug');
})();