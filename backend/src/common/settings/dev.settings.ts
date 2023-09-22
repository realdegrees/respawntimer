import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, EmbedBuilder, Interaction, ModalSubmitInteraction, RateLimitError } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../../widget';
import { NotificationHandler, UPDATE_SOURCE_SERVER_ID } from '../../handlers/notificationHandler';
import { EPHEMERAL_REPLY_DURATION_LONG, EPHEMERAL_REPLY_DURATION_SHORT, EXCLAMATION_ICON_LINK, WARN_ICON_LINK, WARTIMER_ICON_LINK, debug } from '../constant';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';

export enum EDevSettingsOptions {
    RELOAD_WIDGET = 'reloadwidget',
    FORCE_RATE_LIMIT = 'forceratelimit'
}
const emptyField = {
    name: ' ',
    value: ' '
};
export class DevSettings extends BaseSetting<ButtonBuilder> {
    public constructor() {
        super(ESettingsID.DEV,
            ButtonStyle.Success,
            'Dev Settings',
            '', ''
        );
    }

    // ! dbGuild can be an empty object here 
    public async getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const reload = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EDevSettingsOptions.RELOAD_WIDGET]))
            .setLabel('Reload Widget')
            .setStyle(ButtonStyle.Danger);
        const rateLimit = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EDevSettingsOptions.FORCE_RATE_LIMIT]))
            .setLabel('Force Rate Limit')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(reload)
            .addComponents(rateLimit);

        return Promise.resolve([row]);
    }
    public async getCurrentSettings() {
        return '';
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<SettingsPostInteractAction[]> {
        if (!interaction.isButton()) return Promise.reject('Internal Error');
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        switch (option) {
            case EDevSettingsOptions.RELOAD_WIDGET:
                await widget?.recreateMessage();
                return [];
                break;
            case EDevSettingsOptions.FORCE_RATE_LIMIT:
                if (!widget) {
                    await interaction.reply({ ephemeral: true, content: 'Need a widget to do that' });
                    return [];
                }
                const message = await interaction.channel?.send({
                    content: 'Rate Limit Force'
                });
                await interaction.deferUpdate();
                await Promise.all([...Array(5).keys()].map(() =>
                    message?.edit({ content: 'Rate Limit Force' })
                ));
                await message?.delete();
                return [];
                break;
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}