import { Document } from 'mongoose';
import { GuildData } from '../../db/guild.schema';

export type DBGuild = Document<unknown, object, GuildData> & GuildData & Required<{
    _id: string;
}>;