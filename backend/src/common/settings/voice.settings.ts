import { ActionRowBuilder, AnySelectMenuInteraction, ButtonInteraction, CacheType, Interaction, ModalSubmitInteraction, RoleSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, BaseSetting } from './base.setting';
import audioManager, { Voices } from '../../util/audioManager';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import logger from '../../../lib/logger';

export enum EVoiceSettingsOptions {
    VOICE = 'voice'
}

export class VoiceSettings extends BaseSetting<StringSelectMenuBuilder> {
    
    public constructor() {
        super(
            ESettingsID.VOICE,
            'Voice Settings',
            `Wartimer supports several voices and sound effects.\nThey can be changed even while the bot is in your channel.`,
            ''
        );
    }
    public getSettingsRows() {
        const voice = new StringSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EVoiceSettingsOptions.VOICE]))
            .setPlaceholder('Select Voice')
            .setMinValues(0)
            .setMaxValues(1)
            .addOptions(audioManager.voices.map((s) => new StringSelectMenuOptionBuilder()
                .setLabel(s.voiceType.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '))
                .setDescription(s.voiceDescription)
                .setValue(s.voiceType)));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voice);
        return Promise.resolve([row]);
    }
    public async getCurrentSettings(guild: DBGuild) {
        return Promise.resolve(guild.voice.split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '));
    }
    public async onInteract(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction, option: string): Promise<unknown> {
        if (!interaction.isStringSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');

        dbGuild.voice = interaction.values[0] as Voices;
        audioManager.setVoice(dbGuild.id, dbGuild.voice);
        logger.info('[' + dbGuild.name + '] Changed Voice to ' + dbGuild.voice);
        return dbGuild.save().then(() => this.send(interaction, dbGuild, { update: true }));
    }
}