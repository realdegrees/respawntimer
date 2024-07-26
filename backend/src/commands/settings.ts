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
    public async execute(interaction: CommandInteraction<CacheType>, dbGuild: DBGuild): Promise<void> {
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
