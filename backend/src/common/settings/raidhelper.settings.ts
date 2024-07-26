import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, 
    ChannelSelectMenuBuilder, ChannelType, Guild, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';


export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel'
}

export class RaidhelperSettings extends Setting {

    public async getCurrentSettings(guildData: GuildData, guild: Guild): Promise<string> {
        return `**Raidhelper API Key** 
        *[Click to reveal]*   
        ${guildData.raidHelper.apiKey ? '||' + guildData.raidHelper.apiKey + '||' : 'Not set'}\n
        **Default Voice Channel**  
        ${guildData.raidHelper.defaultVoiceChannelId ?
                await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId) :
                'None'}`;
    }
    public constructor() {
        super();
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(ESettingsID.RAIDHELPER, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: ButtonStyle.Primary
        });
        const defaultVoiceChannel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(ESettingsID.RAIDHELPER, [ERaidhelperSettingsOptions.DEFAULT_CHANNEL]))
            .setChannelTypes(ChannelType.GuildVoice)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select a default voice channel');

        const apiKeyRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(apiKeyButton);
        const defaultVoiceChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(defaultVoiceChannel);

        this.init(
            ESettingsID.RAIDHELPER, 
            'Raidhelper Integration',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by Raidhelper starts.
            Set the API Key below to enable the Raidhelper Integration \n[Use \`/apikey\` to retrieve your server's API Key]\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.',
            defaultVoiceChannelRow, apiKeyRow);
    }

    public showModal(interaction: ButtonInteraction): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(this.getCustomId(ESettingsID.RAIDHELPER, [ERaidhelperSettingsOptions.API_KEY]))
            .setTitle('Set Raidhelper API Key');
        const apiKey = new TextInputBuilder()
            .setCustomId(this.getCustomId(ESettingsID.RAIDHELPER, [ERaidhelperSettingsOptions.API_KEY]))
            .setLabel(ERaidhelperSettingsOptions.API_KEY)
            .setPlaceholder(`Raidhelper API Key`)
            .setStyle(TextInputStyle.Short);
        const apiKeyRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(apiKey);
        modal.addComponents(apiKeyRow);
        return interaction.showModal(modal);
    }
}