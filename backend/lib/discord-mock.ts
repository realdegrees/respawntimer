import { install } from 'source-map-support';
import { config } from 'dotenv';

// Install source-map support for stacktrace
install({ hookRequire: true });
config();
import {
    CategoryChannel,
    Channel,
    Client,
    EmojiResolvable,
    Guild, GuildCreateChannelOptions, Message,
    MessageOptions,
    TextChannel,
    VoiceChannel
} from 'discord.js';

export class MockClient {
    private categoryChannel: Channel | undefined;
    private constructor(
        private client: Client,
        private guild: Guild,
        private mockedChannels: Channel[] = []) { }

    public static connect(): Promise<MockClient> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const discordToken = process.env['DISCORD_CLIENT_TOKEN'];
            const mockGuildId = process.env['TEST_GUILD_ID'];

            if (!discordToken) {
                reject('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
                return;
            }
            if (!mockGuildId) {
                reject('Environment variable "TEST_GUILD_ID" not found!');
                return;
            }

            client.login(discordToken)
                .then(() => client.guilds.cache.get(mockGuildId))
                .then((guild) => {
                    if (!guild) {
                        throw new Error(`The guild with id ${mockGuildId} was not found!`);
                    } else {
                        return new MockClient(client, guild);
                    }
                })
                .then(resolve)
                .catch(reject);
        });
    }

    public async createTextChannel(
        name?: string,
        options?: Omit<GuildCreateChannelOptions, 'parent' | 'type'>)
        : Promise<TextChannel> {
        if (!this.categoryChannel) {
            this.categoryChannel = await this.createCategoryChannel();
        }
        if (!name) {
            name = `jest-text-${process.platform}-${new Date().getTime()}`;
        }
        const channel = await (options ?
            this.guild.channels.create(name, {
                ...options,
                type: 'text',
                parent: this.categoryChannel
            }) :
            this.guild.channels.create(name));
        this.mockedChannels.push(channel);
        return channel;
    }

    public async createVoiceChannel(
        name?: string,
        options?: Omit<GuildCreateChannelOptions, 'parent' | 'type'>)
        : Promise<VoiceChannel> {
        if (!this.categoryChannel) {
            this.categoryChannel = await this.createCategoryChannel();
        }
        if (!name) {
            name = `jest-voice-${process.platform}-${new Date().getTime()}`;
        }
        const channel = await this.guild.channels.create(
            name,
            {
                ...options,
                type: 'voice',
                parent: this.categoryChannel
            }
        );
        this.mockedChannels.push(channel);
        return channel;

    }
    private async createCategoryChannel(): Promise<CategoryChannel> {
        return this.guild.channels.create(
            `jest-${process.platform}-${new Date().getTime()}`, {
            type: 'category'
        });

    }

    public async cleanup(): Promise<void> {
        await Promise.all(
            this.mockedChannels.map(
                (channel) => channel.delete('Created for testing purposes')
            )
        );
        await this.categoryChannel?.delete();
        this.client.destroy();
    }

    public async getMessage(
        channel: TextChannel,
        content: string,
        options?: MockMessageOptions): Promise<Message> {
        const message = options ?
            await channel.send(content, options) :
            await channel.send(content);
        return Promise.all([options?.reactions?.map((reaction) => message.react(reaction))])
            .then(() => message);
    }
}
type MockMessageOptions = Omit<MessageOptions, 'split'> & {
    reactions?: EmojiResolvable[];
};