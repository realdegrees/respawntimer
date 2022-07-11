import logger from '../../lib/logger';
import { timers } from './timer';

interface GuildSettings {
    delay: number;
}
interface SettingsStore {
    [key: string]: GuildSettings | undefined;
    'default': GuildSettings;
}

class ApplicationSettings {
    private subscriptions: {
        guildId: string;
        cb: (settings: GuildSettings) => void;
    }[] = [];

    private store: SettingsStore = {
        'default': {
            delay: 2
        }
    };
    public constructor() {
        // Do Nothing
    }
    public subscribe(guildId: string, cb: (settings: GuildSettings) => void): void {
        if (!this.subscriptions.some((s) => s.guildId === guildId)) {
            this.subscriptions.push({
                guildId,
                cb
            });
        }
        const guildSettings = this.store[guildId];
        cb(guildSettings ?? this.store['default']);
    }
    public update(guildId: string, settings: Partial<GuildSettings>): void {
        if (!this.store[guildId]) {
            this.store[guildId] = Object.assign({}, this.store['default']);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Object.assign(this.store[guildId]!, settings);
        this.subscriptions
            .filter((s) => s.guildId === guildId)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .forEach((s) => s.cb(this.store[guildId]!));
    }
    public get(guildId: string | undefined | null): GuildSettings {
        const result = this.store[guildId ?? 'default'] ?? this.store['default'];
        return result;
    }
}
export default new ApplicationSettings();