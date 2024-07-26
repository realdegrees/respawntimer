/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { Command } from './command';
import {
    CacheType,
    Client,
    CommandInteraction,
} from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import { SettingsHandler } from '../handlers/settingsHandler';
import { userHasRole } from '../util/permissions';
import Database from '../db/database';


export class Settings extends Command {
    public constructor(protected client: Client) {
        super('settings', 'Opens the settings', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDMPermission(false)
            .toJSON();
    }
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        if (!interaction.guild) {
            throw new Error('This command can only be run on a server.');
        }
        const dbGuild = await Database.getGuild(interaction.guild.id);
        const hasPermission = await userHasRole(
            interaction.guild!,
            interaction.user,
            dbGuild.editorRoleIDs);

        if (!hasPermission) {
            return dbGuild.editorRoleIDs.length === 0 ?
                Promise.reject('Editor permissions have not been set up yet!\nPlease ask someone with administrator permissions to add editor roles in the settings.') :
                Promise.reject('You do not have editor permissions.');
        } else {
            await SettingsHandler.openSettings(interaction);
        }
    }
}
