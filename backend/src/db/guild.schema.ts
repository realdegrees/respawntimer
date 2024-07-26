import { Schema, model } from 'mongoose';
import { string } from 'yargs';
import { Voices } from '../common/types';
export interface Guild {
    _id: string;
    name: string;
    assistantRoleIDs: string[];
    editorRoleIDs: string[];
    voice: Voices;
}
const guildSchema = new Schema<Guild>({
    _id: {type: String, required: true},
    name: {type: String, required: true},
    assistantRoleIDs: [String],
    editorRoleIDs: [String],
    voice: String
});
export default model<Guild>('Guild', guildSchema);