import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { executeWithChance, mock } from '../../common/util';

export const audioStopReaction = Reaction.create<GuildMessage>(
    {
        name: 'stop',
        shortDescription: 'Stops the audio that is playing currently playing in the users channel'
    },
    {
        message: async (context) => {
            const botConnection = context.trigger.bot.guildHelper
                .member(context.message.guild)?.voice.connection;
            const memberConnection = context.message.member.voice.connection;
            if (!botConnection) {
                throw new VerboseError('I\'m not even in a voicechannel bruh..');
            } else if (memberConnection && botConnection.channel.equals(memberConnection.channel)) {
                const text = `Sorry ${context.message.member.displayName}`;
                await context.message.channel.send(
                    executeWithChance(.05, () => mock(text)) ?? text + ' :('
                );
                botConnection.disconnect();
            } else {
                throw new VerboseError('You need to be in the same channel as me to do that.');
            }

        }
    });