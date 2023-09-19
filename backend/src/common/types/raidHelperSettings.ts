import { ScheduledEvent } from './raidhelperEvent';

export interface RaidhelperSettingData {
    enabled?: boolean;
    widget?: boolean;
    apiKey?: string;
    apiKeyValid?: boolean;
    lastManualRefresh?: Date;
    defaultVoiceChannelId?: string;
    eventChannelId?: string;
    events: ScheduledEvent[];
}