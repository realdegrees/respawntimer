import { ActionRowBuilder, AnySelectMenuInteraction, ButtonInteraction, ButtonStyle, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import audioManager, { Voices, voices } from '../../handlers/audioManager';
import { DBGuild } from '../types/dbGuild';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';

export enum EVoiceSettingsOptions {
    VOICE = 'voice'
}

export class VoiceSettings extends BaseSetting<StringSelectMenuBuilder> {

    public constructor() {
        super(ESettingsID.VOICE,
            ButtonStyle.Primary,
            'Voice Settings',
            `**Respawn Timer** supports several voices and sound effects.\nThey can be changed even while the bot is in your channel.`,
            '');
    }
    public getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const voice = new StringSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EVoiceSettingsOptions.VOICE]))
            .setPlaceholder((dbGuild.voice || 'female').split(' ').map((voice) => voice.charAt(0).toUpperCase() + voice.slice(1)).join(' '))
            .setMinValues(0)
            .setMaxValues(1)
            .addOptions(Object.entries(voices).map(([voice, description]) => new StringSelectMenuOptionBuilder()
                .setLabel(voice.toPascalCase())
                .setDescription(description)
                .setValue(voice)));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voice);
        return Promise.resolve([row]);
    }
    public async getCurrentSettings(guild: DBGuild) {
        return '';
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
    ): Promise<SettingsPostInteractAction[]> {
        if (!interaction.isStringSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
        dbGuild.voice = interaction.values[0] as Voices || 'female';
        return ['saveGuild', 'update', 'updateWidget'];
    }
}