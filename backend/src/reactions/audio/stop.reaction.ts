import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { executeWithChance, mock } from '../../common/util';

export const audioStopReaction = Reaction.create<GuildMessage>('stop', async (message, trigger) => {
    const connection = trigger.bot.member(message.guild)?.voice.connection;
    if(!connection){
        throw new VerboseError('I\'m not even in a voicechannel bruh..');
    }else {
        const text = `Sorry ${message.member.displayName}`;
        await message.channel.send(executeWithChance(.05, () => mock(text)) ?? text + ' :(');
        connection.disconnect();
    }
});