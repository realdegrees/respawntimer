import { Reaction } from '../../common/reaction';
import { notImplementedReaction } from '../default/not-implemented.reaction';

export const audioUpdateReaction = Reaction.create({
    name: 'update',
    shortDescription: 'Updates the link for the speicified command'
}, { message: notImplementedReaction });