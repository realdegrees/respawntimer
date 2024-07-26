import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction } from 'discord.js';
import Database from '../db/database';

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
        if (!interaction.guild) return Promise.reject();

        // checks if guild exists in db, creates document if not
        return Database.getGuild(interaction.guild).then((dbGuild) => {
            if (!interaction.guild) return Promise.reject('Not a guild interaction. This should not happen.');

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
                }).catch(() => Promise.reject('Unable to fetch server members in order to complete permission check. Try again in a few minutes.'));
        });
    }
}