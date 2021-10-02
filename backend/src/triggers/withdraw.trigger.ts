import { Trigger, TriggerMatch } from '../common/types';
import { depositReaction } from '../reactions/deposit/deposit.reaction';

export const withdrawTrigger = new Trigger({
    default: {
        all: [depositReaction]
    }
}, {
    commandOptions: {
        command: ['withdraw'],
        match: TriggerMatch.EQUALS
    }
});