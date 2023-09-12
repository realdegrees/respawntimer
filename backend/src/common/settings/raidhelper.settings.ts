import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, Guild, ModalBuilder, TextInputBuilder, TextInputStyle, VoiceBasedChannel
} from 'discord.js';
import { GuildData, getGuild } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import raidhelperIntegration from '../../util/raidhelperIntegration';
import { formatTime } from '../../util/formatTime';


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
        const events = await getGuild(guild)
            .then((dbGuild) => raidhelperIntegration.getEvents(dbGuild))
            .catch(() => []);

        return `**Raidhelper API Key** ${apiKey ?
            apiKeyValid ?
                ' » *Valid Key* ✅' :
                ' » *Invalid Key* ⚠️' :
            `Use \`/apikey show\` to retrieve your Raidhelper API Key  
                Or \`/apikey refresh\` if you don't have an API Key`}
        ${apiKey ? apiKeyValid ? '||```fix\n' + apiKey + '```||' : '```fix\n' + apiKey + '```' : '```diff\n- Not Set ```'}  
        **Auto-Join State**  
        ${guildData.raidHelper.enabled ? '```diff\n+ Enabled ```' : '```diff\n- Disabled ```'}
        **Default Voice Channel**  
        ${guildData.raidHelper.defaultVoiceChannelId ?
                await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId) :
                'None'}\n
        **Scheduled Events**  
        ${events.length > 0 ?
                (await Promise.all(events.map(async (event) => {
                    const voiceChannel = event.voiceChannelId ?
                        await guild.channels.fetch(event.voiceChannelId).catch(() => undefined) as VoiceBasedChannel | undefined : undefined;
                    const time = formatTime(new Date(event.startTime));
                    return `- 📝  ${event.title}  🕑  ${time}${voiceChannel ? `  🔗 ${voiceChannel}` : ''}`;
                }))).join('\n') : 'None'}`;
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
            'Raidhelper Integration *(Experimental)*',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.
            Set the API Key below to enable the *Raidhelper Integration*\n`,
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