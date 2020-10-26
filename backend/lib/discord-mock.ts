import { config } from 'dotenv';
config();
import {
    Channel,
    Client,
    EmojiResolvable,
    Guild, GuildCreateChannelOptions, Message,
    MessageOptions,
    TextChannel,
    User,
    VoiceChannel
} from 'discord.js';

export class MockClient {
    private constructor(
        private client: Client,
        private guild: Guild,
        private mockedChannels: Channel[] = []) { }

    public static connect(): Promise<MockClient> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const discordToken = process.env['DISCORD_CLIENT_TOKEN'];
            const mockGuildId = process.env['TEST_GUILD_ID'];
            const mockChannelId = process.env['TEST_CHANNEL_ID'];

            if (!discordToken) {
                reject('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
                return;
            }
            if (!mockGuildId) {
                reject('Environment variable "TEST_GUILD_ID" not found!');
                return;
            }
            if (!mockChannelId) {
                reject('Environment variable "TEST_CHANNEL_ID" not found!');
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

    public async getTextChannel(
        name?: string,
        options?: GuildCreateChannelOptions & { type: 'text' })
        : Promise<TextChannel> {
            if(!name){
                name = `jest-${process.platform}-${new Date().getTime()}`;
            }
        const channel = await (options ?
            this.guild.channels.create(name, options) :
            this.guild.channels.create(name));
        this.mockedChannels.push(channel);
        return channel;
    }

    public async getVoiceChannel(
        name: string,
        options: GuildCreateChannelOptions & { type: 'voice' })
        : Promise<VoiceChannel> {
        const channel = await this.guild.channels.create(name, options);
        this.mockedChannels.push(channel);
        return channel;

    }

    public async cleanup(): Promise<void> {
        await Promise.all(
            this.mockedChannels.map(
                (channel) => channel.delete('Created for testing purposes')
            )
        );
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