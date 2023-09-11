import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';

export enum EVoiceSettingsOptions {
    VOICE = 'voice'
}

export class VoiceSettings extends Setting {    
    public constructor() {
        super(ESettingsID.VOICE);
        const voice = new StringSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EVoiceSettingsOptions.VOICE]))
            .setPlaceholder('Select Voice')
            .setMinValues(0)
            .setMaxValues(1)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Male')
                    .setDescription('Use male voice to announce respawns')
                    .setValue('male'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Female')
                    .setDescription('Use female voice to announce respawns')
                    .setValue('female')
            );

        const voicesRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voice);

        this.init(
            'Voice Settings',
            `Wartimer currently offers a female and a male voice.\nIn the future more voice might be added.\n(Maybe even custom voices that you can upload from discord))`,
            '',
            voicesRow
        );
    }
    public async getCurrentSettings(guild: GuildData): Promise<string> {
        return Promise.resolve(guild.voice);
    }
}