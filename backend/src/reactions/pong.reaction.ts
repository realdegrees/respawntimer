import { Reaction } from '../common/reaction';

export const pong = new Reaction(async (message) => 
    await message.channel.send('pong!')
);