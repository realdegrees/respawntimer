import { EmojiResolvable, MessageEmbed } from "discord.js";
import { GuildMessage, Reaction } from "../../common/reaction";

export const audioSoundBoardReaction = Reaction.create<GuildMessage, MessageEmbed>({
    name: 'soundboard'
}, (context, board) => {
    // TODO: Set callbacks for 
}, {
    /** 
    * Prompts the user to select all audio commands to go on the soundboard
    * When the prompt is complete, create a messagembed 
    * that is the final soundboard and give it to the main function
    */
    pre: async (context) => {
        const commands = await context.trigger.db.firestore
            .collection<AudioInfo>(['guilds', context.message.guild, 'audio'].join('/'));
        const commandEmojiMap = [
            
        ]
        const embed = new MessageEmbed()
            .setTitle('Audio commands for ' + context.message.guild.name)
            .addFields(commands.map((command) => ({
                name: command.id,
                value: command.data.url
            } as EmbedFieldData)))
            .setFooter('_Hint: You can create a soundboard from these with *' +
                getSampleTriggerCommand(context.trigger, context.message.guild, {
                    subTrigger: audioSoundBoardReaction.options.name
                }) + '*_');
        const prompt = await context.message.channel.send(embed, {
            
        });

    }
});
type CommandEmojiMap = {
    command: string;
    emoji: EmojiResolvable;
}[];