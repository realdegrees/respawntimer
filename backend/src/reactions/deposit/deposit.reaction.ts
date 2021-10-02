import { GuildMessage, Reaction } from '../../common/reaction';

export const depositReaction = Reaction.create<GuildMessage, DepositInfo>({
    name: '',
    shortDescription: 'reaction when the deposit command is used'
}, {
    message: async (context, depositInfo) => {
        const amount = parseInt(context.args[0]);
        const currentRole = context.message.member.roles.cache
            .find((role) => role.name.startsWith('Gespendet'));
        if (currentRole) {
            context.message.member.roles.remove(currentRole);
        }
        await context.message.guild.roles.create({
            data: {
                name: 'Gespendet: ' + depositInfo.amount,
                color: 'YELLOW'
            },
            reason: 'Auto verteilung von rollen'
        }).then(context.message.member.roles.add);
        await context.message.channel.send(
            'Du hast ' + amount + ' eingezahlt.\nDu hast insgesamt ' +
            depositInfo.amount + ' gespendet.\nDeine Spenderrolle wurde entsprechend angepasst.'
        );
    }
}, {
    pre: async (context) =>
        context.trigger.db.firestore.doc<DepositInfo>([
            'guilds',
            context.message.guild.id,
            'bank',
            context.message.member.id
        ].join('/'))
            .then((depositInfo) => depositInfo ??
                context.trigger.db.firestore.store<DepositInfo>(
                    [
                        'guilds',
                        context.message.guild.id,
                        'bank',
                        context.message.member.id
                    ].join('/'),
                    { amount: parseInt(context.args[0]) }
                ))

});

export interface DepositInfo {
    amount: number;
}