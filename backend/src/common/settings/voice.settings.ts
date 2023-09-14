import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import audioManager from '../../util/audioManager';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';

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
            .addOptions(audioManager.voices.map((s) => new StringSelectMenuOptionBuilder()
                .setLabel(s.voiceType.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '))
                .setDescription(s.voiceDescription)
                .setValue(s.voiceType)));

        const voicesRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voice);

        this.init(
            'Voice Settings',
            `Wartimer supports several voices and sound effects.\nThey can be changed even while the bot is in your channel.`,
            '',
            voicesRow
        );
    }
    public async getCurrentSettings(guild: DBGuild): Promise<string> {
        return Promise.resolve(guild.voice.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '));
    }
}