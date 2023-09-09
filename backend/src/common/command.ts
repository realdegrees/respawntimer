import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction } from 'discord.js';
import { default as DBGuild } from '../db/guild.schema';

export class Command {
    public constructor(
        public name: string,
        protected description: string,
        protected client: Client,
        protected subCommand?: Command) {
    }
    public build(): RESTPostAPIApplicationCommandsJSONBody {
        throw new Error('Not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        throw new Error('Not implemented');
    }
    // eslint-disable-next-line max-len
    protected async checkPermission(interaction: CommandInteraction<CacheType>, permitType: 'editor' | 'assistant'): Promise<boolean> {
        if (!interaction.guild) {
            return Promise.reject();
        }
        // checks if guild exists in db, creates document if not
        const dbGuild = await DBGuild.findById(interaction.guild.id).then((obj) => obj ?? new DBGuild({
            _id: interaction.guild?.id,
            name: interaction.guild?.name,
            assistantRoleIDs: [],
            editorRoleIDs: [],
            voice: 'female'
        }).save());
        // eslint-disable-next-line max-len
        const roleIDs = permitType === 'editor' ? dbGuild.editorRoleIDs : [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs];
        return interaction.guild.members.fetch(interaction.user)
            .then((member) => {
                if (
                    !member.permissions.has('Administrator') &&
                    !member.roles.cache.some((role) => roleIDs.includes(role.id))
                ) {
                    // eslint-disable-next-line max-len
                    return Promise.reject('You must have ' + permitType + ' permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
                } else {
                    return true;
                }
            });
    }
}