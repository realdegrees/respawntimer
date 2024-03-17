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
    public execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        throw new Error('Not implemented');
    }
    /**
     * 
     * @param interaction 
     * @param permitType 
     * @returns 
     * @throws {Error}
     */
    protected async checkPermission(interaction: CommandInteraction<CacheType>, permitType: 'editor' | 'assistant'): Promise<boolean> {
        if (!interaction.guild) return Promise.reject();

        const dbGuild = await Database.getGuild(interaction.guild.id);
        const member = await interaction.guild.members.fetch(interaction.user);
        const roleIDs = permitType === 'editor' ? dbGuild.editorRoleIDs : [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs];

        return interaction.user.id === process.env['OWNER_ID'] ||
            member.permissions.has('Administrator') ||
            member.roles.cache.some((role) => roleIDs.includes(role.id));
    }
}