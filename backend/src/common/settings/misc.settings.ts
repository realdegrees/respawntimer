import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';

export enum EMiscSettingsOptions {
    CLEAR = 'clear'
}

export class MiscSettings extends Setting {
    public constructor() {
        super(ESettingsID.MISC, ButtonStyle.Secondary);
        const clear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EMiscSettingsOptions.CLEAR]))
            .setLabel('Clear Saved Data')
            .setStyle(ButtonStyle.Danger);

        const clearRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(clear);

        this.init(
            'Misc Settings',
            `**Clear Saved Data**  
            Removes everything that is saved in the Wartimer database for this discord`,
            '',
            clearRow
        );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCurrentSettings(guildData: GuildData, guild?: Guild | undefined): Promise<string> {
        return Promise.resolve('');
    }

}