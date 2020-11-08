import { Reaction } from '../../common/reaction';
import { notImplementedReaction } from '../default/not-implemented.reaction';

export const audioUpdateReaction = Reaction.create({name: 'update'}, notImplementedReaction);