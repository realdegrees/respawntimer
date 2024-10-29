const includesArg = (arg: string): boolean => {
	const lowerArg = arg.toLowerCase();
	return !!process.argv.find((a: string) => [lowerArg, `-${lowerArg}`, `--${lowerArg}`].includes(a.toLowerCase()));
};
export const debug = ((): boolean => {
    return includesArg('debug') || process.env['DEBUG'] === 'true';
})(); 

export const WARTIMER_INTERACTION_ID = 'wartimer';
export const WARTIMER_INTERACTION_SPLIT = '-';
export const WARTIMER_ICON_LINK = 'https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024';
export const EXCLAMATION_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png';
export const WARN_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Icons8_flat_high_priority.svg/240px-Icons8_flat_high_priority.svg.png';
// Author: Videoplasty.com, Source: https://de.wikipedia.org/wiki/Datei:Light_Bulb_or_Idea_Flat_Icon_Vector.svg
export const BULB_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Light_Bulb_or_Idea_Flat_Icon_Vector.svg/201px-Light_Bulb_or_Idea_Flat_Icon_Vector.svg.png';
export const MAX_INACTIVE_DAYS = 31;
export const REFRESH_COOLDOWN_MS = (debug ? 0.1 : 10) * 1000 * 60;
export const MODAL_TIMEOUT = 1000 * 60 * 60; // 60 minutes
export const EPHEMERAL_REPLY_DURATION_SHORT = 1000 * 2.5;
export const EPHEMERAL_REPLY_DURATION_LONG = 1000 * 25;
export const RAIDHELPER_USER_ID = '579155972115660803';
export const WAR_START_INTERVAL = debug ? 2 : 30;
export const PRE_JOIN_BUFFER = 30;
export const WAR_START_TIMES_MINUTES = debug ? [0, 30] : Array.from({ length: 59 }, (_, i) => i + 1);
export const POLL_INTERVAL_MINUTES = debug ? 1 : 8;
export const GRACE_PERIOD_MINUTES = WAR_START_INTERVAL / 2; // Amount of time that events are checked in the past (e.g. if raidhelper is set to pre-war meeting time)
export const PROGRESS_BAR_SETTINGS = {
	barWidth: 20,
	barIconFull: '●',
	barIconEmpty: '○'
};
// Alternative icons you could use:
// 1. Block characters
// barIconFull: '▓',
// barIconEmpty: '░'

// 6. Circles
// barIconFull: '●',
// barIconEmpty: '○'

// 7. Squares
// barIconFull: '▰',
// barIconEmpty: '▱'
