import { Reaction } from '../../common/reaction';

export const depositReaction = Reaction.create({
    name: 'onDeposit',
    shortDescription: 'reaction when the deposit command is used'
}, {
    message: async (context) => {
        let amount = context.args;
    }
});