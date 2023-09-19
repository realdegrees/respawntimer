/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { Command } from './command';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    CacheType,
    Client,
    CommandInteraction,
    ComponentType,
    EmbedBuilder
} from 'discord.js';
import { PermissionSettings } from '../common/settings/permissions.settings';
import { VoiceSettings } from '../common/settings/voice.settings';
import { RaidhelperSettings } from '../common/settings/raidhelper.settings';
import { EXCLAMATION_ICON_LINK, WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../common/constant';
import { EInteractionType } from '../common/types/interactionType';
import { MiscSettings } from '../common/settings/misc.settings';
import { NotificationSettings } from '../common/settings/notifications.settings';
import logger from '../../lib/logger';
import { TimingsSettings } from '../common/settings/timings.settings';
import { InteractionHandler } from '../handlers/interactionHandler';
import { DBGuild } from '../common/types/dbGuild';
import { SettingsHandler } from '../handlers/settingsHandler';


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
    public async execute(interaction: CommandInteraction<CacheType>, dbGuild: DBGuild): Promise<unknown> {
        return InteractionHandler.checkPermission(
            interaction.guild!,
            interaction.user,
            dbGuild.editorRoleIDs
        ).then(async (perm) => {
            if (!perm) {
                return dbGuild.editorRoleIDs.length === 0 ?
                    Promise.reject('Editor permissions have not been set up yet!\nPlease ask someone with administrator permissions to add editor roles in the settings.') :
                    Promise.reject('You do not have editor permissions.');
            } else {
                return SettingsHandler.openSettings(interaction);
            }
        }).catch((reason) => {
            return interaction.reply({ ephemeral: true, content: reason?.toString?.() || 'Unkown Error' })
        }).catch(logger.error);
    }
}
