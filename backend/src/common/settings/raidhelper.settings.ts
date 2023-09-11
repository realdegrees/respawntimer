import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, Guild, ModalBuilder, RepliableInteraction, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import raidhelperIntegration from '../../util/raidhelperIntegration';


export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    TOGGLE = 'toggle'
}

export class RaidhelperSettings extends Setting {

    public async getCurrentSettings(guildData: GuildData, guild: Guild): Promise<string> {
        const apiKey = guildData.raidHelper.apiKey;
        const apiKeyValid = apiKey ?
            await raidhelperIntegration.checkApiKey(guild, apiKey) : false;
        const events = await raidhelperIntegration.getEvents(guild);

        return `**Raidhelper API Key**
        ${apiKey ? apiKeyValid ? '||`' + apiKey + '`||' : '`' + apiKey + '`' : 'Not set'}  
        ${apiKey ?
                apiKeyValid ?
                    '✅ Valid Key' :
                    '⚠️ Invalid Key' :
                `Use \`/apikey show\` to retrieve your Raidhelper API Key  
                Of you don't have an API Key use \`/apikey refresh\``}\n
        **Auto-Join State**  
        ${guildData.raidHelper.enabled ? '*Enabled*' : '*Disabled*'}\n
        **Default Voice Channel**  
        ${guildData.raidHelper.defaultVoiceChannelId ?
                await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId) :
                'None'}\n
        **Currently Scheduled Events**  
        ${events.length > 0 ?
                events.map((event) => `${event.title} at ${new Date(event.startTime)}`).join('\n')
                : 'None'}`;
    }
    public constructor() {
        super(ESettingsID.RAIDHELPER);
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: ButtonStyle.Primary
        });
        const toggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE]),
            label: 'Toggle Auto-Join',
            style: ButtonStyle.Secondary
        });
        const defaultVoiceChannel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.DEFAULT_CHANNEL]))
            .setChannelTypes(ChannelType.GuildVoice)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select a default voice channel');

        const apiKeyRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(apiKeyButton)
            .addComponents(toggleButton);
        const defaultVoiceChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(defaultVoiceChannel);

        this.init(
            'Raidhelper Integration',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by Raidhelper starts.
            Set the API Key below to enable the Raidhelper Integration \n[Use \`/apikey\` to retrieve your server's API Key]\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.',
            defaultVoiceChannelRow, apiKeyRow);
    }

    public showModal(interaction: ButtonInteraction): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]))
            .setTitle('Set Raidhelper API Key');
        const apiKey = new TextInputBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]))
            .setLabel(ERaidhelperSettingsOptions.API_KEY)
            .setPlaceholder(`API Key`)
            .setStyle(TextInputStyle.Short);
        const apiKeyRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(apiKey);
        modal.addComponents(apiKeyRow);
        return interaction.showModal(modal);
    }
}