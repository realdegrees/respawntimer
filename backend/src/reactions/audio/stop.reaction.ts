import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { executeWithChance, mock } from '../../common/util';

export const audioStopReaction = Reaction.create<GuildMessage>(
    {
        name: 'stop'
    },
    async (context) => {
        const connection = context.trigger.bot.guildHelper
            .member(context.message.guild)?.voice.connection;
        if (!connection) {
            throw new VerboseError('I\'m not even in a voicechannel bruh..');
        } else {
            const text = `Sorry ${context.message.member.displayName}`;
            await context.message.channel.send(
                executeWithChance(.05, () => mock(text)) ?? text + ' :('
            );
            connection.disconnect();
        }
    });