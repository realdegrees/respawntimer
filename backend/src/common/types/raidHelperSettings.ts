import { ScheduledEvent } from './raidhelperEvent';

export interface RaidhelperSettingData {
    enabled?: boolean;
    widget?: boolean;
    apiKey?: string;
    defaultVoiceChannelId?: string;
    eventChannelId?: string;
    events: ScheduledEvent[];
}