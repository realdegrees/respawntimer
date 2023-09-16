export interface ScheduledEvent {
    id: string;
    title: string;
    startTime: number;
    voiceChannelId: string;
}
export interface RaidhelperAPIEvent {
    id: string;
    startTime:number;
    advancedSettings: {
        voice_channel: string;
    };
    title: string;
}