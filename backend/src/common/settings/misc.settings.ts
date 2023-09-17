import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Interaction, ModalSubmitInteraction } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../widget';
import { WidgetHandler } from '../../widgetHandler';

export enum EMiscSettingsOptions {
    CLEAR = 'clear',
    TOGGLE_WIDGET_BUTTONS = 'togglewidgetbuttons'
}

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
    public getSettingsRows() {
        const clear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.CLEAR]))
            .setLabel('Clear Saved Data')
            .setStyle(ButtonStyle.Danger);
        const toggleWidgetButtons = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.TOGGLE_WIDGET_BUTTONS]))
            .setLabel('Toggle Text-Widget Buttons')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(toggleWidgetButtons)
            .addComponents(clear);
        return Promise.resolve([row]);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCurrentSettings(guildData: DBGuild) {
        return Promise.resolve(`**Text Widget Buttons**\n${guildData.hideWidgetButtons ? 'Hidden' : 'Shown'}`);
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
                // eslint-disable-next-line no-case-declarations
                return Database.deleteGuild(interaction.guild.id)
                    .then(() => interaction.reply({ ephemeral: true, content: 'Data deleted ✅' }))
                    .then(() => logger.info('[' + interaction.guild!.name + '] Data Deleted'))
                    .then(() => {
                        if (widget && !widget.textState) {
                            WidgetHandler.removeWidgetFromMemory(widget.getId());
                            widget.update({ force: true });
                        }
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