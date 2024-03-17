import { Schema, model } from 'mongoose';
import { RaidhelperSettingData } from '../common/types';
import { Voices } from '../handlers/audioManager';

export interface GuildData {
    _id: string;
    name: string;
    assistantRoleIDs: string[];
    editorRoleIDs: string[];
    voice: Voices;
    raidHelper: RaidhelperSettingData;
    notificationChannelId?: string;
    lastActivity: Date;
    widget: {
        hideButtons?: boolean;
        channelId?: string;
        messageId?: string;
    };
    customTimings?: string;
}

export const GuildModel = model<GuildData>('Guild', new Schema<GuildData>({
    _id: { type: String, required: true },
    name: { type: String, required: true },
    assistantRoleIDs: [String],
    editorRoleIDs: [String],
    voice: String,
    notificationChannelId: String,
    customTimings: String,
    lastActivity: Date,
    raidHelper: {
        enabled: Boolean,
        widget: Boolean,
        apiKey: String,
        lastManualRefresh: Date,
        apiKeyValid: Boolean,
        defaultVoiceChannelId: String,
        eventChannelId: String,
        events: [{
            id: String,
            title: String,
            startTimeUnix: Number,
            lastUpdatedUnix: Number,
            voiceChannelId: String
        }]
    },
    widget: {
        hideButtons: Boolean,
        channelId: String,
        messageId: String
    }
}));