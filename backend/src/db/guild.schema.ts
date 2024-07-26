import { Schema, model } from 'mongoose';
import { RaidhelperSettingData, Voices } from '../common/types';
import { Document } from 'mongoose';
import { Guild } from 'discord.js';

export interface GuildData {
    _id: string;
    name: string;
    assistantRoleIDs: string[];
    editorRoleIDs: string[];
    voice: Voices;
    raidHelper: RaidhelperSettingData;
}

export const DBGuild = model<GuildData>('Guild', new Schema<GuildData>({
    _id: { type: String, required: true },
    name: { type: String, required: true },
    assistantRoleIDs: [String],
    editorRoleIDs: [String],
    voice: String,
    raidHelper: {
        enabled: Boolean,
        apiKey: String,
        defaultVoiceChannelId: String,
        events: [{
            id: String,
            title: String,
            startTime: Number
        }]
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
            }
        }).save());
};

