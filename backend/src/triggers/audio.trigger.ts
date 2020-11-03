import { Trigger } from '../common/types';
import { useSubtriggerReaction } from '../reactions/base/use-subtriggers.reaction';

export const audioTrigger = new Trigger({
    default: {
        guild: [useSubtriggerReaction],
        direct: []
    },
    sub: {
        guild: [],
        direct: []
    }
});