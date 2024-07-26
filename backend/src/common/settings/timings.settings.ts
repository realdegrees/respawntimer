import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import { Document } from 'mongoose';

export enum ETimingsSettingsOptions {
    TIMINGS = 'timings',
    RESET = 'reset'
}

export class TimingsSettings extends Setting {

    public static DEFAULT = [
        '29:40', '29:20', '29:00', '28:40', '28:20',
        '28:00', '27:40', '27:20', '27:00', '26:40',
        '26:20', '26:00', '25:40', '25:20', '24:52',
        '24:24', '23:56', '23:28', '23:00', '22:32',
        '22:04', '21:36', '21:08', '20:40', '20:12',
        '19:44', '19:08', '18:32', '17:56', '17:20',
        '16:44', '16:08', '15:32', '14:56', '14:20',
        '13:36', '12:52', '12:08', '11:24', '10:40',
        '09:56', '09:12', '08:20', '07:28', '06:36',
        '05:44', '04:52', '03:52', '02:52', '01:52',
        '00:52'];

    public async getCurrentSettings(guildData: Document<unknown, object, GuildData> & GuildData & Required<{
        _id: string;
    }>): Promise<string> {
        let timings: string[];
        let resetMessage = '';

        if (!guildData.customTimings) {
            timings = TimingsSettings.DEFAULT;
        } else if (!TimingsSettings.checkSyntax(guildData.customTimings)) {
            guildData.customTimings = undefined;
            await guildData.save()
                .then(() => {
                    resetMessage = 'The previously saved respawn timers have incorrect syntax and have been reset to default';
                })
                .catch(() => {
                    resetMessage = 'The previously saved respawn timers have incorrect syntax';
                });
            timings = TimingsSettings.DEFAULT;
        } else {
            timings = TimingsSettings.sort(guildData.customTimings);
        }
        
        const chunks = [];
        // 5 is the number of 'timers' that are shown per row
        for (let i = 0; i < timings.length; i++) {
            chunks.push(timings.slice(i, i + 5));
        }

        return `${chunks.map((chunk) => chunk.join(', ')).join('\n')}${resetMessage ? '\n' + resetMessage : ''}`;
    }

    public static checkSyntax(text: string): boolean {
        return text.split(',').every((val) => /^[0-29]?\d:[0-5]\d$/.test(val.trim()));
    }
    public static sort(text: string): string[] {
        return text.split(',').map((val) => {
            const [minutes, seconds] = val.split(':').map((str) => Number.parseInt(str));
            return {
                seconds: minutes * 60 + seconds,
                text: val
            };
        }).sort((a, b) => a.seconds - b.seconds).reverse().map((val) => val.text);
    }

    public constructor() {
        super(ESettingsID.TIMINGS);

        const customTimingsButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]),
            label: 'Set Custom Timers',
            style: ButtonStyle.Primary
        });
        const resetButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ETimingsSettingsOptions.RESET]),
            label: 'Reset Timers',
            style: ButtonStyle.Danger
        });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(customTimingsButton)
            .addComponents(resetButton);

        this.init(
            'Respawn Timers',
            `Wartimer uses a field-tested set of respawn timers.\nIf you feel like some are off and want to customize them you can do so below.`,
            'Use the reset button to go back the default timers',
            row);
    }

    public showModal(interaction: ButtonInteraction): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]))
            .setTitle('Customize Respawn Timers');
        const timingsInput = new TextInputBuilder()
            .setCustomId(this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]))
            .setLabel('Current Settings')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(TimingsSettings.DEFAULT.join(', '));
        const apiKeyRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(timingsInput);
        modal.addComponents(apiKeyRow);
        return interaction.showModal(modal);
    }
}