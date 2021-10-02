import { Trigger, TriggerMatch } from '../common/types';
import { withdrawReaction } from '../reactions/withdraw/withdraw.reaction';

export const withdrawTrigger = new Trigger({
    default: {
        all: [withdrawReaction]
    }
}, {
    commandOptions: {
        command: ['withdraw'],
        match: TriggerMatch.EQUALS
    }
});