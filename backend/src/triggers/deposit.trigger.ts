import { Trigger, TriggerMatch } from '../common/types';
import { depositReaction } from '../reactions/deposit/deposit.reaction';

export const depositTrigger = new Trigger({
    default: {
        all: [depositReaction]
    }
}, {
    commandOptions: {
        command: ['deposit'],
        match: TriggerMatch.EQUALS
    }
});