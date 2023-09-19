import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, Guild, Interaction, ModalBuilder, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import { WarInfo } from '../types';
import { clamp } from '../../util/util.generic';
import { string } from 'yargs';
import textManager from '../../util/textManager';
import audioManager from '../../util/audioManager';
import logger from '../../../lib/logger';
import { Widget } from '../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';

export enum ETimingsSettingsOptions {
    TIMINGS = 'timings',
    RESET = 'reset'
}

export class TimingsSettings extends BaseSetting<ButtonBuilder> {
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

    public constructor() {
        super(ESettingsID.TIMINGS,
            'Respawn Timers',
            `Wartimer uses a field-tested set of respawn timers.\nIf you feel like some are off and want to customize them you can do so below.`,
            'Use the reset button to go back the default timers');
    }
    public getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const customTimingsButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]),
            label: 'Set Custom Timers',
            style: ButtonStyle.Primary
        });
        const resetButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ETimingsSettingsOptions.RESET]),
            label: 'Reset',
            style: ButtonStyle.Danger
        });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(customTimingsButton);

        if (dbGuild.customTimings) {
            row.addComponents(resetButton);
        }

        return Promise.resolve([row]);

    }
    public async getCurrentSettings(guildData: DBGuild) {
        let timings: string[];
        let resetMessage = '';

        if (!guildData.customTimings) {
            timings = TimingsSettings.DEFAULT;
        } else if (!TimingsSettings.checkSyntax(guildData.customTimings)[0]) {
            guildData.customTimings = undefined;
            await guildData.save()
                .then(() => {
                    resetMessage = 'The saved respawn timers had invalid entries and have been reset to default';
                })
                .catch(() => {
                    resetMessage = 'The saved respawn timers have invalid entries';
                });
            timings = TimingsSettings.DEFAULT;
        } else {
            timings = TimingsSettings.sort(guildData.customTimings);
        }

        const chunks: string[][] = [];
        // 5 is the number of 'timers' that are shown per row
        for (let i = 0; i < timings.length; i += 4) {
            chunks.push(timings.slice(i, i + 4).map((v) => v.trim()));
        }

        return `${chunks.map((chunk) => `\`\`\`brainfuck\n${chunk.map((val) =>
            !TimingsSettings.DEFAULT.includes(val) ? `[${val}]` : val)
            .join(' > ')}\`\`\``)
            .join('')}${resetMessage ? '\n' + resetMessage : ''}`;
    }
    public showModal(interaction: ButtonInteraction, timings?: string) {
        const modal = new ModalBuilder()
            .setCustomId(this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]))
            .setTitle('Customize Respawn Timers');
        const timingsInput = new TextInputBuilder()
            .setCustomId(this.getCustomId(this.id, [ETimingsSettingsOptions.TIMINGS]))
            .setLabel('Current Settings')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(timings ? TimingsSettings.sort(timings).join(', ') : [...TimingsSettings.DEFAULT].sort().reverse().join(', '));
        const apiKeyRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(timingsInput);
        modal.addComponents(apiKeyRow);
        return interaction.showModal(modal);
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: Interaction,
        widget: Widget | undefined,
        option: string
    ): Promise<SettingsPostInteractAction[]> {
        switch (option) {
            case ETimingsSettingsOptions.TIMINGS:
                if (!interaction.isButton()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                await this.showModal(interaction, dbGuild.customTimings);
                const modalInteraction = await interaction.awaitModalSubmit({ time: 1000 * 60 * 2 });
                const timings = modalInteraction.fields
                    .getTextInputValue(
                        this.getCustomId(
                            ESettingsID.TIMINGS,
                            [ETimingsSettingsOptions.TIMINGS]
                        ));
                const [validSyntax, reason] = TimingsSettings.checkSyntax(timings);
                if (!validSyntax) {
                    await modalInteraction.reply({ ephemeral: true, content: reason })
                        .then(() => setTimeout(1000 * 20))
                        .then(() => interaction.deleteReply())
                        .catch(logger.error);
                    return [];
                };
                if (TimingsSettings.equalsDefault(timings)) {
                    // No need to save if the settings are default
                    await modalInteraction.deferUpdate();
                    return [];
                }
                // remove duplicates and trim spaces
                dbGuild.customTimings = TimingsSettings.sort(timings).join(',');
                audioManager.setTimings(dbGuild.id, timings);
                textManager.setTimings(dbGuild.id, timings);
                await modalInteraction.deferUpdate();
                return ['saveGuild', 'update'];
                break;
            case ETimingsSettingsOptions.RESET:
                if (!interaction.isButton()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                dbGuild.customTimings = undefined;
                audioManager.resetTimings(dbGuild.id);
                textManager.resetTimings(dbGuild.id);
                return ['saveGuild', 'update'];
                break;
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }

    public static checkSyntax(text: string): [boolean, string];
    public static checkSyntax(text: string[]): [boolean, string];
    public static checkSyntax(text: string[] | string): [boolean, string] {
        const list = Array.isArray(text) ? text : text.split(',');
        const invalid = list.find((val) => !/^[0-2]?\d:[0-5]\d$/.test(val.trim()));
        const reason = !invalid ? '' : `Invalid Entry: **${invalid}**\n\`\`\`fix\n${list
            .map((item) => `${item === invalid ? `⚠️${item}⚠️` : item}`)
            .map((item) => item.trim())
            .join(', ')}\`\`\``;
        return [!invalid, reason];
    }
    /**
     * @param time a string containing all timers seperated by comma
     */
    public static convertToSeconds(time?: string): number[] | undefined;
    /**
     * @param time an array of single time values
     */
    public static convertToSeconds(time?: string[]): number[] | undefined;
    public static convertToSeconds(time?: string[] | string): number[] | undefined {
        const parse = (s: string): number => {
            const [minutes, seconds] = s.split(':').map((v) => Number.parseInt(v));
            return minutes * 60 + seconds;
        };
        if (!time) return undefined;
        else if (typeof time === 'string') return time.split(',').map(parse).sort((a, b) => a - b).reverse();
        else if (time.length > 0) return time.map(parse);
        else return undefined;
    }
    public static sort(text: string): string[] {
        return [...new Set(text.split(',').map((val) => {
            const [minutes, seconds] = val.split(':').map((str) => Number.parseInt(str));
            return {
                seconds: minutes * 60 + seconds,
                text: val.trim()
            };
        }).sort((a, b) => a.seconds - b.seconds).reverse().map((val) => val.text))];
    }
    public static equalsDefault(text: string): boolean {
        return TimingsSettings.sort(text).sort().toString() === [...TimingsSettings.DEFAULT].sort().toString();
    }

    public static convertToRespawnData(timers: number[]): WarInfo {
        const start = new Date();
        start.setMinutes(start.getMinutes() >= 30 ? 30 : 0);
        start.setSeconds(0);
        start.setMilliseconds(0);
        const now = new Date();

        const timePassedSeconds = Math.round((now.getTime() - start.getTime()) / 1000);
        const timeLeftTotalSeconds = 30 * 60 - timePassedSeconds;
        const currentIndex = timers.findIndex((timer) => timer < timeLeftTotalSeconds);

        const prev: number | undefined = timers[currentIndex - 1];
        const current: number | undefined = timers[currentIndex];
        const next: number | undefined = timers[currentIndex + 1];

        const duration = current ? prev ? prev - current : 30 * 60 - current : -1;
        const durationNext = next && current ? current - next : -1;
        const remainingRespawns = current ? timers.length - currentIndex : 0;
        //const timeUntilRespawn = clamp(timeLeftTotalSeconds - prev, 0, Infinity);
        const timeUntilRespawn = current ?
            timeLeftTotalSeconds - current === duration ?
                0 :
                timeLeftTotalSeconds - current :
            -1;

        return {
            respawn: {
                duration,
                durationNext,
                timeUntilRespawn,
                remainingRespawns
            },
            war: {
                timeLeftSeconds: timeLeftTotalSeconds
            }
        };
    }
}