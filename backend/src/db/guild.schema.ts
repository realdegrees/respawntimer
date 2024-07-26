import { Schema, model } from 'mongoose';
export interface Guild {
    _id: string;
    name: string;
    assistantRoleIDs: string[];
    editorRoleIDs: string[];
}
const guildSchema = new Schema<Guild>({
    _id: {type: String, required: true},
    name: {type: String, required: true},
    assistantRoleIDs: [String],
    editorRoleIDs: [String]
});
export default model<Guild>('Guild', guildSchema);