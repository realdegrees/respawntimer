import { RaidhelperEvent } from './raidhelperEvent';

export interface RaidhelperSettingData {
    enabled: boolean;
    apiKey?: string;
    defaultVoiceChannelId?: string;
    events: RaidhelperEvent[];
}