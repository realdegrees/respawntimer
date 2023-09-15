import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ESettingsID, Setting } from './settings';
import { DBGuild } from '../types/dbGuild';

export enum EMiscSettingsOptions {
    CLEAR = 'clear',
    TOGGLE_WIDGET_BUTTONS = 'togglewidgetbuttons'
}

export class MiscSettings extends Setting {
    public constructor() {
        super(ESettingsID.MISC, ButtonStyle.Secondary);
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

        this.init(
            'Misc Settings',
            `**Toggle Text-Widget Buttons**
            You can choose to hide the buttons below the widget if you want a clearer image for the discord overlay for example\n
            **Clear Saved Data**  
            Removes everything that is saved in the Wartimer database for this discord. *This will unlink any existing widgets.  
            In order for any future settings to affect that widget you will need to press one of its buttons for it to get linked again!*`,
            '',
            row
        );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCurrentSettings(guildData: DBGuild): Promise<string> {
        return Promise.resolve(`**Text Widget Buttons**\n${guildData.hideWidgetButtons ? 'Hidden' : 'Shown'}`);
    }

}