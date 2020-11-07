import { Trigger, TriggerMatch } from '../common/types';
import { helpReaction } from '../reactions/help/help.reaction';

export const helpTrigger = new Trigger({
    default: {
        all: [helpReaction]
    }
}, {
    commandOptions: {
        command: ['help', 'pls'],
        match: TriggerMatch.STARTS_WITH
    }
});