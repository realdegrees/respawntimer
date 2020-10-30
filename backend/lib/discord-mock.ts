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
    Guild, GuildAuditLogs, GuildCreateChannelOptions, Message,
    MessageOptions,
    TextChannel,
    VoiceChannel
} from 'discord.js';

export class TestClient {
    private categoryChannel: Channel | undefined;
    private constructor(
        private client: Client,
        public readonly guild: Guild,
        private mockedChannels: Channel[] = []) { }

    public static connect(): Promise<TestClient> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const discordToken = process.env['DISCORD_CLIENT_TOKEN'];

            if (!discordToken) {
                reject('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
                return;
            }

            client.login(discordToken)
                .then(
                    () => client.guilds.create(`test-${process.platform}-${new Date().getTime()}`)
                )
                .then((guild) => new TestClient(client, guild))
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
            name = `test-text-${process.platform}-${new Date().getTime()}`;
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

    /**
     * Returns the test guild's audit log
     */
    public async destroy(): Promise<[GuildAuditLogs, Guild]> {
        const logs = await this.guild.fetchAuditLogs();
        const lastGuildState = await this.guild.fetch();
        await this.guild.delete();
        this.client.destroy();
        return [logs, lastGuildState];
    }

    public async sendMessage(
        channel: TextChannel,
        content: string,
        options?: MockMessageOptions): Promise<Message> {
        const message = options ?
            await channel.send(content, options) :
            await channel.send(content);
        return Promise.all([options?.reactions?.map((reaction) => message.react(reaction))])
            .then(() => message);
    }

    public async awaitMessage(
        channel: TextChannel,
        content?: string,
    ): Promise<Message> {
        return channel.awaitMessages(
            (message: Message) => content ? message.content === content : true, {
            max: 1
        })
            .then((collected) => collected.first())
            .then((message) => {
                if (message) {
                    return message;
                } else {
                    throw new Error(
                        `Timeout for message with content "${content}" in channel "${channel.name}"`
                    );

                }
            });
    }

    public async getMessages(channel: TextChannel, max?: number): Promise<Message[]> {
        return channel.fetch().then((channel) => {
            if (channel.type === 'text') {
                return (channel as TextChannel).messages.cache.sort(
                    (m1, m2) => m1.createdTimestamp - m2.createdTimestamp
                ).array().slice(max);
            } else {
                return [];
            }
        });
    }
}
type MockMessageOptions = Omit<MessageOptions, 'split'> & {
    reactions?: EmojiResolvable[];
};