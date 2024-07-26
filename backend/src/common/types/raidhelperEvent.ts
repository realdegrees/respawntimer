export interface ScheduledEvent {
    id: string;
    title: string;
    startTimeUnix: number;
    lastUpdatedUnix: number;
    voiceChannelId?: string;
}
export interface RaidhelperAPIEvent {
    id: string;
    startTime:number;
    channelId: string;
    advancedSettings: {
        voice_channel?: string;
    };
    title: string;
    lastUpdated: number;
}