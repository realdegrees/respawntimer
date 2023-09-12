import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import audioManager from '../../util/audioManager';

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
            .addOptions(audioManager.sounds.map((s) => new StringSelectMenuOptionBuilder()
                .setLabel(s.voice.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '))
                .setDescription(s.voiceDescription)
                .setValue(s.voice)));

        const voicesRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voice);

        this.init(
            'Voice Settings',
            `Wartimer supports several voices and sound effects.\nThey can be changed even while the bot is in your channel.`,
            '',
            voicesRow
        );
    }
    public async getCurrentSettings(guild: GuildData): Promise<string> {
        return Promise.resolve(guild.voice.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '));
    }
}