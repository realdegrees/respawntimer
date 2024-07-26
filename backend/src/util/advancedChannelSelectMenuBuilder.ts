// import { StringSelectMenuOptionBuilder } from '@discordjs/builders';
// import { APISelectMenuOption, ActionRowBuilder, ButtonBuilder, ChannelSelectMenuBuilder, RestOrArray, SelectMenuComponentOptionData, StringSelectMenuBuilder } from 'discord.js';

// export class AdvancedChannelSelectMenuBuilder implements
//     Pick<StringSelectMenuBuilder, 'addOptions' | 'setCustomId' | 'setOptions' | 'setPlaceholder' | 'setDisabled'>,
//     Pick<ChannelSelectMenuBuilder, 'setChannelTypes'> {

//     private readonly options: StringSelectMenuOptionBuilder[];
//     private page: number = 0;
//     public constructor() { }
//     public addOptions(...options: RestOrArray<StringSelectMenuOptionBuilder | SelectMenuComponentOptionData | APISelectMenuOption>): StringSelectMenuBuilder {
//         throw new Error('Method not implemented.');
//     }
//     public setCustomId(customId: string): StringSelectMenuBuilder {
//         throw new Error('Method not implemented.');
//     }
//     public setOptions(...options: RestOrArray<StringSelectMenuOptionBuilder | SelectMenuComponentOptionData | APISelectMenuOption>): StringSelectMenuBuilder {
//         throw new Error('Method not implemented.');
//     }
//     public setPlaceholder(placeholder: string): StringSelectMenuBuilder {
//         throw new Error('Method not implemented.');
//     }
//     public setDisabled(disabled?: boolean | undefined): StringSelectMenuBuilder {
//         throw new Error('Method not implemented.');
//     }
//     public setPage(number: number): StringSelectMenuBuilder {
//     }
//     public getSelectionRow(): ActionRowBuilder<StringSelectMenuBuilder> {

//     }
//     public getPageButtonRow(): ActionRowBuilder<ButtonBuilder> {

//     }
// }