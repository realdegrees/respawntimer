import { RaidhelperEvent } from './raidhelperEvent';

export interface RaidhelperSettingData {
    enabled: boolean;
    widget?: boolean;
    apiKey?: string;
    defaultVoiceChannelId?: string;
    eventChannelId?: string;
    events: RaidhelperEvent[];
}