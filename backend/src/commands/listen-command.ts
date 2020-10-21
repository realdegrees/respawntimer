/**
 * This is an example from a previous bot
 * Check this to see how a trigger callback is used and how to interact with the server
 */







// import { TriggerCallback, SingleSilence } from "../common/types";
// import { Message } from "discord.js";
// import { GuildMember } from 'discord.js';
// import logger from "../lib/logger";
// import mkdirp from "mkdirp";
// import path from "path";
// import { WriteStream, createWriteStream } from "fs";

// const getWriteStreamFor = (member: GuildMember): WriteStream => {
//     const dir = path.resolve(process.cwd(), `data/dynamic/${member?.id}/quotes`);
//     mkdirp(dir)
//     return createWriteStream(`${dir}/${new Date().getTime()}`, {
//         highWaterMark: 2048
//     });
// }

// export const listen: TriggerCallback = async (message: Message) => {
//     if (!!message.member?.voice.channel) {
//         logger.debug(`Joining ${message.member?.voice.channel.name}`);
//         const connection = await message.member.voice.channel.join();
//         logger.debug('Joined!');
//         // Play Silence because Bots can't receive Audio without sending it
//         const dispatcher = connection.play(new SingleSilence(), { type: 'opus', volume: false });
//         dispatcher.on('finish', () => logger.debug('Finished SingleSilence'));
//         message.channel.send(
//             `Listening to <@${connection.channel.members.filter((member) => !member.user.bot).map((member) => member.id).join('>, <@')}> in <#${connection.channel.id}>`
//         );
//         connection.channel.members
//             .filter((member) => !member.user.bot)
//             .map((member) => [getWriteStreamFor(member), connection.receiver.createStream(member, { end: 'manual', mode: 'pcm' }), member] as const)
//             .forEach(([writeStream, readStream, member]) => {
//                 logger.debug(`Connecting read/write audio streams for ${member.displayName}`);
//                 readStream.pipe(writeStream);
//                 const closeStreams = () => {
//                     logger.debug(`Closing read/write audio streams for ${member.displayName}`);
//                     readStream.destroy();
//                     writeStream.close();
//                 }
//                 // Close the streams when the user disconnects
//                 message.member?.voice.connection?.on('disconnect', closeStreams);
//                 // Close the streams when the bot disconnects
//                 connection.on('disconnect', () => closeStreams);
//             });
//     }
// };