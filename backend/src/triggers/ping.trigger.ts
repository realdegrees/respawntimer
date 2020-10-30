import { Trigger, TriggerMatch } from '../common/types';
import { pong } from '../reactions/pong.reaction';

export const ping = new Trigger([pong], {
    commandOptions: {
        command: 'ping',
        match: TriggerMatch.EQUALS,
        ignorePrefix: true
    }
});