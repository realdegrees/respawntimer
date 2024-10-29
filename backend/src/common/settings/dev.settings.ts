import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ModalSubmitInteraction } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import { Widget } from '../../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';

export enum EDevSettingsOptions {
    RELOAD_WIDGET = 'reloadwidget',
    FORCE_RATE_LIMIT = 'forceratelimit'
}

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
                await interaction.deferUpdate();
                await widget?.recreateMessage();
                return [];
            case EDevSettingsOptions.FORCE_RATE_LIMIT:
                if (!widget) {
                    await interaction.reply({ ephemeral: true, content: 'Need a widget to do that' });
                    return [];
                }
                const channel = interaction.channel?.isSendable() ? interaction.channel : undefined;
                const message = await channel?.send({
                    content: 'Rate Limit Force'
                });
                await interaction.deferUpdate();
                await Promise.all([...Array(5).keys()].map(() =>
                    message?.edit({ content: 'Rate Limit Force' })
                ));
                await message?.delete();
                return [];
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}