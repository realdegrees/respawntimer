const includesArg = (arg: string): boolean => {
    return !!process.argv.find((a: string) => [arg, `-${arg}`, `--${arg}`].includes(a));
};
export const debug = ((): boolean => {
    return includesArg('debug');
})(); 

export const WARTIMER_INTERACTION_ID = 'wartimer';
export const WARTIMER_INTERACTION_SPLIT = '-';
export const WARTIMER_ICON_LINK = 'https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024';
export const EXCLAMATION_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png';
export const WARN_ICON_LINK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Icons8_flat_high_priority.svg/240px-Icons8_flat_high_priority.svg.png';
export const MAX_INACTIVE_DAYS = 31;
export const REFRESH_COOLDOWN_MS = (debug ? 0.1 : 10) * 1000 * 60;
export const MODAL_TIMEOUT = 1000 * 60 * 60; // 60 minutes
export const EPHEMERAL_REPLY_DURATION_SHORT = 1000 * 2.5;
export const EPHEMERAL_REPLY_DURATION_LONG = 1000 * 25;
export const RAIDHELPER_API_RATE_LIMIT_DAY = 800;
export const RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY = 4; // How many events will be scheduled at a time
export const RAIDHELPER_INTEGRATION_QUERY_INTERVAL_MS = (24 * 60 * 60 * 1000) / (RAIDHELPER_API_RATE_LIMIT_DAY / (RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY + 1)) + 60 * 1000;
