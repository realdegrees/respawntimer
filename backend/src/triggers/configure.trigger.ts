import { Trigger, TriggerMatch } from '../common/types';
import { configurePrefixReaction } from '../reactions/configure/prefix.reaction';
import { useSubtriggerReaction } from '../reactions/default/use-subtriggers.reaction';

export const configureTrigger = new Trigger({
    default: {
        guild: [useSubtriggerReaction],
        direct: []
    },
    sub: { // TODO: add 'commands' subTrigger to list all commands in an embed (include status enabled/disabled)
        guild: [configurePrefixReaction],
        direct: []
    }
}, {
    commandOptions: {
        command: ['config', 'configure'],
        match: TriggerMatch.STARTS_WITH
    },
    conditionCheck: (message) => {
        return message.guild ?
            Promise.resolve() :
            Promise.reject('This command only works in guilds!');
    }
});