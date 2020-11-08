export interface GuildSettings {
    prefix: string;
    disabledCommands: string[];
}
export const defaultGuildSettings = Object.freeze({
    prefix: '!',
    disabledCommands: []
} as GuildSettings);