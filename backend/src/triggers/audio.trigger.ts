import { Trigger, TriggerMatch } from '../common/types';
import { useSubtriggerReaction } from '../reactions/base/use-subtriggers.reaction';
import { audioAddReaction } from '../reactions/audio/add.reaction';

export const audioTrigger = new Trigger({
    default: {
        guild: [useSubtriggerReaction],
        direct: []
    },
    sub: {
        guild: [audioAddReaction],
        direct: []
    }
}, {
    commandOptions: {
        command: ['audio', 'sound'],
        match: TriggerMatch.STARTS_WITH,
    }
});