import { Message } from 'discord.js';
import { Trigger } from '../trigger';

export type TriggerCondition = (
    message: Message,
    context: Trigger
) => void;