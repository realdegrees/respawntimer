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
    widget: {
        channelId?: string;
        messageId?: string;
    };
}

export const DBGuild = model<GuildData>('Guild', new Schema<GuildData>({
    _id: { type: String, required: true },
    name: { type: String, required: true },
    assistantRoleIDs: [String],
    editorRoleIDs: [String],
    voice: String,
    notificationChannelId: String,
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
    return DBGuild.findById(guild.id).then((obj) => obj ?? new DBGuild({
        _id: guild.id,
        name: guild.name,
        assistantRoleIDs: [],
        editorRoleIDs: [],
        voice: 'female',
        raidHelper: {
            enabled: false,
            events: []
        },
        widget: {}
    }).save());
};

export const deleteGuild = async (guild: Guild): Promise<void> => {
    return DBGuild.deleteOne({
        _id: guild.id
    }).then();
};
export const getAllGuilds = async (): Promise<(Document<unknown, object, GuildData> & GuildData & Required<{
    _id: string;
}>)[]> => {
    return DBGuild.find({}).exec();
};
export const queryGuilds = async (filter: FilterQuery<GuildData>): Promise<(Document<unknown, object, GuildData> & GuildData & Required<{
    _id: string;
}>)[]> => {
    return DBGuild.find(filter).exec();
};
