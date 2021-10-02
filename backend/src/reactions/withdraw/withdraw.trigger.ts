import { Reaction } from '../../common/reaction';

export const withdrawReaction = Reaction.create({
    name: 'onWithdraw',
    shortDescription: 'reaction when the withdraw command is used'
}, {
    message: async (context) => {

    }
});