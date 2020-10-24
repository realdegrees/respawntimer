/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * This is a sample TriggerCallback.
 * A triggerCallback is passed to a Trigger which gets attached to a bot.
 * When a bot recognizes a command it checks if it should react to it.
 * If it decides to react to the command, this method will be called with the message as a parameter.
 * This method should contain all of the bots interactions. 
 * The message object holds all of the information relevant to the bot, including server properties.
 */

import { TriggerCallback } from '../common/types';
import { Message } from 'discord.js';

export const commandName: TriggerCallback = (message: Message) => {
    
};