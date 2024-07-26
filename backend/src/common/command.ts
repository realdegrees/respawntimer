import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction } from 'discord.js';
import { getGuild } from '../db/guild.schema';

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
    public execute(interaction: CommandInteraction<CacheType>): Promise<unknown> {
        throw new Error('Not implemented');
    }
    // eslint-disable-next-line max-len
    protected async checkPermission(interaction: CommandInteraction<CacheType>, permitType: 'editor' | 'assistant'): Promise<boolean> {
        if (!interaction.guild) {
            return Promise.reject();
        }
        // checks if guild exists in db, creates document if not
        const dbGuild = await getGuild(interaction.guild);
        // eslint-disable-next-line max-len
        const roleIDs = permitType === 'editor' ? dbGuild.editorRoleIDs : [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs];
        return interaction.user.id === process.env['OWNER_ID'] || interaction.guild.members.fetch(interaction.user)
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