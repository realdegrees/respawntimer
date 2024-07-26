import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Interaction, ModalSubmitInteraction } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../widget';
import { WidgetHandler } from '../../widgetHandler';
import { UPDATE_SOURCE_SERVER_ID } from '../../notificationHandler';
import { debug } from '../constant';

export enum EMiscSettingsOptions {
    CLEAR = 'clear',
    CLEAR_CONFIRM = 'clearconfirm',
    TOGGLE_WIDGET_BUTTONS = 'togglewidgetbuttons'
}
const usersWaitingForClearConfirm: string[] = [];
export class MiscSettings extends BaseSetting<ButtonBuilder> {
    public constructor() {
        super(ESettingsID.MISC,
            'Misc Settings',
            `**Toggle Text-Widget Buttons**
            You can choose to hide the buttons below the widget if you want a clearer image for the discord overlay for example\n
            **Clear Saved Data**  
            Removes everything that is saved in the Wartimer database for this discord. *This will unlink any existing widgets.  
            In order for any future settings to affect that widget you will need to press one of its buttons for it to get linked again!*`,
            '',
            ButtonStyle.Secondary
        );
    }

    // ! dbGuild can be an empty object here 
    public async getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const clear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.CLEAR]))
            .setLabel('Clear Saved Data')
            .setStyle(ButtonStyle.Danger);

        if (!!usersWaitingForClearConfirm.find((userId) => userId === interaction.user.id) || !(await Database.hasGuild(dbGuild.id))) {
            clear.setDisabled(true);
        }
        const confirmClear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.CLEAR_CONFIRM]))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success);
        const toggleWidgetButtons = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.TOGGLE_WIDGET_BUTTONS]))
            .setLabel('Toggle Text-Widget Buttons')
            .setStyle(ButtonStyle.Primary);

        const optionsRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(toggleWidgetButtons);
        const delRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(clear);

        if (!!usersWaitingForClearConfirm.find((userId) => userId === interaction.user.id)) {
            delRow.addComponents(confirmClear);
        }
        return Promise.resolve([optionsRow, delRow]);
    }
    // ! dbGuild can be an empty object here 
    public async getCurrentSettings(dbGuild: DBGuild) {
        return Promise.resolve(`**Text Widget Buttons**\n${dbGuild.hideWidgetButtons ? 'Hidden' : 'Shown'}`);
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<unknown> {
        if (!interaction.isButton()) return Promise.reject('Internal Error');
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        switch (option) {
            case EMiscSettingsOptions.CLEAR:
                usersWaitingForClearConfirm.push(interaction.user.id);
                return this.send(interaction, dbGuild, { update: true });
            case EMiscSettingsOptions.CLEAR_CONFIRM:
                if (interaction.guild.id === UPDATE_SOURCE_SERVER_ID && !debug) return Promise.reject('Data cannot be deleted on this server.');
                return Database.deleteGuild(interaction.guild.id)
                    .then(() => logger.info('[' + interaction.guild!.name + '] Data Deleted'))
                    .then(async () => {
                        const userWaitingForClearIndex = usersWaitingForClearConfirm.findIndex((userId) => userId === interaction.user.id);
                        if (userWaitingForClearIndex !== -1) {
                            usersWaitingForClearConfirm.splice(userWaitingForClearIndex, 1);
                        }

                        return this.send(interaction, {} as DBGuild, { update: true }).then(() => {
                            if (widget && !widget.textState) {
                                WidgetHandler.removeWidgetFromMemory(widget.getId());
                                return widget.update({ force: true });
                            }
                        });
                    });
            case EMiscSettingsOptions.TOGGLE_WIDGET_BUTTONS:
                dbGuild.hideWidgetButtons = !dbGuild.hideWidgetButtons;
                return dbGuild.save().then(() => this.send(interaction, dbGuild, { update: true }))
                    .then(async () => {
                        return widget ? widget.setButtonsDisplay(!dbGuild.hideWidgetButtons) : Promise.resolve();
                    });
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}