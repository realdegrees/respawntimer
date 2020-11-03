import { Trigger, TriggerMatch } from '../common/types';
import { configurePrefixReaction } from '../reactions/configure/prefix.reaction';
import { useSubtriggerReaction } from '../reactions/base/use-subtriggers.reaction';

export const configureTrigger = new Trigger({
    default: {
        guild: [useSubtriggerReaction],
        direct: []
    },
    sub: {
        guild: [configurePrefixReaction],
        direct: []
    }
}, {
    commandOptions: {
        command: ['config', 'configure'],
        match: TriggerMatch.STARTS_WITH
    },
    conditionCheck: (message) => {
        return message.guild?.id ?
            Promise.resolve() :
            Promise.reject();
    }
});