import { Client, EmojiResolvable, Guild, GuildMember } from 'discord.js';
import { InternalError } from '../common/errors/internal.error';

const defaultBotName = 'Casuals United Bot';

export class GuildHelper {

    public constructor(private client: Client) { }
    
    public getName(guild: Guild | null): string {
        if (!this.client.user) {
            throw new InternalError('Client cannot be identified');
        }
        const member = guild?.member(this.client.user);
        return member ? member.displayName : this.client.user.username;
    }

    public member(guild: Guild): GuildMember | null {
        if (!this.client.user) {
            throw new InternalError('Client cannot be identified');
        }
        return guild.member(this.client.user);
    }
    /** 
     * @returns A function to reset the name
     */
    public changeName(name: string, guild: Guild): Promise<() => Promise<GuildMember>> {
        return new Promise((resolve, reject) => {
            if (!this.client.user) {
                reject(new InternalError('Client cannot be identified'));
                return;
            }
            const member = guild.member(this.client.user);
            if (!member) {
                reject(new InternalError('Client cannot be identified as guild member'));
                return;
            }
            member
                .setNickname(name)
                .then((member) => resolve(() => member.setNickname(defaultBotName)));
        });
    }

    public getGuildEmojis(guild: Guild): EmojiResolvable[] {
        return guild.emojis.cache.map((emoji) => emoji.id);
    }
}