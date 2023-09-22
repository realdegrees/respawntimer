import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Interaction, ModalSubmitInteraction } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../../widget';
import { NotificationHandler, UPDATE_SOURCE_SERVER_ID } from '../../handlers/notificationHandler';
import { debug } from '../constant';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';

export enum EWidgetSettingsOptions {
    TOGGLE_WIDGET_BUTTONS = 'togglewidgetbuttons'
}
export class WidgetSettings extends BaseSetting<ButtonBuilder> {
    public constructor() {
        super(ESettingsID.WIDGET,
            ButtonStyle.Primary,
            'Widget Settings',
            `**Toggle Text-Widget Buttons**
            You can choose to hide the buttons below the widget if you want a clearer image for the discord overlay for example\n           `,
            ''
        );
    }

    // ! dbGuild can be an empty object here 
    public async getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const toggleWidgetButtons = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EWidgetSettingsOptions.TOGGLE_WIDGET_BUTTONS]))
            .setLabel(dbGuild.widget.hideButtons ? 'Show Buttons' : 'Hide Buttons')
            .setStyle(dbGuild.widget.hideButtons ? ButtonStyle.Success : ButtonStyle.Danger);

        const optionsRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(toggleWidgetButtons);

        return Promise.resolve([optionsRow]);
    }
    // ! dbGuild can be an empty object here 
    public async getCurrentSettings(dbGuild: DBGuild) {
        //  return Promise.resolve(`**Text Widget Buttons**\n${dbGuild.widget.hideButtons ? 'Hidden' : 'Shown'}`);
        return ''; // Don't show settings for now as the button color and text is pretty much the setting
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
            case EWidgetSettingsOptions.TOGGLE_WIDGET_BUTTONS:
                if (interaction.guild.id === UPDATE_SOURCE_SERVER_ID && !debug) return Promise.reject('This setting cannot be changed on this server.');
                dbGuild.widget.hideButtons = !dbGuild.widget.hideButtons;
                widget ? await widget.setButtonsDisplay(!dbGuild.widget.hideButtons) : await Promise.resolve();
                return ['saveGuild', 'update'];
                break;
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}