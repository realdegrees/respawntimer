import { MessageEmbed } from "discord.js";
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
    pre: (context) => {
        
    }
});