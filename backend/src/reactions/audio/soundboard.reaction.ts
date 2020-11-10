import { EmbedFieldData, EmojiResolvable, MessageEmbed, MessageReaction, User } from 'discord.js';
import { clearTimeout, setTimeout } from 'timers';
import logger from '../../../lib/logger';
import { CommandAborted } from '../../common/errors/command-aborted';
import { InternalError } from '../../common/errors/internal.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { unicodeEmojiAlphabet } from '../../common/util';
import { AudioInfo } from './add.reaction';
import { download, play } from './audio-utils';

// TODO: Refactor

const cancelEmoji = '❌' as EmojiResolvable;
const confirmEmoji = '✅' as EmojiResolvable;

export const audioSoundBoardReaction = Reaction.create<
    GuildMessage,
    { id: string; data: AudioInfo }[]
>({
    name: 'soundboard'
}, async (context, board) => {
    let footerError: NodeJS.Timeout | undefined = undefined;

    const emojis = unicodeEmojiAlphabet().reverse();
    const commandEmojiMap = board
        .map((audioDocument) => ({
            audio: audioDocument,
            emoji: emojis.pop()
        } as CommandEmojiItem));

    const embed = new MessageEmbed()
        .setTitle('Soundboard')
        .setDescription(
            'React with the corresponding emojis to play the clip.')
        .addFields(commandEmojiMap.map((item) => ({
            name: item.audio.data.command,
            value: item.emoji,
            inline: true
        } as EmbedFieldData)))
        .setFooter('You can delete the soundboard with  ' + cancelEmoji);

    const prompt = await context.message.channel.send(embed);
    prompt.client.on('messageDelete', (message) => {
        if (message.equals(prompt, prompt) && footerError) {
            clearTimeout(footerError);
        }
    });
    return new Promise<{ id: string; data: AudioInfo }[]>((resolve) => {
        // Create a collector before the reactions are added
        const reactionCollector = prompt.createReactionCollector(
            (_reaction: MessageReaction, user: User) => user.id !== context.trigger.bot.user?.id
        );

        reactionCollector.on('collect', (
            reaction: MessageReaction,
            user: User
        ) => {
            if (reaction.emoji.toString() === cancelEmoji) {
                reactionCollector.stop();
                resolve();
            } else {
                const audio = commandEmojiMap.find((item) =>
                    item.emoji === reaction.emoji.toString()
                )?.audio;

                // Someone reacted with an emojo that is not in the map
                if (!audio) {
                    return;
                }
                const voiceChannel = prompt.guild?.member(user)?.voice.channel;
                if (voiceChannel) {
                    download(audio.data)
                        .then((stream) => play(voiceChannel, stream, {
                            type: audio.data.source === 'youtube' ? 'opus' : 'unknown',
                            volume: .5,
                        }))
                        .then(() => !prompt.deleted ? reaction.users.remove(user) : undefined);
                } else {
                    if (footerError) {
                        clearTimeout(footerError);
                        footerError = undefined;
                    }
                    const footer = embed.footer;
                    reaction.users.remove(user)
                        .then(() =>
                            prompt.edit(
                                embed.setFooter(footer?.text + '\nYou\'re not in a voicechannel!')
                            ))
                        .then((prompt) =>
                            new Promise<NodeJS.Timeout>((resolve, reject) => {
                                const timeout = setTimeout(() => {
                                    prompt.edit(embed.setFooter(footer?.text))
                                        .then(() => resolve(timeout))
                                        .catch(reject);
                                }, 4000);
                            }))
                        .then((timeout) => {
                            footerError = timeout;
                        })
                        .catch(logger.error);
                }
            }
        });

        const reactInOrder = async (): Promise<void> => {
            // React with all emojis for the user to control
            await prompt.react(cancelEmoji);
            for (const item of commandEmojiMap) {
                await prompt.react(item.emoji);
            }
        };
        reactInOrder()
            .catch((e) => {
                if (reactionCollector.collected.size <= 0) {
                    throw new InternalError(e);
                }
            });
    }).then(async (items) => {
        if (footerError) {
            clearTimeout(footerError);
        }
        await prompt.delete();
        return items;
    }).catch(async (e) => {
        if (footerError) {
            clearTimeout(footerError);
        }
        await prompt.delete();
        throw e;
    });
}, {
    /** 
    * Prompts the user to select all audio commands to go on the soundboard
    * When the prompt is complete, create a messagembed 
    * that is the final soundboard and give it to the main function
    */
    pre: async (context) => {
        const emojis = unicodeEmojiAlphabet().reverse();
        const commandEmojiMap = (await context.trigger.db.firestore
            .collection<AudioInfo>(['guilds', context.message.guild.id, 'audio'].join('/')))
            .map((audioDocument) => ({
                audio: audioDocument,
                emoji: emojis.pop()
            } as CommandEmojiItem));

        let duration = 120;
        const footer = (remaining: number): string =>
            'This message will be deleted automatically in ' + remaining + ' seconds.';

        let embed = new MessageEmbed()
            .setTitle('Soundboard Picker')
            .setDescription(
                'Use the corresponding Emojis to add or remove clips from the soundboard.\n' +
                'You can cancel with  ' + cancelEmoji +
                '  or create the soundboard with  ' + confirmEmoji)
            .addFields(commandEmojiMap.map((item) => ({
                name: item.audio.data.command,
                value: item.emoji,
                inline: true
            } as EmbedFieldData)))
            .setFooter(footer(duration));

        const prompt = await context.message.channel.send(embed);

        const intervalMultiplier = 5;
        const interval = setInterval(() => {
            embed = embed.setFooter(footer(duration -= intervalMultiplier));
            prompt.edit(embed);
            if (duration <= 0) {
                clearInterval(interval);
                prompt.delete();
            }
        }, 1000 * intervalMultiplier);

        prompt.client.on('messageDelete', (message) => {
            if (message.equals(prompt, prompt)) {
                clearInterval(interval);
            }
        });

        return new Promise<{ id: string; data: AudioInfo }[]>((resolve, reject) => {
            // Create a collector before the reactions are added
            const reactionCollector = prompt.createReactionCollector(
                (_reaction: MessageReaction, user: User) => user.id !== context.trigger.bot.user?.id
            );
            reactionCollector.on('collect', (
                reaction: MessageReaction,
                user: User
            ) => {
                if (user.id !== context.message.member.id) {
                    reaction.users.remove(user);
                    return;
                }
                if (reaction.emoji.toString() === cancelEmoji) {
                    reactionCollector.stop();
                    reject(new CommandAborted());
                } else if (reaction.emoji.toString() === confirmEmoji) {
                    const soundboardItems = reactionCollector.collected
                        .map((reaction) =>
                            commandEmojiMap.find(
                                (item) => item.emoji === reaction.emoji.toString()
                            )?.audio)
                        .filter((audio) => audio) as { id: string; data: AudioInfo }[]; // ? Why doesn't typescript get that undefined is filtered?
                    reactionCollector.stop();
                    resolve(soundboardItems);
                }
            });

            const reactInOrder = async (): Promise<void> => {
                // React with all emojis for the user to control
                await prompt.react(cancelEmoji);
                for (const item of commandEmojiMap) {
                    await prompt.react(item.emoji);
                }
                await prompt.react(confirmEmoji);
            };
            reactInOrder()
                .catch((e) => {
                    if (reactionCollector.collected.size <= 0) {
                        throw new InternalError(e);
                    }

                });
        }).then(async (items) => {
            await prompt.delete();
            clearTimeout(interval);
            return items;
        }).catch(async (e) => {
            await prompt.delete();
            clearTimeout(interval);
            throw e;
        });

    }
});
interface CommandEmojiItem {
    audio: { id: string; data: AudioInfo };
    emoji: EmojiResolvable;
}