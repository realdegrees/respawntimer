import { FilterQuery, Schema, model } from 'mongoose';
import { RaidhelperSettingData } from '../common/types';
import { Document } from 'mongoose';
import { Guild } from 'discord.js';
import { Voices } from '../util/audioManager';

export interface GuildData {
    _id: string;
    name: string;
    assistantRoleIDs: string[];
    editorRoleIDs: string[];
    voice: Voices;
    raidHelper: RaidhelperSettingData;
    notificationChannelId?: string;
    lastActivityTimestamp?: number;
    hideWidgetButtons?: boolean;
    widget: {
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
    lastActivityTimestamp: Number,
    hideWidgetButtons: Boolean,
    raidHelper: {
        enabled: Boolean,
        apiKey: String,
        defaultVoiceChannelId: String,
        eventChannelId: String,
        events: [{
            id: String,
            title: String,
            startTime: Number,
            voiceChannelId: String
        }]
    },
    widget: {
        channelId: String,
        messageId: String
    }
}));
export const getGuild = async (guild: Guild): Promise<Document<unknown, object, GuildData> & GuildData & Required<{ _id: string }>> => {
    return GuildModel.findById(guild.id).then((obj) => {
        if (obj) {
            obj.lastActivityTimestamp = Date.now();
            obj.name = guild.name;
            return obj;
        } else {
            return new GuildModel({
                _id: guild.id,
                name: guild.name,
                assistantRoleIDs: [],
                editorRoleIDs: [],
                voice: 'female',
                lastActivityTimestamp: Date.now(),
                raidHelper: {
                    enabled: false,
                    events: []
                },
                widget: {}
            });
        }
    }).then((obj) => obj.save());
};

export const deleteGuild = async (guildId: string): Promise<void> => {
    return GuildModel.deleteOne({
        _id: guildId
    }).then();
};
export const getAllGuilds = async (): Promise<(Document<unknown, object, GuildData> & GuildData & Required<{
    _id: string;
}>)[]> => {
    return GuildModel.find({}).exec();
};
export const queryGuilds = async (filter: FilterQuery<GuildData>): Promise<(Document<unknown, object, GuildData> & GuildData & Required<{
    _id: string;
}>)[]> => {
    return GuildModel.find(filter).exec();
};

