import { Trigger, TriggerMatch } from '../common/types';
import { configurePrefixReaction } from '../reactions/configure/configure-prefix.reaction';
import { useSubtriggerReaction } from '../reactions/base/use-subtriggers.reaction';

export const configureTrigger = new Trigger({
    'default': [useSubtriggerReaction],
    'prefix': [configurePrefixReaction]
}, {
    commandOptions: {
        command: ['config', 'configure'],
        match: TriggerMatch.STARTS_WITH
    }
});